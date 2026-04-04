#!/bin/bash
# =============================================================================
# GreenLeaf AI Concierge — One-Command Deploy Script
# Run this entirely in Google Cloud Shell (shell.cloud.google.com)
# No local install needed. Takes ~5 minutes.
# Usage: bash deploy.sh
# =============================================================================
set -e

BOLD='\033[1m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${BOLD}${BLUE}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${BLUE}║     GreenLeaf AI Concierge — Auto Deploy             ║${NC}"
echo -e "${BOLD}${BLUE}║     Gemini Live API on Vertex AI + Cloud Run         ║${NC}"
echo -e "${BOLD}${BLUE}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# ── Detect project ─────────────────────────────────────────────────────────
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ -z "$PROJECT_ID" ]; then
  echo -e "${RED}ERROR: No GCP project set.${NC}"
  echo "Run: gcloud config set project YOUR_PROJECT_ID"
  exit 1
fi
echo -e "${GREEN}✓ Project:${NC} $PROJECT_ID"

REGION="${REGION:-us-central1}"
SERVICE_NAME="gemini-cx-backend"
echo -e "${GREEN}✓ Region:${NC}  $REGION"
echo ""

# ── Enable APIs ────────────────────────────────────────────────────────────
echo -e "${BOLD}[1/6] Enabling GCP APIs...${NC}"
gcloud services enable \
  run.googleapis.com \
  aiplatform.googleapis.com \
  firestore.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  --project="$PROJECT_ID" --quiet
echo -e "${GREEN}✓ APIs enabled${NC}"

# ── Create Firestore DB ────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}[2/6] Setting up Firestore...${NC}"
gcloud firestore databases create --region=nam5 --project="$PROJECT_ID" --quiet 2>/dev/null || \
  echo -e "${YELLOW}  (Firestore already exists — OK)${NC}"
echo -e "${GREEN}✓ Firestore ready${NC}"

# ── Navigate to backend ───────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/backend"

# ── Deploy to Cloud Run ───────────────────────────────────────────────────
echo ""
echo -e "${BOLD}[3/6] Building & deploying backend to Cloud Run...${NC}"
echo -e "${YELLOW}  This takes about 3 minutes (building Docker image in the cloud)${NC}"

gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 2 \
  --min-instances 0 \
  --max-instances 10 \
  --port 8080 \
  --set-env-vars "GCP_PROJECT=${PROJECT_ID},GCP_LOCATION=${REGION}" \
  --project="$PROJECT_ID" \
  --quiet

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --format='value(status.url)')

echo -e "${GREEN}✓ Cloud Run deployed${NC}"
echo -e "  Service URL: ${BLUE}${SERVICE_URL}${NC}"

# ── Grant IAM permissions ─────────────────────────────────────────────────
echo ""
echo -e "${BOLD}[4/6] Granting Vertex AI & Firestore permissions...${NC}"

SA_EMAIL=$(gcloud run services describe "$SERVICE_NAME" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --format='value(spec.template.spec.serviceAccountName)')

# Retry up to 10s if SA not yet populated
for i in {1..5}; do
  if [ -n "$SA_EMAIL" ]; then break; fi
  sleep 2
  SA_EMAIL=$(gcloud run services describe "$SERVICE_NAME" \
    --region "$REGION" --project "$PROJECT_ID" \
    --format='value(spec.template.spec.serviceAccountName)')
done

if [ -z "$SA_EMAIL" ]; then
  # Fall back to default compute SA
  PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
  SA_EMAIL="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
fi

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/aiplatform.user" \
  --quiet > /dev/null

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/datastore.user" \
  --quiet > /dev/null

echo -e "${GREEN}✓ Permissions granted to: ${SA_EMAIL}${NC}"

# ── Health check ──────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}[5/6] Checking backend health...${NC}"
sleep 5  # let Cloud Run warm up
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${SERVICE_URL}/health")
if [ "$HTTP_STATUS" = "200" ]; then
  echo -e "${GREEN}✓ Backend is healthy (HTTP 200)${NC}"
else
  echo -e "${YELLOW}  Backend returned HTTP $HTTP_STATUS — it may still be warming up. Check: ${SERVICE_URL}/health${NC}"
fi

# ── Build Vercel deploy URL ───────────────────────────────────────────────
WS_URL="wss://$(echo "$SERVICE_URL" | sed 's|https://||')/ws"

VERCEL_DEPLOY_URL="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FYOUR_GITHUB_USERNAME%2Fgemini-cx-agent&root-directory=frontend&env=NEXT_PUBLIC_WS_URL&envDescription=WebSocket+URL+of+your+Cloud+Run+backend&envLink=https%3A%2F%2Fgithub.com%2FYOUR_GITHUB_USERNAME%2Fgemini-cx-agent%23deploy"

# ── Print summary ─────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}[6/6] Done! Here's your deployment summary:${NC}"
echo ""
echo -e "${BOLD}${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}  BACKEND (Cloud Run)${NC}"
echo -e "${GREEN}  Service URL:   ${BLUE}${SERVICE_URL}${NC}"
echo -e "${GREEN}  Health check:  ${BLUE}${SERVICE_URL}/health${NC}"
echo -e "${GREEN}  WebSocket URL: ${BLUE}${WS_URL}${NC}"
echo ""
echo -e "${BOLD}${GREEN}  FRONTEND (Vercel) — complete in your browser:${NC}"
echo -e "${GREEN}  1. Go to: ${BLUE}https://vercel.com/new${NC}"
echo -e "${GREEN}  2. Import your GitHub repo (root dir: frontend)${NC}"
echo -e "${GREEN}  3. Set env variable:${NC}"
echo -e "${YELLOW}       NEXT_PUBLIC_WS_URL = ${WS_URL}${NC}"
echo -e "${GREEN}  4. Click Deploy${NC}"
echo ""
echo -e "${BOLD}${GREEN}  To lock CORS (recommended before sharing):${NC}"
echo -e "${YELLOW}  gcloud run services update $SERVICE_NAME --region $REGION \\"
echo -e "    --update-env-vars ALLOWED_ORIGINS=https://YOUR_VERCEL_URL${NC}"
echo -e "${BOLD}${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""

# Save the WS_URL to a file for easy reference
echo "$WS_URL" > /tmp/gemini_cx_ws_url.txt
echo -e "${BLUE}WebSocket URL saved to: /tmp/gemini_cx_ws_url.txt${NC}"
echo -e "${BLUE}Run 'cat /tmp/gemini_cx_ws_url.txt' to view it again.${NC}"
echo ""
