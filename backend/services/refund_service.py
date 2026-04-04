"""
Refund Service — Process refunds with full edge case handling.
"""
import logging, time, uuid
from typing import Optional

logger = logging.getLogger(__name__)

try:
    from google.cloud import firestore
    _db = firestore.AsyncClient()
    USE_FS = True
except:
    _db = None
    USE_FS = False

_MEMORY: dict = {}
_REFUNDED_ORDERS: set = set()  # Track which orders have been refunded


class RefundService:
    def __init__(self, order_service=None, policy_service=None, notification_service=None):
        self._orders = order_service
        self._policy = policy_service
        self._notifications = notification_service

    async def process_refund(
        self, order_id: str, reason: str, amount: float = None,
        customer_id: str = None, customer_tier: str = "Standard",
        customer_email: str = None,
    ) -> dict:
        # Validate inputs
        if not order_id:
            return {"success": False, "error": "Please provide an order ID."}
        if not reason or not reason.strip():
            return {"success": False, "error": "Please provide a reason for the refund."}

        # Check for duplicate refund
        if order_id in _REFUNDED_ORDERS:
            return {"success": False, "error": f"Order {order_id} has already been refunded."}

        # Look up order
        order = None
        if self._orders:
            order = await self._orders.get_order(order_id)
        if not order:
            return {"success": False, "error": f"Order {order_id} not found. Please check the order ID."}

        # Check order status — can't refund cancelled orders
        status = order.get("status", "")
        if status in ("refund_processed", "cancelled"):
            return {"success": False, "error": f"Order {order_id} has already been {status}. Cannot process another refund."}

        # Check policy
        eligibility = {"eligible": True, "refund_type": "full", "restocking_fee_pct": 0, "needs_manager_approval": False}
        if self._policy:
            eligibility = self._policy.check_refund_eligibility(order, reason, customer_tier)

        if not eligibility["eligible"]:
            return {
                "success": False,
                "error": "This order is not eligible for a refund based on our return policy.",
                "suggestion": "I can connect you with a specialist who may be able to help.",
                "needs_escalation": True,
            }

        # Calculate refund amount with bounds checking
        order_total = order.get("total", 0)
        if amount is not None:
            if amount <= 0:
                return {"success": False, "error": "Refund amount must be greater than zero."}
            if amount > order_total:
                return {"success": False, "error": f"Refund amount (${amount:.2f}) cannot exceed order total (${order_total:.2f})."}
        else:
            if eligibility["refund_type"] == "full":
                amount = order_total
            else:
                restocking = order_total * eligibility["restocking_fee_pct"] / 100
                amount = round(order_total - restocking, 2)

        refund_id = f"REF-{uuid.uuid4().hex[:8].upper()}"
        refund = {
            "refund_id": refund_id,
            "order_id": order_id,
            "customer_id": customer_id or order.get("customer_id"),
            "amount_refunded": round(amount, 2),
            "original_total": order_total,
            "currency": "USD",
            "reason": reason,
            "refund_type": eligibility["refund_type"],
            "restocking_fee_pct": eligibility.get("restocking_fee_pct", 0),
            "expected_credit_date": "3-5 business days",
            "status": "processed",
            "processed_at": time.time(),
        }

        # Mark as refunded
        _REFUNDED_ORDERS.add(order_id)

        # Update order status
        if self._orders:
            await self._orders.update_status(order_id, "refund_processed", {
                "refund": {"refund_id": refund_id, "amount": amount},
            })

        # Send confirmation
        if self._notifications and customer_email:
            try:
                await self._notifications.send_refund_confirmation(
                    customer_id=customer_id or order.get("customer_id"),
                    customer_email=customer_email, refund=refund,
                )
                refund["confirmation_sent"] = True
            except Exception as e:
                logger.error(f"Refund confirmation email failed: {e}")
                refund["confirmation_sent"] = False

        await self._save(refund_id, refund)
        return {"success": True, **refund}

    async def get_refund(self, refund_id: str) -> Optional[dict]:
        return _MEMORY.get(f"refund:{refund_id}")

    async def list_customer_refunds(self, customer_id: str) -> list:
        return [v for k, v in _MEMORY.items() if k.startswith("refund:") and v.get("customer_id") == customer_id]

    async def _save(self, refund_id: str, refund: dict):
        _MEMORY[f"refund:{refund_id}"] = refund
        if USE_FS:
            try:
                await _db.collection("refunds").document(refund_id).set(refund)
            except Exception as e:
                logger.error(f"Refund save error: {e}")
