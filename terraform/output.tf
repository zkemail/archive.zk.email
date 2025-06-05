output "function_url" {
  description = "The URL of the Cloud Function"
  value       = google_cloudfunctions2_function.gcd_calculator.service_config[0].uri
}

output "function_name" {
  description = "The name of the Cloud Function"
  value       = google_cloudfunctions2_function.gcd_calculator.name
}

output "queue_name" {
  description = "The full name of the Cloud Tasks queue"
  value       = google_cloud_tasks_queue.gcd_calculator_queue.id
}

output "queue_location" {
  description = "The location of the Cloud Tasks queue"
  value       = google_cloud_tasks_queue.gcd_calculator_queue.location
}

output "tasks_service_account_email" {
  description = "Email of the service account used by Cloud Tasks"
  value       = google_service_account.tasks_sa.email
}

output "function_service_account_email" {
  description = "Email of the service account used by Cloud Function"
  value       = google_service_account.function_sa.email
}