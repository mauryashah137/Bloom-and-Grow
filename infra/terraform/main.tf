terraform {
  required_version = ">= 1.5"
  required_providers {
    google = { source = "hashicorp/google", version = "~> 5.0" }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

variable "project_id"      { type = string }
variable "region"           { type = string; default = "us-central1" }
variable "app_name"         { type = string; default = "gemini-cx-agent" }
variable "allowed_origins"  { type = string; default = "*" }

resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com", "aiplatform.googleapis.com",
    "firestore.googleapis.com", "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
  ])
  service = each.value; disable_on_destroy = false
}

resource "google_service_account" "backend" {
  account_id   = "${var.app_name}-sa"
  display_name = "Gemini CX Agent Backend"
}

resource "google_project_iam_member" "vertex_ai" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.backend.email}"
}

resource "google_project_iam_member" "firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.backend.email}"
}

resource "google_artifact_registry_repository" "repo" {
  location = var.region; repository_id = "${var.app_name}-backend"; format = "DOCKER"
  depends_on = [google_project_service.apis]
}

resource "google_firestore_database" "default" {
  project = var.project_id; name = "(default)"
  location_id = "nam5"; type = "FIRESTORE_NATIVE"
  depends_on = [google_project_service.apis]
}

resource "google_cloud_run_v2_service" "backend" {
  name = "${var.app_name}-backend"; location = var.region
  template {
    service_account = google_service_account.backend.email
    scaling { min_instance_count = 0; max_instance_count = 10 }
    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${var.app_name}-backend/backend:latest"
      ports { container_port = 8080 }
      env { name = "GCP_PROJECT";      value = var.project_id }
      env { name = "GCP_LOCATION";     value = var.region }
      env { name = "ALLOWED_ORIGINS";  value = var.allowed_origins }
      resources { limits = { cpu = "2", memory = "1Gi" } }
    }
  }
  depends_on = [google_artifact_registry_repository.repo]
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  project = var.project_id; location = var.region
  name    = google_cloud_run_v2_service.backend.name
  role    = "roles/run.invoker"; member = "allUsers"
}

output "backend_url"    { value = google_cloud_run_v2_service.backend.uri }
output "backend_ws_url" { value = "wss://${replace(google_cloud_run_v2_service.backend.uri, "https://", "")}/ws" }
