"""
Approval Service — Real-time discount approval workflow.
Manages the full lifecycle: request → pending → approved/rejected → cart update.
Session-keyed routing ensures results go back to the correct live session.
"""
import asyncio, logging, time, uuid
from typing import Optional, Callable

logger = logging.getLogger(__name__)

try:
    from google.cloud import firestore
    _db = firestore.AsyncClient()
    USE_FS = True
except:
    _db = None
    USE_FS = False

_MEMORY: dict = {}
# Maps session_id → asyncio.Queue for live session notification
_SESSION_LISTENERS: dict = {}


class ApprovalService:
    def __init__(self, approval_queue, cart_service=None, policy_service=None):
        self._queue = approval_queue
        self._cart = cart_service
        self._policy = policy_service

    async def request_discount(
        self,
        session_id: str,
        customer_id: str,
        discount_pct: float,
        reason: str,
        product_id: str = None,
        cart_id: str = None,
        customer_tier: str = "Standard",
    ) -> dict:
        """Create a discount approval request."""
        # Check if policy allows auto-approval
        if self._policy:
            auto_limit = self._policy.get_autonomous_discount_limit(customer_tier)
            if discount_pct <= auto_limit:
                # Auto-approve
                if self._cart:
                    await self._cart.apply_discount_amount(
                        customer_id, discount_pct, f"Auto-approved: {reason}"
                    )
                return {
                    "request_id": f"AUTO-{uuid.uuid4().hex[:8].upper()}",
                    "status": "approved",
                    "auto_approved": True,
                    "discount_pct": discount_pct,
                    "message": f"I've applied a {discount_pct}% discount for you right away!",
                }

        # Needs manager approval
        req_id = f"DISC-{uuid.uuid4().hex[:8].upper()}"
        request = {
            "request_id": req_id,
            "session_id": session_id,
            "customer_id": customer_id,
            "cart_id": cart_id or customer_id,
            "discount_pct": discount_pct,
            "reason": reason,
            "product_id": product_id,
            "customer_tier": customer_tier,
            "status": "pending",
            "requested_at": time.time(),
        }

        await self._queue.add(req_id, request)
        _MEMORY[req_id] = request

        return {
            "request_id": req_id,
            "status": "pending",
            "discount_pct": discount_pct,
            "message": "I've sent your discount request to our manager. I'll let you know as soon as they respond!",
        }

    async def resolve(self, request_id: str, action: str, note: str = "", amended_pct: float = None) -> dict:
        """
        Approve or reject a discount request and notify the live session.
        Manager can amend the discount % (e.g. customer asked 50%, manager approves 25%).
        The chatbot receives the resolved amount live and offers it to the customer.
        """
        if action == "approve":
            result = await self._queue.approve(request_id, note)
        else:
            result = await self._queue.reject(request_id, note)

        request = _MEMORY.get(request_id, result)
        request.update(result)

        # Manager can amend the discount amount
        original_pct = request.get("discount_pct", 0)
        final_pct = amended_pct if amended_pct is not None else original_pct
        request["approved_pct"] = final_pct
        request["original_pct"] = original_pct
        request["amended"] = amended_pct is not None and amended_pct != original_pct
        _MEMORY[request_id] = request

        # If approved, apply the final discount to cart
        if action == "approve" and self._cart:
            customer_id = request.get("customer_id")
            if customer_id and final_pct:
                await self._cart.apply_discount_amount(
                    customer_id, final_pct, f"Manager approved: {note}"
                )

        # Notify the live session — chatbot receives this and tells the customer
        session_id = request.get("session_id")
        if session_id and session_id in _SESSION_LISTENERS:
            event = {
                "type": "discount_resolved",
                "request_id": request_id,
                "approved": action == "approve",
                "discount_pct": final_pct,
                "original_pct": original_pct,
                "amended": request["amended"],
                "note": note,
            }
            try:
                await _SESSION_LISTENERS[session_id].put(event)
            except Exception as e:
                logger.error(f"Failed to notify session {session_id}: {e}")

        return request

    async def list_pending(self) -> list:
        return await self._queue.list_pending()

    async def get_request(self, request_id: str) -> Optional[dict]:
        return _MEMORY.get(request_id)

    async def get_request_with_context(self, request_id: str) -> dict:
        """Get approval request with full customer and session context."""
        request = _MEMORY.get(request_id, {})
        if not request:
            return {"error": "Request not found"}
        return request

    @staticmethod
    def register_session_listener(session_id: str, queue: asyncio.Queue):
        """Register a live session to receive approval events."""
        _SESSION_LISTENERS[session_id] = queue

    @staticmethod
    def unregister_session_listener(session_id: str):
        _SESSION_LISTENERS.pop(session_id, None)
