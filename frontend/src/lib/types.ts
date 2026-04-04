/**
 * Shared event type definitions — used by both frontend and backend.
 * Normalized schema for all live WebSocket events.
 */

// ── Event Types ─────────────────────────────────────────────────────────────
export type EventType =
  | "session_started"
  | "audio_chunk"
  | "transcript"
  | "tool_call"
  | "sentiment"
  | "vision_result"
  | "recommendation"
  | "cart_updated"
  | "discount_pending"
  | "discount_resolved"
  | "booking_confirmed"
  | "order_created"
  | "handoff_created"
  | "session_ended"
  | "error";

export interface BaseEvent {
  type: EventType;
  ts?: number;
}

export interface SessionStartedEvent extends BaseEvent {
  type: "session_started";
  session_id: string;
  customer?: CustomerProfile;
}

export interface AudioChunkEvent extends BaseEvent {
  type: "audio_chunk";
  data: string; // base64 PCM 24kHz
}

export interface TranscriptEvent extends BaseEvent {
  type: "transcript";
  role: "user" | "agent";
  text: string;
  final: boolean;
}

export interface ToolCallEvent extends BaseEvent {
  type: "tool_call";
  tool: string;
  args: Record<string, any>;
  result?: Record<string, any>;
  status: "running" | "success" | "error";
}

export interface SentimentEvent extends BaseEvent {
  type: "sentiment";
  value: Sentiment;
}

export interface VisionResultEvent extends BaseEvent {
  type: "vision_result";
  candidates: VisionCandidate[];
  health_assessment?: HealthAssessment;
  issue_detected: string;
  catalog_matches: Product[];
  next_question: string;
  care_tips: string[];
}

export interface RecommendationEvent extends BaseEvent {
  type: "recommendation";
  products: Product[];
  complementary?: Product[];
  context?: RecommendationContext;
}

export interface CartUpdatedEvent extends BaseEvent {
  type: "cart_updated";
  cart: Cart;
}

export interface DiscountPendingEvent extends BaseEvent {
  type: "discount_pending";
  request_id: string;
  amount: number;
  reason: string;
}

export interface DiscountResolvedEvent extends BaseEvent {
  type: "discount_resolved";
  request_id: string;
  approved: boolean;
  discount_pct: number;
  note: string;
}

export interface BookingConfirmedEvent extends BaseEvent {
  type: "booking_confirmed";
  booking: Booking;
}

export interface OrderCreatedEvent extends BaseEvent {
  type: "order_created";
  order: Order;
}

export interface HandoffCreatedEvent extends BaseEvent {
  type: "handoff_created";
  handoff_id: string;
  queue_position: number;
  estimated_wait_minutes: number;
  specialist_type: string;
}

export interface SessionEndedEvent extends BaseEvent {
  type: "session_ended";
  summary: Record<string, any>;
}

export interface ErrorEvent extends BaseEvent {
  type: "error";
  message: string;
}

// ── Data Types ──────────────────────────────────────────────────────────────
export type Sentiment = "positive" | "neutral" | "negative" | "frustrated";

export interface VisionCandidate {
  name: string;
  scientific_name?: string;
  confidence: number;
  category: string;
  description: string;
}

export interface HealthAssessment {
  status: "healthy" | "minor_issues" | "needs_attention" | "critical";
  observations: string[];
  recommendations: string[];
}

export interface RecommendationContext {
  skill_level: string;
  budget_max: number | null;
  garden_type: string;
  loyalty_tier: string;
  vision_informed: boolean;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  sale_price: number | null;
  rating: number;
  review_count: number;
  description: string;
  image_url: string;
  images?: string[];
  tags: string[];
  skill_level: string;
  care?: Record<string, string>;
  stock?: number;
  unit?: string;
  recommendation_reasons?: string[];
  relevance_score?: number;
  complementary_products?: Product[];
  match_reason?: string;
}

export interface CartItem {
  product_id: string;
  name: string;
  price: number;
  qty: number;
  image_url: string;
  added_by_agent?: boolean;
}

export interface Cart {
  customer_id: string;
  items: CartItem[];
  subtotal: number;
  discount_pct: number;
  discount_amount?: number;
  tax?: number;
  shipping?: number;
  total?: number;
  offer_code: string | null;
  free_shipping_eligible?: boolean;
}

export interface CustomerProfile {
  customer_id: string;
  name: string;
  email: string;
  loyalty_tier: string;
  loyalty_points: number;
  total_orders: number;
  member_since: string;
  preferences?: {
    skill_level: string;
    garden_type: string;
    budget_range: string;
  };
  support_history?: Array<{
    date: string;
    issue: string;
    resolution: string;
  }>;
}

export interface Order {
  order_id: string;
  customer_id: string;
  status: string;
  items: Array<{
    product_id: string;
    name: string;
    qty: number;
    price: number;
  }>;
  subtotal: number;
  tax: number;
  discount_pct: number;
  total: number;
  shipping: {
    method: string;
    carrier?: string;
    tracking_number?: string;
    estimated_delivery?: string;
    status: string;
  };
  payment: {
    method: string;
    last4: string;
    status: string;
  };
  contact?: {
    email?: string;
    phone?: string;
    first_name?: string;
    last_name?: string;
  };
  placed_at: number | string;
  updated_at: number | string;
}

export interface Booking {
  booking_id: string;
  service_type: string;
  service_name: string;
  price: number;
  confirmed_date: string;
  confirmed_time: string;
  specialist: string;
  duration: string;
  notes: string;
  confirmation_email_sent: boolean;
}

export interface DiscountRequest {
  request_id: string;
  discount_pct: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
  auto_approved?: boolean;
}

export interface TranscriptEntry {
  id: string;
  role: "user" | "agent";
  text: string;
  ts: number;
}

export interface AgentActionCard {
  id: string;
  type: "recommendation" | "cart_confirm" | "camera_request" | "offer" | "booking" | "service_offer" | "text" | "vision" | "discount_status" | "handoff" | "order";
  title?: string;
  products?: Product[];
  items?: CartItem[];
  message?: string;
  booking?: Booking;
  order?: Order;
  visionResult?: VisionResultEvent;
  discountRequest?: DiscountRequest;
  ts: number;
}
