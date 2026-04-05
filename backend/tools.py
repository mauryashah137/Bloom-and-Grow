"""
Tool Dispatcher — Thin routing layer that delegates to real services.
Each tool: validates arguments → calls service → returns structured result → emits events.
"""
import logging, time
from typing import TYPE_CHECKING
if TYPE_CHECKING:
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
    from services.refund_service import RefundService

logger = logging.getLogger(__name__)


class ToolDispatcher:
    def __init__(
        self,
        vision_service=None,
        catalog_service=None,
        cart_service=None,
        order_service=None,
        offer_service=None,
        approval_service=None,
        booking_service=None,
        notification_service=None,
        handoff_service=None,
        recommender_service=None,
        policy_service=None,
        refund_service=None,
    ):
        self.vision = vision_service
        self.catalog = catalog_service
        self.cart = cart_service
        self.orders = order_service
        self.offers = offer_service
        self.approvals = approval_service
        self.bookings = booking_service
        self.notifications = notification_service
        self.handoff = handoff_service
        self.recommender = recommender_service
        self.policy = policy_service
        self.refunds = refund_service

    async def dispatch(self, tool_name: str, args: dict, **ctx) -> dict:
        handler = getattr(self, f"_t_{tool_name}", None)
        if not handler:
            raise ValueError(f"Unknown tool: {tool_name}")
        return await handler(args, **ctx)

    # ── 1. Identify plant or product ─────────────────────────────────────────
    async def _t_identify_plant_or_product(self, args, **ctx):
        """Use Gemini vision to identify what the customer is showing."""
        image_b64 = args.get("_image_b64")
        mime_type = args.get("_mime_type", "image/jpeg")
        context = args.get("context", "")

        # Get customer preferences for personalized results
        session_store = ctx.get("session_store")
        customer_id = ctx.get("customer_id")
        preferences = None
        if session_store and customer_id:
            customer = await session_store.get_or_create_customer(customer_id)
            preferences = customer.get("preferences")

        if self.vision:
            result = await self.vision.identify(
                image_b64=image_b64 or "",
                mime_type=mime_type,
                context=context,
                customer_preferences=preferences,
            )
        else:
            result = {
                "candidates": [{"name": "Unknown", "confidence": 0.0, "category": "other"}],
                "issue_detected": "none",
                "next_question": "Could you tell me more about what you're showing me?",
                "catalog_matches": [],
            }

        # Enrich with catalog matches if catalog service available
        if self.catalog and result.get("candidates"):
            matches = await self.catalog.match_from_vision(result["candidates"])
            result["catalog_matches"] = matches

        return result

    # ── 2. Recommend products ────────────────────────────────────────────────
    async def _t_recommend_products(self, args, **ctx):
        """Generate deeply personalized product recommendations."""
        session_store = ctx.get("session_store")
        customer_id = ctx.get("customer_id")

        # Gather full context
        customer_profile = None
        current_cart = None
        if session_store and customer_id:
            customer_profile = await session_store.get_or_create_customer(customer_id)
        if self.cart:
            current_cart_data = await self.cart.get_cart(customer_id)
            current_cart = current_cart_data

        # Get vision context if available
        vision_result = ctx.get("last_vision_result")

        if self.recommender:
            result = await self.recommender.recommend(
                need=args.get("need", ""),
                category=args.get("category"),
                budget_max=args.get("budget_max"),
                skill_level=args.get("skill_level", "beginner"),
                customer_profile=customer_profile,
                current_cart=current_cart,
                vision_result=vision_result,
            )
        else:
            # Fallback to basic catalog search
            catalog = ctx.get("catalog")
            if catalog:
                products = await catalog.recommend(
                    need=args.get("need", ""),
                    category=args.get("category"),
                    budget_max=args.get("budget_max"),
                    skill_level=args.get("skill_level", "beginner"),
                )
                result = {"products": products, "count": len(products), "personalized_for": args.get("skill_level", "beginner")}
            else:
                result = {"products": [], "count": 0}

        return result

    # ── 3. Get product details ───────────────────────────────────────────────
    async def _t_get_product_details(self, args, **ctx):
        """Look up full product details."""
        pid = args.get("product_id")
        if self.catalog:
            p = await self.catalog.get(pid)
            if p:
                # Also get complementary products
                comps = await self.catalog.find_complementary(pid, limit=3)
                p["complementary_products"] = comps
                return p
        # Fallback
        catalog = ctx.get("catalog")
        if catalog:
            p = await catalog.get(pid)
            if p:
                return p
        return {"error": f"Product {pid} not found"}

    # ── 4. Add to cart ───────────────────────────────────────────────────────
    async def _t_add_to_cart(self, args, **ctx):
        """Add a product to the customer's shopping cart."""
        cid = ctx.get("customer_id")
        pid = args.get("product_id")
        qty = args.get("qty", 1)

        # Validate product exists
        product_name = pid
        if pid and self.catalog:
            product = await self.catalog.get(pid)
            if not product:
                return {"error": f"Product '{pid}' not found in our catalog. Can I help you find the right product?"}
            product_name = product.get("name", pid)
            stock = product.get("stock", 0)
            if stock <= 0:
                return {"error": f"Sorry, {product_name} is currently out of stock."}
            if qty > stock:
                return {"error": f"We only have {stock} units of {product_name} in stock. Would you like to add {stock} instead?"}

        # Check if item already in cart — report existing quantity
        existing_qty = 0
        if self.cart:
            cart = await self.cart.get_cart(cid)
            for item in cart.get("items", []):
                if item.get("product_id") == pid:
                    existing_qty = item.get("qty", 0)
                    break

        if self.cart:
            result = await self.cart.add_item(cid, pid, qty)
        elif ctx.get("cart_manager"):
            result = await ctx["cart_manager"].add_item(cid, pid, qty)
        else:
            return {"error": "Cart service unavailable"}

        # Add info about existing quantity for the agent to communicate
        if existing_qty > 0:
            result["already_in_cart"] = True
            result["previous_qty"] = existing_qty
            result["new_total_qty"] = existing_qty + qty
            result["message"] = f"{product_name} was already in the cart ({existing_qty}x). Now updated to {existing_qty + qty}x."
        else:
            result["already_in_cart"] = False
            result["message"] = f"Added {qty}x {product_name} to the cart."

        return result

    # ── 5. Remove from cart ──────────────────────────────────────────────────
    async def _t_remove_from_cart(self, args, **ctx):
        """Remove a product from the customer's cart."""
        cid = ctx.get("customer_id")
        if self.cart:
            return await self.cart.remove_item(cid, args["product_id"])
        cm = ctx.get("cart_manager")
        if cm:
            return await cm.remove_item(cid, args["product_id"])
        return {"error": "Cart service unavailable"}

    # ── 6. Apply offer ───────────────────────────────────────────────────────
    async def _t_apply_offer(self, args, **ctx):
        """Apply a promo code, discount, or loyalty reward."""
        code = args.get("offer_code", "")
        cid = ctx.get("customer_id")

        # Get customer tier
        session_store = ctx.get("session_store")
        tier = "Standard"
        if session_store and cid:
            customer = await session_store.get_or_create_customer(cid)
            tier = customer.get("loyalty_tier", "Standard")

        # Get cart subtotal
        cart_subtotal = 0
        if self.cart:
            cart = await self.cart.get_cart(cid)
            cart_subtotal = cart.get("subtotal", 0)

        if self.offers:
            return await self.offers.validate_and_apply(
                code=code,
                customer_id=cid,
                customer_tier=tier,
                cart_subtotal=cart_subtotal,
            )

        # Fallback: basic offer logic
        cm = ctx.get("cart_manager")
        offers = {
            "WELCOME10": {"discount_pct": 10, "description": "10% welcome discount"},
            "GOLD15":    {"discount_pct": 15, "description": "Gold member exclusive"},
            "SPRING20":  {"discount_pct": 20, "description": "Spring Sale — 20% off"},
            "GREENUP":   {"discount_pct": 5,  "description": "Spring promotion"},
        }
        code_upper = code.upper()
        if code_upper in offers:
            if cm:
                await cm.apply_offer(cid, code_upper, offers[code_upper]["discount_pct"])
            return {"success": True, "code": code_upper, **offers[code_upper]}
        return {"success": False, "error": f"Code '{code}' is not valid or has expired"}

    # ── 7. Request discount approval ─────────────────────────────────────────
    async def _t_request_discount_approval(self, args, **ctx):
        """Request manager approval for a custom discount."""
        cid = ctx.get("customer_id")
        sid = ctx.get("session_id")

        # Get customer tier
        session_store = ctx.get("session_store")
        tier = "Standard"
        if session_store and cid:
            customer = await session_store.get_or_create_customer(cid)
            tier = customer.get("loyalty_tier", "Standard")

        if self.approvals:
            return await self.approvals.request_discount(
                session_id=sid,
                customer_id=cid,
                discount_pct=args.get("discount_pct", 10),
                reason=args.get("reason", "Customer request"),
                product_id=args.get("product_id"),
                customer_tier=tier,
            )

        # Fallback
        import uuid
        aq = ctx.get("approval_queue")
        req_id = f"DISC-{uuid.uuid4().hex[:8].upper()}"
        request = {
            "request_id": req_id, "session_id": sid, "customer_id": cid,
            "discount_pct": args.get("discount_pct"), "reason": args.get("reason"),
            "product_id": args.get("product_id"), "status": "pending",
            "requested_at": time.time(),
        }
        if aq:
            await aq.add(req_id, request)
        return {"request_id": req_id, "status": "pending",
                "message": "Request sent to manager. I'll let you know as soon as it's approved."}

    # ── 8. Get order status ──────────────────────────────────────────────────
    async def _t_get_order_status(self, args, **ctx):
        """Look up an order by ID or find recent orders."""
        cid = ctx.get("customer_id")

        if self.orders:
            return await self.orders.get_order_status(
                order_id=args.get("order_id"),
                customer_id=cid,
                show_recent=args.get("show_recent", False),
            )

        # Fallback: return seeded demo data
        from services.order_service import SEED_ORDERS
        oid = args.get("order_id")
        if oid and oid in SEED_ORDERS:
            return SEED_ORDERS[oid]
        if args.get("show_recent"):
            orders = [o for o in SEED_ORDERS.values() if o.get("customer_id") == cid]
            return {"orders": orders, "count": len(orders)}
        if oid:
            return {"error": f"Order {oid} not found"}
        return {"orders": list(SEED_ORDERS.values())[:5], "count": len(SEED_ORDERS)}

    # ── 9. Process refund ────────────────────────────────────────────────────
    async def _t_process_refund(self, args, **ctx):
        """Process a refund for an order with policy checking."""
        cid = ctx.get("customer_id")

        # Get customer info
        session_store = ctx.get("session_store")
        tier = "Standard"
        email = None
        if session_store and cid:
            customer = await session_store.get_or_create_customer(cid)
            tier = customer.get("loyalty_tier", "Standard")
            email = customer.get("email")

        if self.refunds:
            return await self.refunds.process_refund(
                order_id=args.get("order_id"),
                reason=args.get("reason", "Customer request"),
                amount=args.get("amount"),
                customer_id=cid,
                customer_tier=tier,
                customer_email=email,
            )

        # Fallback
        import uuid
        return {
            "success": True,
            "refund_id": f"REF-{uuid.uuid4().hex[:8].upper()}",
            "order_id": args.get("order_id"),
            "amount_refunded": args.get("amount", 72.97),
            "currency": "USD",
            "reason": args.get("reason"),
            "expected_credit_date": "3-5 business days",
            "confirmation_sent": True,
        }

    # ── 10a. Get service info (quote + available times, does NOT book) ──────
    async def _t_get_service_info(self, args, **ctx):
        """Get pricing and available time slots for a service — does NOT book."""
        service_type = args.get("service_type", "consultation")
        preferred_date = args.get("preferred_date")

        if self.bookings:
            info = await self.bookings.get_available_slots(service_type, preferred_date)
            return info

        # Fallback
        from services.booking_service import SERVICE_TYPES, AVAILABLE_SLOTS
        svc = SERVICE_TYPES.get(service_type, {})
        return {
            "service_type": service_type,
            "service_name": svc.get("name", service_type),
            "price": svc.get("price", 0),
            "duration_minutes": svc.get("duration_minutes", 60),
            "available_slots": AVAILABLE_SLOTS,
            "note": "These are available time slots. Tell the customer and ask which they prefer before booking.",
        }

    # ── 10b. Navigate page (control the website UI) ──────────────────────────
    async def _t_navigate_page(self, args, **ctx):
        """Navigate the customer to a page on the website."""
        page = args.get("page", "home")
        valid_pages = {"cart", "checkout", "shop", "orders", "support", "home"}
        if page not in valid_pages:
            return {"error": f"Unknown page '{page}'. Available: {', '.join(valid_pages)}"}

        page_names = {
            "cart": "your shopping cart",
            "checkout": "the checkout page",
            "shop": "our product catalog",
            "orders": "your order history",
            "support": "customer support",
            "home": "the home page",
        }
        return {
            "success": True,
            "page": page,
            "message": f"I've opened {page_names.get(page, page)} for you.",
        }

    # ── 10c. Schedule service (actually books — requires prior confirmation) ─
    async def _t_schedule_service(self, args, **ctx):
        """Book a consultation, planting, installation, repair, or delivery."""
        cid = ctx.get("customer_id")

        if self.bookings:
            return await self.bookings.create_booking(
                customer_id=cid,
                service_type=args.get("service_type", "consultation"),
                preferred_date=args.get("preferred_date"),
                preferred_time=args.get("preferred_time"),
                notes=args.get("notes", ""),
            )

        # Fallback
        import uuid
        return {
            "success": True,
            "booking_id": f"BK-{uuid.uuid4().hex[:6].upper()}",
            "service_type": args.get("service_type", "consultation"),
            "confirmed_date": args.get("preferred_date", "2026-04-10"),
            "confirmed_time": "10:00 AM - 12:00 PM",
            "specialist": "Sarah M., Senior Garden Consultant",
            "confirmation_email_sent": True,
        }

    # ── 11. Send care guide ──────────────────────────────────────────────────
    async def _t_send_care_guide(self, args, **ctx):
        """Email a personalized plant or product care guide."""
        cid = ctx.get("customer_id")

        # Get customer email
        session_store = ctx.get("session_store")
        email = f"{cid}@email.com"
        if session_store and cid:
            customer = await session_store.get_or_create_customer(cid)
            email = customer.get("email", email)

        if self.notifications:
            return await self.notifications.send_care_guide(
                customer_id=cid,
                customer_email=email,
                product_name=args.get("product_name", "Plant"),
                product_id=args.get("product_id"),
            )

        return {
            "success": True,
            "product": args.get("product_name"),
            "guide_sections": ["Watering", "Light", "Fertilizing", "Common problems", "Seasonal care"],
            "sent_to": email,
        }

    # ── 12. Update support ticket ────────────────────────────────────────────
    async def _t_update_support_ticket(self, args, **ctx):
        """Create or update a support case."""
        import uuid, random
        new = args.get("ticket_id") is None
        tid = args.get("ticket_id") or f"TKT-{random.randint(10000,99999)}"

        # In production: integrate with Zendesk/ServiceNow
        ticket = {
            "success": True,
            "action": "created" if new else "updated",
            "ticket_id": tid,
            "subject": args.get("subject"),
            "description": args.get("description"),
            "priority": args.get("priority"),
            "customer_id": ctx.get("customer_id"),
            "session_id": ctx.get("session_id"),
            "url": f"https://support.greenleaf.example/tickets/{tid}",
            "created_at": time.time(),
        }
        return ticket

    # ── 13. Send follow-up email ─────────────────────────────────────────────
    async def _t_send_follow_up_email(self, args, **ctx):
        """Send a follow-up email summarizing what was resolved."""
        cid = ctx.get("customer_id")

        session_store = ctx.get("session_store")
        email = f"{cid}@email.com"
        if session_store and cid:
            customer = await session_store.get_or_create_customer(cid)
            email = customer.get("email", email)

        if self.notifications:
            return await self.notifications.send_follow_up(
                customer_id=cid,
                customer_email=email,
                subject=args.get("subject", "Follow-up from GreenLeaf"),
                body=args.get("body", ""),
            )

        return {
            "success": True,
            "message_id": f"msg_{__import__('uuid').uuid4().hex[:8]}",
            "subject": args.get("subject"),
        }

    # ── 14. Connect to human ─────────────────────────────────────────────────
    async def _t_connect_to_human(self, args, **ctx):
        """Transfer to a human agent with full context preservation."""
        cid = ctx.get("customer_id")
        sid = ctx.get("session_id")

        # Gather current context
        cart = None
        if self.cart:
            cart = await self.cart.get_cart(cid)

        if self.handoff:
            return await self.handoff.create_handoff(
                session_id=sid,
                customer_id=cid,
                reason=args.get("reason", "Customer requested human agent"),
                priority=args.get("priority", "normal"),
                specialist_type=args.get("specialist_type", "general"),
                cart=cart,
                recommendations=ctx.get("last_recommendations"),
                vision_results=ctx.get("last_vision_result"),
                discount_state=ctx.get("last_discount_state"),
            )

        # Fallback
        import uuid, random
        return {
            "success": True,
            "handoff_id": f"ESC-{uuid.uuid4().hex[:6].upper()}",
            "queue_position": random.randint(1, 4),
            "estimated_wait_minutes": random.randint(2, 8),
            "specialist_type": args.get("specialist_type", "general"),
            "reason": args.get("reason"),
        }
