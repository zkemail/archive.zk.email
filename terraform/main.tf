terraform {
  required_version = ">= 1.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }
}


# Provider configuration
provider "google" {
  project = var.project_id
  region  = var.region
}

# Enable required APIs
resource "google_project_service" "required_apis" {
  for_each = toset([
    "cloudfunctions.googleapis.com",
    "cloudtasks.googleapis.com",
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com",
    "run.googleapis.com",
    "eventarc.googleapis.com",
    "pubsub.googleapis.com"
  ])

  service                    = each.value
  disable_dependent_services = false
  disable_on_destroy         = false
}

# Create service account for Cloud Function
resource "google_service_account" "function_sa" {
  account_id   = "gcd-calculator-function-${var.environment}"
  display_name = "gcd Calculator Cloud Function Service Account"
  description  = "Service account for gcd calculator cloud function"
}

# Create service account for Cloud Tasks
resource "google_service_account" "tasks_sa" {
  account_id   = "gcd-calculator-tasks-${var.environment}"
  display_name = "gcd Calculator Cloud Tasks Service Account"
  description  = "Service account for Cloud Tasks to invoke cloud function"
}

# IAM bindings for function service account
resource "google_project_iam_member" "function_sa_roles" {
  for_each = toset([
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
    "roles/cloudtrace.agent"
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.function_sa.email}"
}

# IAM binding for tasks service account to invoke functions
resource "google_project_iam_member" "tasks_function_invoker" {
  project = var.project_id
  role    = "roles/cloudfunctions.invoker"
  member  = "serviceAccount:${google_service_account.tasks_sa.email}"
}

# IAM binding for Next.js service account to create tasks
resource "google_project_iam_member" "nextjs_tasks_enqueuer" {
  project = var.project_id
  role    = "roles/cloudtasks.enqueuer"
  member  = "serviceAccount:${var.nextjs_service_account_email}"
}

# Create Cloud Storage bucket for function source
resource "google_storage_bucket" "function_source" {
  name                        = "${var.project_id}-gcd-calculator-source-${var.environment}"
  location                    = var.region
  force_destroy               = true
  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type = "Delete"
    }
  }
}

# Create archive of cloud function source
data "archive_file" "function_source" {
  type        = "zip"
  output_path = "/tmp/gcd-calculator-function.zip"
  source_dir  = "../cloudFunctions/calculate_gcd"
  excludes = [
    "__pycache__",
    "*.pyc",
    ".git",
  ]
}

# Upload function source to bucket
resource "google_storage_bucket_object" "function_source" {
  name   = "gcd-calculator-function-${data.archive_file.function_source.output_md5}.zip"
  bucket = google_storage_bucket.function_source.name
  source = data.archive_file.function_source.output_path

  depends_on = [data.archive_file.function_source]
}

# Create the Cloud Function
resource "google_cloudfunctions2_function" "gcd_calculator" {
  name        = "gcd-calculator-${var.environment}"
  location    = var.region
  description = "gcd modulus calculator function"

  build_config {
    runtime     = "python311"
    entry_point = "calculate_gcd"
    source {
      storage_source {
        bucket = google_storage_bucket.function_source.name
        object = google_storage_bucket_object.function_source.name
      }
    }
  }

  service_config {
    max_instance_count               = 100
    min_instance_count               = 0
    available_memory                 = "512Mi"
    timeout_seconds                  = 300
    max_instance_request_concurrency = 80
    available_cpu                    = "1"

    environment_variables = {
      ENVIRONMENT = var.environment
    }

    ingress_settings               = "ALLOW_INTERNAL_AND_GCLB"
    all_traffic_on_latest_revision = true
    service_account_email          = google_service_account.function_sa.email
  }

  depends_on = [
    google_project_service.required_apis,
    google_storage_bucket_object.function_source
  ]
}

resource "random_id" "queue_suffix" {
  byte_length = 2
}

# Create Cloud Tasks queue
resource "google_cloud_tasks_queue" "gcd_calculator_queue" {
  name     = "gcd-calculator-queue-${var.environment}-${random_id.queue_suffix.hex}"
  location = var.region

  rate_limits {
    max_concurrent_dispatches = 100
    max_dispatches_per_second = 10
  }

  retry_config {
    max_attempts       = 3
    max_retry_duration = "300s"
    max_backoff        = "60s"
    min_backoff        = "5s"
    max_doublings      = 3
  }

  depends_on = [google_project_service.required_apis]
}

# IAM policy to allow tasks service account to invoke the function
resource "google_cloudfunctions2_function_iam_member" "tasks_invoker" {
  project        = var.project_id
  location       = google_cloudfunctions2_function.gcd_calculator.location
  cloud_function = google_cloudfunctions2_function.gcd_calculator.name
  role           = "roles/cloudfunctions.invoker"
  member         = "serviceAccount:${google_service_account.tasks_sa.email}"
}

data "google_cloud_run_service" "function_service" {
  name     = google_cloudfunctions2_function.gcd_calculator.name
  location = google_cloudfunctions2_function.gcd_calculator.location

  depends_on = [google_cloudfunctions2_function.gcd_calculator]
}

# Grant Cloud Run invoker permission to the underlying Cloud Run service
resource "google_cloud_run_service_iam_member" "function_run_invoker" {
  location = data.google_cloud_run_service.function_service.location
  project  = var.project_id
  service  = data.google_cloud_run_service.function_service.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.tasks_sa.email}"
}
