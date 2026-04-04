"""
Gemini CX Agent — Backend v4
Full production implementation: voice, video, image, tool calling,
session persistence, checkout, orders, refunds, approvals, handoffs.
"""
import asyncio, base64, json, logging, os, time, uuid
from typing import Optional
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from gemini_live import GeminiLiveSession
from session_store import SessionStore
from tools import ToolDispatcher
from catalog import ProductCatalog
from cart import CartManager
from approvals import ApprovalQueue
from services.vision_service import VisionService
from services.catalog_service import CatalogService
from services.cart_service import CartService
from services.order_service import OrderService
from services.offer_service import OfferService
from services.approval_service import ApprovalService
from services.booking_service import BookingService
from services.notification_service import NotificationService
from services.handoff_service import HandoffService
from services.recommender_service import RecommenderService
from services.policy_service import PolicyService
from services.pricing_service import PricingService
from services.refund_service import RefundService
from services.returns_service import ReturnsService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Gemini CX Agent", version="4.0.0")

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS,
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# ── Initialize core data layer ────────────────────────────────────────────────
session_store   = SessionStore()
catalog         = ProductCatalog()
cart_manager    = CartManager()
approval_queue  = ApprovalQueue()

# ── Initialize services ───────────────────────────────────────────────────────
policy_service       = PolicyService()
pricing_service      = PricingService()
catalog_service      = CatalogService(catalog)
cart_service         = CartService(cart_manager, pricing_service)
order_service        = OrderService()
offer_service        = OfferService(cart_service, policy_service)
vision_service       = VisionService(catalog_service)
booking_service      = BookingService()
notification_service = NotificationService()
handoff_service      = HandoffService(session_store)
recommender_service  = RecommenderService(catalog_service)
refund_service       = RefundService(order_service, policy_service, notification_service)
returns_service      = ReturnsService(order_service, refund_service)
approval_service     = ApprovalService(approval_queue, cart_service, policy_service)

# ── Initialize tool dispatcher with all services ──────────────────────────────
tool_dispatcher = ToolDispatcher(
    vision_service=vision_service,
    catalog_service=catalog_service,
    cart_service=cart_service,
    order_service=order_service,
    offer_service=offer_service,
    approval_service=approval_service,
    booking_service=booking_service,
    notification_service=notification_service,
    handoff_service=handoff_service,
    recommender_service=recommender_service,
    policy_service=policy_service,
    refund_service=refund_service,
)

# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "service": "gemini-cx-agent-backend", "version": "4.0.0"}


# ═══════════════════════════════════════════════════════════════════════════════
# WEBSOCKET — Main real-time session
# ═══════════════════════════════════════════════════════════════════════════════
@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    """
    Protocol (JSON frames):

    Browser → Backend:
      {type:"config", voice, language, customer_id?, mode:"shop"|"support"}
      {type:"audio_chunk",  data:<base64 PCM 16kHz>}
      {type:"video_frame",  data:<base64 JPEG>}
      {type:"image_upload", data:<base64>, mime_type}
      {type:"text",         content}
      {type:"interrupt"}
      {type:"end_session"}

    Backend → Browser:
      {type:"session_started",   session_id, customer?}
      {type:"audio_chunk",       data:<base64 PCM 24kHz>}
      {type:"transcript",        role, text, final, ts}
      {type:"tool_call",         tool, args, result?, status, ts}
      {type:"sentiment",         value}
      {type:"vision_result",     candidates, catalog_matches, next_question, ts}
      {type:"cart_updated",      cart}
      {type:"discount_pending",  request_id, amount, reason}
      {type:"discount_resolved", request_id, approved, discount_pct, note}
      {type:"recommendation",    products, complementary?, context?}
      {type:"booking_confirmed", booking}
      {type:"order_created",     order}
      {type:"handoff_created",   handoff_id, queue_position, estimated_wait_minutes}
      {type:"session_ended",     summary}
      {type:"error",             message}
    """
    await ws.accept()
    session_id = f"sess_{uuid.uuid4().hex[:12]}"
    gemini: Optional[GeminiLiveSession] = None

    try:
        raw    = await asyncio.wait_for(ws.receive_text(), timeout=10.0)
        config = json.loads(raw)
        if config.get("type") != "config":
            await ws.send_json({"type": "error", "message": "First message must be type=config"})
            return

        customer_id = config.get("customer_id", f"guest_{uuid.uuid4().hex[:8]}")
        mode        = config.get("mode", "shop")
        voice       = config.get("voice", "Aoede")
        language    = config.get("language", "en-US")

        # Load customer and cart context
        customer = await session_store.get_or_create_customer(customer_id)
        cart     = await cart_manager.get_or_create(customer_id)
        orders   = await order_service.list_customer_orders(customer_id, limit=3)

        persona = build_persona(mode, customer, cart, orders)

        gemini = GeminiLiveSession(
            session_id=session_id,
            voice=voice,
            language=language,
            system_instruction=persona,
            tool_dispatcher=tool_dispatcher,
            session_store=session_store,
            catalog=catalog,
            cart_manager=cart_manager,
            approval_queue=approval_queue,
            customer_id=customer_id,
            mode=mode,
        )

        # Register for live approval events — goes to approval_queue so Gemini can speak about it
        ApprovalService.register_session_listener(session_id, gemini._approval_queue)

        await session_store.create_session(session_id, {
            "started_at": time.time(),
            "customer_id": customer_id,
            "mode": mode,
            "voice": voice,
            "language": language,
        })

        await ws.send_json({
            "type": "session_started",
            "session_id": session_id,
            "customer": customer,
        })
        await run_relay(ws, gemini, session_id)

    except WebSocketDisconnect:
        logger.info(f"Client disconnected: {session_id}")
    except asyncio.TimeoutError:
        await ws.send_json({"type": "error", "message": "Config timeout"})
    except Exception as e:
        logger.exception(f"Session error {session_id}: {e}")
        try:
            await ws.send_json({"type": "error", "message": str(e)})
        except:
            pass
    finally:
        ApprovalService.unregister_session_listener(session_id)
        if gemini:
            summary = await gemini.close()
            await session_store.close_session(session_id, summary)
            try:
                await ws.send_json({"type": "session_ended", "summary": summary})
            except:
                pass


async def run_relay(ws: WebSocket, gemini: "GeminiLiveSession", session_id: str):
    """Relay messages between browser WebSocket and Gemini Live session."""
    stop_event = asyncio.Event()

    async def keepalive():
        """Send periodic pings to keep WebSocket alive through load balancers."""
        while not stop_event.is_set():
            try:
                await asyncio.sleep(15)
                if not stop_event.is_set():
                    await ws.send_json({"type": "ping"})
            except Exception:
                break

    async def browser_to_gemini():
        while not stop_event.is_set():
            try:
                raw = await ws.receive_text()
                msg = json.loads(raw)
                t   = msg.get("type")
                if   t == "audio_chunk":  await gemini.send_audio(msg["data"])
                elif t == "sample_rate":
                    rate = msg.get("rate", 16000)
                    gemini.set_audio_sample_rate(rate)
                    logger.info(f"[{session_id}] Client audio sample rate: {rate}")
                elif t == "video_frame":  await gemini.send_video_frame(msg["data"])
                elif t == "image_upload":
                    await gemini.send_image(msg["data"], msg.get("mime_type", "image/jpeg"))
                    await session_store.append_event(session_id, "asset_upload", {
                        "mime_type": msg.get("mime_type", "image/jpeg"),
                    })
                elif t == "text":         await gemini.send_text(msg["content"])
                elif t == "interrupt":    await gemini.interrupt()
                elif t == "end_session":  break
            except WebSocketDisconnect:
                break
            except Exception as e:
                if "1000" not in str(e):  # Ignore normal close codes
                    logger.error(f"b→g error: {e}")
                break
        stop_event.set()

    async def gemini_to_browser():
        g2b_count = 0
        logger.info(f"[{session_id}] g→b relay started")
        async for event in gemini.event_stream():
            if stop_event.is_set():
                break
            try:
                g2b_count += 1
                et = event.get("type", "?")
                if g2b_count <= 5 or et != "audio_chunk":
                    logger.info(f"[{session_id}] g→b #{g2b_count}: {et}")
                await ws.send_json(event)

                # Persist events
                et = event.get("type")
                if et == "transcript" and event.get("final"):
                    await session_store.append_transcript(session_id, event)
                elif et == "tool_call":
                    await session_store.append_tool_call(session_id, event)
                elif et == "recommendation":
                    await session_store.append_recommendation_event(
                        session_id, event.get("products", [])
                    )
                elif et == "cart_updated":
                    await session_store.append_cart_event(
                        session_id, "updated", event.get("cart", {})
                    )
                elif et == "vision_result":
                    await session_store.append_vision_event(session_id, event)
                elif et == "order_created":
                    await session_store.append_order_event(
                        session_id, event.get("order_id", ""), "created"
                    )
                elif et == "handoff_created":
                    await session_store.append_handoff_event(
                        session_id, event.get("handoff_id", ""), event.get("specialist_type", "")
                    )
                elif et == "sentiment":
                    await session_store.append_sentiment(session_id, event.get("value", "neutral"))

            except WebSocketDisconnect:
                break
            except Exception as e:
                if "1000" not in str(e):
                    logger.error(f"g→b error: {e}")
                break
        stop_event.set()

    # Run relay + keepalive concurrently, stop when relay ends
    ka = asyncio.create_task(keepalive())
    tasks = [asyncio.create_task(browser_to_gemini()), asyncio.create_task(gemini_to_browser())]
    await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    stop_event.set()
    ka.cancel()
    for t in tasks:
        t.cancel()


# ═══════════════════════════════════════════════════════════════════════════════
# REST — Products
# ═══════════════════════════════════════════════════════════════════════════════
@app.get("/api/products")
async def list_products(category: str = None, q: str = None, limit: int = 20):
    return {"products": await catalog.search(query=q, category=category, limit=limit)}

@app.get("/api/products/{product_id}")
async def get_product(product_id: str):
    p = await catalog.get(product_id)
    if not p:
        raise HTTPException(404, "Product not found")
    comps = await catalog_service.find_complementary(product_id, limit=3)
    p["complementary_products"] = comps
    return p


# ═══════════════════════════════════════════════════════════════════════════════
# REST — Cart
# ═══════════════════════════════════════════════════════════════════════════════
@app.get("/api/cart/{customer_id}")
async def get_cart(customer_id: str):
    cart = await cart_service.get_cart(customer_id)
    return await pricing_service.compute_totals(cart)

@app.post("/api/cart/{customer_id}/add")
async def add_to_cart(customer_id: str, body: dict):
    result = await cart_service.add_item(customer_id, body["product_id"], body.get("qty", 1))
    return result

@app.delete("/api/cart/{customer_id}/item/{product_id}")
async def remove_from_cart(customer_id: str, product_id: str):
    return await cart_service.remove_item(customer_id, product_id)

@app.put("/api/cart/{customer_id}/item/{product_id}")
async def update_cart_qty(customer_id: str, product_id: str, body: dict):
    return await cart_service.update_quantity(customer_id, product_id, body.get("qty", 1))

@app.post("/api/cart/{customer_id}/apply-offer")
async def apply_offer(customer_id: str, body: dict):
    customer = await session_store.get_or_create_customer(customer_id)
    tier = customer.get("loyalty_tier", "Standard")
    cart = await cart_service.get_cart(customer_id)
    return await offer_service.validate_and_apply(
        code=body.get("code", ""),
        customer_id=customer_id,
        customer_tier=tier,
        cart_subtotal=cart.get("subtotal", 0),
    )


# ═══════════════════════════════════════════════════════════════════════════════
# REST — Checkout & Orders
# ═══════════════════════════════════════════════════════════════════════════════
@app.post("/api/checkout/session")
async def create_checkout_session(body: dict):
    """Create a checkout session with pricing preview."""
    customer_id = body.get("customer_id")
    cart = await cart_service.get_cart(customer_id)
    cart = await pricing_service.compute_totals(cart)
    return {
        "session_id": f"cs_{uuid.uuid4().hex[:12]}",
        "cart": cart,
        "customer_id": customer_id,
    }

@app.post("/api/orders")
async def create_order(body: dict):
    """Create an order from checkout."""
    customer_id = body.get("customer_id")
    cart = await cart_service.get_cart(customer_id)
    shipping = body.get("shipping", {"method": "pickup", "cost": 0})
    payment = body.get("payment", {"method": "card", "last4": "4242"})

    order = await order_service.create_order(customer_id, cart, shipping, payment)

    # Send confirmation email
    customer = await session_store.get_or_create_customer(customer_id)
    await notification_service.send_order_confirmation(
        customer_id=customer_id,
        customer_email=customer.get("email", ""),
        order=order,
    )

    # Clear cart after order
    await cart_service.clear_cart(customer_id)

    return order

@app.get("/api/orders/{order_id}")
async def get_order(order_id: str):
    order = await order_service.get_order(order_id)
    if not order:
        raise HTTPException(404, "Order not found")
    return order

@app.get("/api/orders")
async def list_orders(customer_id: str = None, limit: int = 10):
    if customer_id:
        return {"orders": await order_service.list_customer_orders(customer_id, limit)}
    return {"orders": []}

@app.get("/api/customers/{customer_id}/orders")
async def get_customer_orders(customer_id: str, limit: int = 10):
    return {"orders": await order_service.list_customer_orders(customer_id, limit)}


# ═══════════════════════════════════════════════════════════════════════════════
# REST — Refunds & Returns
# ═══════════════════════════════════════════════════════════════════════════════
@app.post("/api/refunds")
async def process_refund(body: dict):
    customer_id = body.get("customer_id")
    customer = await session_store.get_or_create_customer(customer_id)
    return await refund_service.process_refund(
        order_id=body.get("order_id"),
        reason=body.get("reason", "Customer request"),
        amount=body.get("amount"),
        customer_id=customer_id,
        customer_tier=customer.get("loyalty_tier", "Standard"),
        customer_email=customer.get("email"),
    )

@app.post("/api/returns")
async def initiate_return(body: dict):
    return await returns_service.initiate_return(
        order_id=body.get("order_id"),
        items=body.get("items", []),
        reason=body.get("reason", ""),
        customer_id=body.get("customer_id"),
    )


# ═══════════════════════════════════════════════════════════════════════════════
# REST — Image Analysis
# ═══════════════════════════════════════════════════════════════════════════════
@app.post("/api/analyze-image")
async def analyze_image(file: UploadFile = File(...)):
    data = await file.read()
    b64 = base64.b64encode(data).decode()
    result = await vision_service.identify(b64, file.content_type or "image/jpeg")
    return result


# ═══════════════════════════════════════════════════════════════════════════════
# REST — Sessions & Metrics
# ═══════════════════════════════════════════════════════════════════════════════
@app.get("/api/sessions")
async def list_sessions(limit: int = 20):
    return {"sessions": await session_store.list_sessions(limit=limit)}

@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str):
    s = await session_store.get_session(session_id)
    if not s:
        raise HTTPException(404, "Session not found")
    return s

@app.get("/api/metrics")
async def get_metrics():
    return await session_store.get_metrics()


# ═══════════════════════════════════════════════════════════════════════════════
# REST — Manager Console
# ═══════════════════════════════════════════════════════════════════════════════
@app.get("/api/manager/approvals")
async def get_approvals():
    return {"approvals": await approval_service.list_pending()}

@app.post("/api/manager/approvals/{request_id}/approve")
async def approve_discount(request_id: str, body: dict = {}):
    """Manager approves discount — can amend the % (e.g. customer asked 50%, manager approves 25%)."""
    return await approval_service.resolve(
        request_id, "approve",
        note=body.get("note", ""),
        amended_pct=body.get("amended_pct"),  # Optional: new discount % if manager modifies
    )

@app.post("/api/manager/approvals/{request_id}/reject")
async def reject_discount(request_id: str, body: dict = {}):
    return await approval_service.resolve(request_id, "reject", body.get("note", ""))

@app.get("/api/manager/session/{session_id}/summary")
async def get_session_summary(session_id: str):
    """Get rich session summary for manager console."""
    session = await session_store.get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    journey = await session_store.get_journey_summary(session_id)
    customer_id = session.get("customer_id")
    customer = await session_store.get_or_create_customer(customer_id) if customer_id else {}
    cart = await cart_service.get_cart(customer_id) if customer_id else {}
    return {
        "session": session,
        "journey": journey,
        "customer": customer,
        "cart": cart,
    }

@app.get("/api/manager/customer/{customer_id}/context")
async def get_customer_context(customer_id: str):
    """Get full customer context for manager console."""
    customer = await session_store.get_or_create_customer(customer_id)
    orders = await order_service.list_customer_orders(customer_id, limit=5)
    cart = await cart_service.get_cart(customer_id)
    return {
        "customer": customer,
        "orders": orders,
        "cart": cart,
        "loyalty_tier": customer.get("loyalty_tier", "Standard"),
        "tier_benefits": policy_service.get_tier_benefits(customer.get("loyalty_tier", "Standard")),
    }

@app.post("/api/manager/handoff/{handoff_id}/assign")
async def assign_handoff(handoff_id: str, body: dict):
    return await handoff_service.assign_handoff(handoff_id, body.get("agent_name", ""))

@app.get("/api/manager/handoffs")
async def list_handoffs():
    return {"handoffs": await handoff_service.list_active_handoffs()}


# ═══════════════════════════════════════════════════════════════════════════════
# REST — Bookings
# ═══════════════════════════════════════════════════════════════════════════════
@app.get("/api/bookings/{customer_id}")
async def list_bookings(customer_id: str):
    return {"bookings": await booking_service.list_customer_bookings(customer_id)}


# ═══════════════════════════════════════════════════════════════════════════════
# REST — Customer
# ═══════════════════════════════════════════════════════════════════════════════
@app.get("/api/customers/{customer_id}")
async def get_customer(customer_id: str):
    return await session_store.get_or_create_customer(customer_id)


# ═══════════════════════════════════════════════════════════════════════════════
# PERSONA BUILDER — Mode-aware with tool gating
# ═══════════════════════════════════════════════════════════════════════════════
def build_persona(mode: str, customer: dict, cart: dict, orders: list = None) -> str:
    name   = customer.get("name", "valued customer")
    tier   = customer.get("loyalty_tier", "Standard")
    total_orders = customer.get("total_orders", 0)
    points = customer.get("loyalty_points", 0)
    items  = len(cart.get("items", []))
    prefs  = customer.get("preferences", {})
    skill  = prefs.get("skill_level", "beginner")
    garden = prefs.get("garden_type", "indoor")
    budget = prefs.get("budget_range", "medium")

    # Get tier benefits
    benefits = policy_service.get_tier_benefits(tier)
    auto_discount = benefits["autonomous_discount_limit"]
    goodwill_limit = benefits["goodwill_credit_limit"]

    # Order context
    order_summary = ""
    if orders:
        recent = orders[:3]
        order_lines = []
        for o in recent:
            items_str = ", ".join(f"{i['name']}" for i in o.get("items", [])[:2])
            order_lines.append(f"  - {o['order_id']}: {o['status']} — {items_str} (${o.get('total', 0):.2f})")
        order_summary = f"\nRecent orders:\n" + "\n".join(order_lines)

    # Support history
    support_history = ""
    hist = customer.get("support_history", [])
    if hist:
        lines = [f"  - {h['date']}: {h['issue']} → {h['resolution']}" for h in hist[:3]]
        support_history = f"\nSupport history:\n" + "\n".join(lines)

    # Cart context
    cart_summary = "empty"
    if cart.get("items"):
        cart_items = ", ".join(f"{i['name']} ×{i['qty']}" for i in cart["items"][:4])
        cart_summary = f"{len(cart['items'])} items (${cart.get('subtotal', 0):.2f}): {cart_items}"

    if mode == "shop":
        return f"""You are Aria, a friendly AI shopping assistant at Bloom & Grow garden store. This is a live voice phone call.

HOW TO START:
- Greet warmly: "Hi there! Welcome to Bloom & Grow. My name is Aria. Who am I speaking with today?"
- Wait for them to tell you their name
- Then say: "Nice to meet you, [name]!" and ask how you can help
- If they have items in cart, mention it: "I see you already have some items in your cart. Are you looking for anything specific today?"

VOICE CONVERSATION RULES:
- Keep every response to 1-2 sentences MAX. This is voice, not text.
- NEVER call tools on greetings or casual chat. Just talk naturally.
- Only call tools when the customer asks you to DO something specific.
- When the customer interrupts you, STOP talking and listen to them.
- Be adaptive — respond to what they actually say, don't follow a script.
- If they ask about something unrelated to the store, politely redirect: "That's a great question! I'm best at helping with garden and home products though. Is there anything I can help you find today?"

WHAT YOU KNOW (use naturally in conversation, don't dump it all at once):
- Customer: {tier} loyalty member, {total_orders} previous orders
- Cart: {cart_summary}
{order_summary}

TOOLS — only use when needed:
- recommend_products: When they ask for suggestions. Explain WHY briefly.
- add_to_cart / remove_from_cart: When they say to add or remove. Confirm what you did.
- identify_plant_or_product: When they show you something via camera or image.
- get_product_details: When they ask about a specific product.
- apply_offer: When they have a promo code.
- request_discount_approval: For discounts over {auto_discount}%. Say "Let me check with my supervisor" and wait.
- schedule_service: When they need landscaping, planting, consultation.
- send_care_guide: When they want care instructions emailed.
- connect_to_human: When you can't help or they ask for a human.

DISCOUNT RULES:
- You can approve up to {auto_discount}% discount on your own.
- Above that: "That's beyond what I can authorize. Let me check with my supervisor." Use request_discount_approval.
- We price match on a case-by-case basis.
- We offer landscaping services: planting, installation, consultation.

BE NATURAL: Respond like a real person. If they mention personal things (sports, events, etc.), engage briefly before getting back to business."""

    else:  # support mode
        return f"""You are Aria, a customer support specialist at Bloom & Grow garden store. This is a live voice call.

HOW TO START:
- "Hi there, this is Aria from Bloom & Grow support. Who am I speaking with?"
- Wait for their name, then ask how you can help.

VOICE RULES:
- 1-2 sentences per response. This is voice.
- Be empathetic. If they sound frustrated, acknowledge it FIRST.
- When they interrupt, stop and listen.

CONTEXT:
- Customer: {tier} member, {total_orders} orders
- Cart: {cart_summary}
{order_summary}
{support_history}

TOOLS:
- get_order_status: Look up any order
- process_refund: ALWAYS confirm amount first: "I can process a refund of $X. Shall I go ahead?"
- identify_plant_or_product: Assess damage shown via camera
- update_support_ticket: Create support cases
- apply_offer: Goodwill credits up to ${goodwill_limit:.2f}
- request_discount_approval: Larger amounts need supervisor
- schedule_service: Book repairs, replacements, consultations
- connect_to_human: Transfer when you can't resolve

BE NATURAL: Listen first, then help. Don't assume — ask."""


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8080))
    uvicorn.run("main:app", host="0.0.0.0", port=port, log_level="info")
