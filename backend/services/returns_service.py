"""
Returns Service — Manage product returns with shipping labels and tracking.
"""
import logging, time, uuid

logger = logging.getLogger(__name__)

_MEMORY: dict = {}


class ReturnsService:
    def __init__(self, order_service=None, refund_service=None):
        self._orders = order_service
        self._refunds = refund_service

    async def initiate_return(
        self,
        order_id: str,
        items: list,
        reason: str,
        customer_id: str = None,
    ) -> dict:
        """Initiate a return for specific items in an order."""
        return_id = f"RET-{uuid.uuid4().hex[:6].upper()}"

        # Look up order
        order = None
        if self._orders:
            order = await self._orders.get_order(order_id)
        if not order:
            return {"error": f"Order {order_id} not found"}

        # Validate items exist in order
        order_items = {i["product_id"]: i for i in order.get("items", [])}
        return_items = []
        for item in items:
            pid = item if isinstance(item, str) else item.get("product_id", "")
            if pid in order_items:
                return_items.append(order_items[pid])

        if not return_items:
            return {"error": "None of the specified items found in this order"}

        return_amount = sum(i["price"] * i.get("qty", 1) for i in return_items)

        ret = {
            "return_id": return_id,
            "order_id": order_id,
            "customer_id": customer_id or order.get("customer_id"),
            "items": return_items,
            "reason": reason,
            "return_amount": round(return_amount, 2),
            "status": "initiated",
            "shipping_label": {
                "carrier": "USPS",
                "tracking_number": f"9400{uuid.uuid4().hex[:16].upper()}",
                "label_url": f"https://shipping.greenleaf.example/labels/{return_id}",
            },
            "instructions": [
                "Pack items securely in original packaging if possible",
                "Attach the prepaid shipping label",
                "Drop off at any USPS location",
                "Refund will be processed within 3-5 business days of receipt",
            ],
            "created_at": time.time(),
        }

        _MEMORY[f"return:{return_id}"] = ret

        # Update order status
        if self._orders:
            await self._orders.update_status(order_id, "return_initiated", {
                "return": {"return_id": return_id, "items": [i["product_id"] for i in return_items]},
            })

        return {
            "success": True,
            **ret,
        }

    async def get_return(self, return_id: str) -> dict:
        return _MEMORY.get(f"return:{return_id}", {"error": "Return not found"})

    async def list_customer_returns(self, customer_id: str) -> list:
        return [
            v for k, v in _MEMORY.items()
            if k.startswith("return:") and v.get("customer_id") == customer_id
        ]
