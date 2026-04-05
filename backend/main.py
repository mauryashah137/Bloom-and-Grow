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
    products = await catalog.search(query=q, category=category, limit=limit)
    # Return clean copies without any nested refs that could cause recursion
    return {"products": [
        {k: v for k, v in p.items() if k != "complementary_products"}
        for p in products
    ]}

@app.get("/api/products/{product_id}")
async def get_product(product_id: str):
    p = await catalog.get(product_id)
    if not p:
        raise HTTPException(404, "Product not found")
    # Return a copy to avoid mutating the catalog + circular refs
    result = dict(p)
    comps = await catalog_service.find_complementary(product_id, limit=3)
    # Return clean copies of complementary products (no nested complementary)
    result["complementary_products"] = [
        {k: v for k, v in c.items() if k != "complementary_products"}
        for c in comps
    ]
    return result


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

@app.post("/api/services/book")
async def book_service_form(body: dict):
    """Book a service from the website form."""
    service_type = body.get("service_type", "consultation")
    customer_id = body.get("email") or body.get("name", "web_form_customer")
    result = await booking_service.create_booking(
        customer_id=customer_id,
        service_type=service_type,
        preferred_date=body.get("preferred_date"),
        preferred_time=body.get("preferred_time"),
        notes=body.get("notes", ""),
    )
    if result.get("error"):
        return result
    # Include contact info in response
    result["contact"] = {
        "name": body.get("name"),
        "email": body.get("email"),
        "phone": body.get("phone"),
    }
    return result


# ═══════════════════════════════════════════════════════════════════════════════
# REST — Customer
# ═══════════════════════════════════════════════════════════════════════════════
@app.get("/api/customers/{customer_id}")
async def get_customer(customer_id: str):
    return await session_store.get_or_create_customer(customer_id)


# ═══════════════════════════════════════════════════════════════════════════════
# REST — Search
# ═══════════════════════════════════════════════════════════════════════════════
@app.get("/api/search")
async def search_products(q: str = "", limit: int = 20):
    """Search products. If no exact matches, return similar products."""
    if not q.strip():
        return {"products": [], "query": q, "similar": False}

    results = await catalog.search(query=q.strip(), limit=limit)
    if results:
        return {"products": [
            {k: v for k, v in p.items() if k != "complementary_products"} for p in results
        ], "query": q, "similar": False}

    # No exact match — find similar products by searching individual words
    similar = []
    seen = set()
    for word in q.strip().split():
        if len(word) > 2:
            matches = await catalog.search(query=word, limit=5)
            for m in matches:
                if m["id"] not in seen:
                    seen.add(m["id"])
                    similar.append({k: v for k, v in m.items() if k != "complementary_products"})

    # If still nothing, return top rated products
    if not similar:
        all_products = await catalog.search(limit=8)
        similar = [{k: v for k, v in p.items() if k != "complementary_products"} for p in all_products]

    return {"products": similar[:limit], "query": q, "similar": True}


# ═══════════════════════════════════════════════════════════════════════════════
# REST — Auth (Registration + Login with Firestore)
# ═══════════════════════════════════════════════════════════════════════════════
import hashlib

def _hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

@app.post("/api/auth/register")
async def register(body: dict):
    """Register a new user account."""
    name = body.get("name", "").strip()
    email = body.get("email", "").strip().lower()
    password = body.get("password", "")
    phone = body.get("phone", "").strip()

    if not name or not email or not password:
        return {"success": False, "error": "Name, email, and password are required."}
    if len(password) < 6:
        return {"success": False, "error": "Password must be at least 6 characters."}
    if "@" not in email:
        return {"success": False, "error": "Please enter a valid email address."}

    # Check if user already exists
    existing = await session_store.get_user_by_email(email)
    if existing:
        return {"success": False, "error": "An account with this email already exists. Please sign in."}

    # Create user
    user = await session_store.create_user({
        "name": name,
        "email": email,
        "password_hash": _hash_password(password),
        "phone": phone,
        "loyalty_tier": "Standard",
        "loyalty_points": 0,
        "total_orders": 0,
        "member_since": time.strftime("%Y-%m-%d"),
        "preferences": {"skill_level": "beginner", "garden_type": "indoor", "budget_range": "medium"},
    })

    return {"success": True, "user": {k: v for k, v in user.items() if k != "password_hash"}}

@app.post("/api/auth/login")
async def login(body: dict):
    """Login with email and password."""
    email = body.get("email", "").strip().lower()
    password = body.get("password", "")

    if not email or not password:
        return {"success": False, "error": "Email and password are required."}

    user = await session_store.get_user_by_email(email)
    if not user:
        return {"success": False, "error": "No account found with this email."}

    if user.get("password_hash") != _hash_password(password):
        return {"success": False, "error": "Incorrect password."}

    return {"success": True, "user": {k: v for k, v in user.items() if k != "password_hash"}}

@app.get("/api/auth/profile/{user_id}")
async def get_profile(user_id: str):
    """Get user profile with orders, cart, and bookings."""
    user = await session_store.get_or_create_customer(user_id)
    orders = await order_service.list_customer_orders(user_id, limit=10)
    cart = await cart_service.get_cart(user_id)
    bookings = await booking_service.list_customer_bookings(user_id)
    return {
        "user": {k: v for k, v in user.items() if k != "password_hash"},
        "orders": orders,
        "cart": cart,
        "bookings": bookings,
    }

@app.put("/api/auth/profile/{user_id}")
async def update_profile(user_id: str, body: dict):
    """Update user profile."""
    allowed = {"name", "phone", "preferences"}
    updates = {k: v for k, v in body.items() if k in allowed}
    if updates:
        await session_store.update_customer(user_id, updates)
    user = await session_store.get_or_create_customer(user_id)
    return {"success": True, "user": {k: v for k, v in user.items() if k != "password_hash"}}


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
        return f"""You are Aria, a helpful AI shopping assistant at Bloom & Grow garden store. This is a live voice phone call.

GREETING:
Start with: "Hi there! Welcome to Bloom & Grow. I'm Aria. Who am I speaking with today?"
Wait for their name. Then: "Great to have you, [name]! How can I help you today?"
{"I notice you have some items in your cart already. " if cart.get("items") else ""}

GOLDEN RULE — ASK BEFORE ACTING:
You MUST follow this pattern for EVERY action:
1. INFORM: Tell the customer what you can do and the details (price, options, etc.)
2. ASK: Ask if they want to proceed. Wait for their response.
3. ACT: Only call the tool AFTER they say yes.

NEVER skip step 2. NEVER assume consent. NEVER auto-book, auto-add, or auto-anything.

Examples of correct behavior:
- "I found Bloom Booster Potting Mix for $15.99. Would you like me to add it to your cart?" → wait for yes → add_to_cart
- "Our landscaping service for planting would be $200 for a 4-hour session. Would you like to hear about available times?" → wait → "We have Monday 9-12 or 1-5. Which works for you?" → wait → "So Monday afternoon, 1 to 5. Should I go ahead and book that?" → wait for yes → schedule_service
- "I can process a refund of $72.97 for that order. Would you like me to go ahead?" → wait for yes → process_refund

VOICE RULES:
- 1-2 sentences per response. This is a phone call, not a text chat.
- Speak clearly and naturally.
- When the customer speaks, stop and listen. Let them finish.
- If you didn't understand, say "Sorry, could you repeat that?" — don't guess.
- NEVER call tools during greetings or casual conversation.

WHAT YOU KNOW (mention naturally when relevant):
- Loyalty tier: {tier} ({total_orders} orders, {points} points)
- Cart: {cart_summary}
{order_summary}

SERVICES — TWO-STEP PROCESS:
Step 1: When customer asks about services, use get_service_info to get price and available times. Tell them: "Our [service] is $X for Y hours. We have these times available: [list slots]. Which works for you?"
Step 2: ONLY after they pick a time and say YES, use schedule_service to actually book it.
NEVER use schedule_service without completing Step 1 first.

NAVIGATION:
When the customer says things like "open my cart", "show me products", "go to checkout", "show my orders" — use navigate_page to take them there. Say "Sure, let me open that for you."

DISCOUNT RULES:
- You can approve up to {auto_discount}% on your own.
- Above {auto_discount}%: "That's more than I can authorize myself. Let me check with my supervisor." Then call request_discount_approval and WAIT for the result before telling the customer.
- We price match sometimes, case by case.

OFF-TOPIC:
If they ask about something unrelated to the store, briefly engage then redirect: "That sounds fun! But I'm best at garden stuff — anything I can help you find today?"

EMPATHY:
If the customer sounds frustrated or unhappy, acknowledge it first: "I totally understand, that's frustrating. Let me see what I can do." Then help.

EDGE CASES — handle these smoothly:
- Customer asks for a product you can't find: "I'm not finding that in our catalog. Could you describe what you're looking for and I'll search for something similar?"
- Customer wants to add item already in cart: "You already have that in your cart. Would you like me to increase the quantity?"
- Customer asks for 100% or free items: "I'm sorry, I'm not able to offer items for free. But I can check if there are any promotions available."
- Customer asks for something unrelated (weather, sports, etc.): Briefly engage, then: "That's interesting! But I'm best at helping with garden supplies. Anything I can help you find?"
- Customer is silent for a while: "Are you still there? Take your time, I'm here when you're ready."
- Customer says goodbye: "Thanks for shopping with us! Have a wonderful day. Don't hesitate to call back if you need anything!"
- Cart is empty but customer wants to checkout: "Your cart is empty right now. Would you like me to help you find some products first?"
- Customer gives conflicting instructions: "Just to clarify — did you want me to [action A] or [action B]?"
- Customer wants to cancel a booking: "I can help with that. Which booking would you like to cancel?"
- Customer asks about return policy: "We accept returns within 30 to 90 days depending on your membership tier. Would you like more details?"
- Tool returns an error: Apologize and offer alternative: "I'm sorry, I ran into an issue with that. Let me try another way to help you."
- Customer asks to speak to a manager: "Of course! Let me transfer you to a specialist right away." Use connect_to_human."""

    else:  # support mode
        return f"""You are Aria, a customer support specialist at Bloom & Grow garden store. This is a live voice call.

GREETING:
"Hi there, this is Aria from Bloom & Grow support. Who am I speaking with?"
Wait for their name. Then ask how you can help.

GOLDEN RULE — ASK BEFORE ACTING:
1. INFORM the customer what you can do
2. ASK if they want to proceed
3. ACT only after they confirm
NEVER process refunds, book services, or take any action without explicit "yes" from the customer.

VOICE RULES:
- 1-2 sentences max. This is voice.
- If they sound frustrated, acknowledge it FIRST before solving.
- If you can't understand, ask them to repeat.

CONTEXT:
- Loyalty tier: {tier} ({total_orders} orders, {points} points)
- Cart: {cart_summary}
{order_summary}
{support_history}

REFUND RULES:
- Always state the amount: "I can process a refund of $X for order Y."
- Wait for explicit confirmation before processing.
- Goodwill credits up to ${goodwill_limit:.2f} you can approve yourself.
- Larger amounts need supervisor approval.

EMPATHY:
"I completely understand how frustrating that is. Let me sort this out for you right away."
Always validate their feelings before jumping to solutions.

EDGE CASES:
- Order not found: "I'm not finding that order number. Could you double-check it? Or I can look up your recent orders."
- Already refunded: "It looks like this order has already been refunded. Is there something else I can help with?"
- Refund amount too high: "The refund amount can't exceed the order total. Would you like a full refund instead?"
- Customer doesn't have the order ID: "No problem! Let me pull up your recent orders." Use get_order_status with show_recent.
- Damaged item without photo: "I'm sorry to hear that. Could you describe the damage? Or if you have a photo, you can share it through the camera."
- Customer threatens or is abusive: Stay calm, empathetic. "I understand you're upset, and I want to help. Let me see what I can do." If it continues, offer to connect with a human.
- Multiple issues in one call: Handle one at a time: "Let me take care of [first issue] first, then we'll address [second issue]."
- Customer asks about shipping that's in transit: Give tracking info and estimated delivery.
- Tool returns an error: "I'm sorry, I'm having trouble with that. Let me try a different approach."
- Customer wants to escalate: "Absolutely, let me connect you with a specialist who can help further." Use connect_to_human."""


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8080))
    uvicorn.run("main:app", host="0.0.0.0", port=port, log_level="info")
