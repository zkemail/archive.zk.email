output "GOOGLE_CLOUD_PROJECT_ID" {
  description = "The GCP project ID"
  value       = var.project_id
  sensitive   = true
}

output "GOOGLE_CLOUD_REGION" {
  description = "The GCP region"
  value       = var.region
  sensitive   = true
}

output "CLOUD_TASKS_QUEUE_NAME" {
  description = "The name of the Cloud Tasks queue"
  value       = google_cloud_tasks_queue.gcd_calculator_queue.name
  sensitive   = true
}

output "CLOUD_FUNCTION_URL" {
  description = "The URL of the Cloud Function"
  value       = google_cloudfunctions2_function.gcd_calculator.service_config[0].uri
  sensitive   = true
}

output "TASKS_SERVICE_ACCOUNT_EMAIL" {
  description = "Email of the service account used by Cloud Tasks"
  value       = google_service_account.tasks_sa.email
  sensitive   = true
}