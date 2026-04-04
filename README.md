# Bloom & Grow AI Concierge — Gemini CX Agent v4

Real-time multimodal AI shopping and support agent built on Google's **Gemini Live API** on **Vertex AI**. Inspired by Google's Customer Experience Agent demo.

## What this does

One intelligent interface handles the full customer lifecycle: **product discovery → visual identification → personalized recommendations → cart building → promotions & loyalty → checkout → order tracking → post-purchase support → human escalation** — all connected through a single conversation context.

## Feature Status

| Feature | Implementation |
|---|---|
| Real-time voice (bidirectional audio) | ✅ Gemini Live API |
| Live camera feed (Gemini sees what you see) | ✅ Video frames to Gemini |
| Image upload for identification | ✅ Gemini Vision analysis |
| Plant & product identification | ✅ Real Gemini multimodal with structured output |
| Personalized recommendations | ✅ Deep personalization engine (profile, cart, vision, budget, skill) |
| Shopping cart (add/remove/update) | ✅ Full cart lifecycle with pricing service |
| Promo code validation & application | ✅ Tier-aware with policy checks |
| Manager discount approval workflow | ✅ Live session-keyed with real-time resolution events |
| Order creation & checkout | ✅ Full lifecycle: cart → checkout → order → confirmation |
| Order history & tracking | ✅ Persistent orders with status tracking |
| Refund processing | ✅ Policy-checked with eligibility rules |
| Returns initiation | ✅ With shipping label generation |
| Service booking | ✅ Consultation, planting, installation, repair, delivery |
| Care guide emails | ✅ Notification service (production: wire SendGrid/SES) |
| Human escalation with context | ✅ Full context preservation (transcript, cart, recs, vision) |
| Manager console | ✅ Session context, customer profile, cart snapshot, journey summary |
| Session persistence | ✅ Firestore with in-memory fallback |
| Journey event tracking | ✅ Full event timeline (vision, recs, cart, orders, handoffs) |
| Shop mode + Support mode | ✅ Mode-aware tool gating and personas |
| Policy engine | ✅ Tier-based discount limits, refund eligibility, escalation rules |

### What requires external integration for production

| Feature | What to connect |
|---|---|
| Email delivery | SendGrid, SES, or Cloud Tasks |
| Payment processing | Stripe, Square, etc. |
| Product images | CDN (currently using emoji placeholders) |
| Real inventory | Shopify, WooCommerce, or your database |
| Calendar booking | Google Calendar API |
| Support ticketing | Zendesk, ServiceNow |
| Human agent queue | Your contact center system |

## Architecture

```
Browser (Next.js)                  Cloud Run (FastAPI)              Vertex AI
─────────────────                  ──────────────────              ─────────
Voice (PCM 16kHz)  ─── WebSocket ─→ FastAPI proxy    ─── Live WS ─→ gemini-live-2.5-flash
Video frames       ─── WebSocket ─→   ↓ Services:                 ←─ Audio + transcripts
Image uploads      ─── WebSocket ─→   • VisionService (Gemini)    ←─ Tool calls
Text messages      ─── WebSocket ─→   • RecommenderService
                   ←── WebSocket ──   • CartService + PricingService
                                      • OrderService
REST APIs:                            • OfferService + PolicyService
  /api/products                       • ApprovalService (live events)
  /api/cart/*                         • BookingService
  /api/orders/*                       • RefundService + ReturnsService
  /api/checkout/*                     • NotificationService
  /api/manager/*                      • HandoffService
  /api/customers/*
                                   Store: Firestore (sessions, carts, customers,
                                          orders, bookings, handoffs, notifications)
```

## Deploy

### Backend → Cloud Run

```bash
cd backend
gcloud services enable run.googleapis.com aiplatform.googleapis.com \
  firestore.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com

gcloud run deploy gemini-cx-backend \
  --source . --region us-central1 --allow-unauthenticated \
  --memory 1Gi --cpu 2 \
  --set-env-vars "GCP_PROJECT=$(gcloud config get-value project),GCP_LOCATION=us-central1"

gcloud firestore databases create --region=nam5
```

### Frontend → Vercel

1. Import repo at vercel.com/new, set root directory to `frontend`
2. Set env: `NEXT_PUBLIC_WS_URL=wss://YOUR-CLOUD-RUN-URL.run.app/ws`
3. Deploy

## File structure

```
├── backend/
│   ├── main.py              # FastAPI: WebSocket + all REST endpoints
│   ├── gemini_live.py       # Gemini Live session: audio/video/tools, mode-aware
│   ├── tools.py             # Thin dispatcher → service calls
│   ├── catalog.py           # 20 garden products
│   ├── cart.py              # Cart data layer (Firestore)
│   ├── approvals.py         # Approval queue data layer
│   ├── session_store.py     # Session + customer + journey event persistence
│   ├── services/
│   │   ├── vision_service.py       # Gemini multimodal plant/product ID
│   │   ├── catalog_service.py      # Search, complementary, similar
│   │   ├── cart_service.py         # Full cart lifecycle + pricing
│   │   ├── order_service.py        # Order creation, lookup, status
│   │   ├── offer_service.py        # Promo code validation + tier checks
│   │   ├── approval_service.py     # Live discount approval loop
│   │   ├── booking_service.py      # Service scheduling
│   │   ├── notification_service.py # Email notifications
│   │   ├── handoff_service.py      # Human escalation with context
│   │   ├── recommender_service.py  # Deep personalization engine
│   │   ├── policy_service.py       # Business rules engine
│   │   ├── pricing_service.py      # Tax, shipping, totals
│   │   ├── refund_service.py       # Policy-checked refund processing
│   │   └── returns_service.py      # Return initiation
│   └── Dockerfile
├── frontend/
│   ├── src/app/
│   │   ├── page.tsx           # Home: categories + featured products
│   │   ├── shop/page.tsx      # Product catalog with filtering
│   │   ├── product/[id]/      # Product detail with complementary products
│   │   ├── cart/page.tsx      # Full cart page
│   │   ├── checkout/page.tsx  # Checkout → real order creation → confirmation
│   │   ├── orders/page.tsx    # Order history with tracking
│   │   ├── support/page.tsx   # Support with real order data
│   │   └── manager/page.tsx   # Manager console: approvals, handoffs, session context
│   ├── src/components/
│   │   ├── agent/AgentPanel.tsx     # AI assistant: voice, camera, cards, text input
│   │   ├── layout/StorefrontLayout  # Nav, promo bar, agent integration
│   │   └── shop/CartDrawer.tsx      # Slide-out cart with promo code
│   ├── src/hooks/useGeminiSession   # WebSocket + audio/video + all event handling
│   ├── src/store/index.ts           # Zustand state management
│   └── src/lib/types.ts             # Shared TypeScript type definitions
└── infra/terraform/
```
