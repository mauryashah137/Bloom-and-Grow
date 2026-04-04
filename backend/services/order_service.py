"""
Order Service — Full order lifecycle: create, lookup, list, status updates.
Persists to Firestore with in-memory fallback.
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

# Seed some demo orders for support flow
SEED_ORDERS = {
    "ORD-88712": {
        "order_id": "ORD-88712",
        "customer_id": "demo_customer_001",
        "status": "shipped",
        "items": [
            {"product_id": "P006", "name": "Premium Potting Mix 8qt", "qty": 2, "price": 18.99},
            {"product_id": "P008", "name": "Liquid Fertilizer 32oz All-Purpose", "qty": 2, "price": 13.99},
        ],
        "subtotal": 65.96,
        "tax": 5.54,
        "shipping_cost": 0,
        "discount_pct": 0,
        "total": 71.50,
        "shipping": {
            "method": "standard",
            "carrier": "UPS",
            "tracking_number": "1Z999AA10123456784",
            "estimated_delivery": "2026-04-07",
            "status": "in_transit",
            "last_update": "Out for delivery — 3 stops away",
        },
        "payment": {"method": "card", "last4": "4242", "status": "captured"},
        "placed_at": "2026-04-01T09:15:00Z",
        "updated_at": "2026-04-04T08:30:00Z",
    },
    "ORD-77431": {
        "order_id": "ORD-77431",
        "customer_id": "demo_customer_001",
        "status": "delivered",
        "items": [
            {"product_id": "P006", "name": "Premium Potting Mix 8qt", "qty": 2, "price": 18.99},
            {"product_id": "P008", "name": "Liquid Fertilizer 32oz All-Purpose", "qty": 1, "price": 13.99},
        ],
        "subtotal": 51.97,
        "tax": 4.37,
        "shipping_cost": 0,
        "discount_pct": 10,
        "total": 50.71,
        "shipping": {
            "method": "standard",
            "carrier": "USPS",
            "tracking_number": "9400111899223100012345",
            "estimated_delivery": "2026-03-18",
            "status": "delivered",
            "delivered_at": "2026-03-17T14:22:00Z",
        },
        "payment": {"method": "card", "last4": "4242", "status": "captured"},
        "placed_at": "2026-03-15T11:30:00Z",
        "updated_at": "2026-03-17T14:22:00Z",
    },
}

# Load seed orders into memory
_MEMORY.update({f"order:{k}": v for k, v in SEED_ORDERS.items()})


class OrderService:
    async def create_order(self, customer_id: str, cart: dict, shipping: dict, payment: dict) -> dict:
        """Create an order from a cart."""
        # Validate cart has items
        if not cart.get("items"):
            return {"error": "Cannot create order — cart is empty."}
        if not customer_id:
            return {"error": "Customer ID is required."}

        order_id = f"ORD-{uuid.uuid4().hex[:5].upper()}"
        subtotal = max(cart.get("subtotal", 0), 0)  # Ensure non-negative
        discount_pct = min(max(cart.get("discount_pct", 0), 0), 100)  # Clamp 0-100
        tax = round(subtotal * 0.084, 2)
        discount_amount = round(subtotal * discount_pct / 100, 2)
        shipping_cost = max(shipping.get("cost", 0), 0)  # Ensure non-negative
        total = round(max(subtotal - discount_amount + tax + shipping_cost, 0), 2)  # Ensure non-negative

        order = {
            "order_id": order_id,
            "customer_id": customer_id,
            "status": "confirmed",
            "items": [
                {
                    "product_id": item["product_id"],
                    "name": item["name"],
                    "qty": item["qty"],
                    "price": item["price"],
                }
                for item in cart.get("items", [])
            ],
            "subtotal": subtotal,
            "tax": tax,
            "discount_pct": discount_pct,
            "discount_amount": discount_amount,
            "shipping_cost": shipping.get("cost", 0),
            "total": total,
            "shipping": {
                "method": shipping.get("method", "pickup"),
                "address": shipping.get("address"),
                "carrier": None,
                "tracking_number": None,
                "estimated_delivery": None,
                "status": "processing",
            },
            "payment": {
                "method": payment.get("method", "card"),
                "last4": payment.get("last4", "****"),
                "status": "captured",
            },
            "contact": {
                "email": shipping.get("email"),
                "phone": shipping.get("phone"),
                "first_name": shipping.get("first_name"),
                "last_name": shipping.get("last_name"),
            },
            "offer_code": cart.get("offer_code"),
            "placed_at": time.time(),
            "updated_at": time.time(),
        }

        await self._save(order_id, order)

        # Link order to customer
        await self._link_to_customer(customer_id, order_id)

        return order

    async def get_order(self, order_id: str) -> Optional[dict]:
        order = _MEMORY.get(f"order:{order_id}")
        if order:
            return order
        if USE_FS:
            try:
                doc = await _db.collection("orders").document(order_id).get()
                if doc.exists:
                    order = doc.to_dict()
                    _MEMORY[f"order:{order_id}"] = order
                    return order
            except Exception as e:
                logger.error(f"Order get error: {e}")
        return None

    async def get_order_status(self, order_id: str = None, customer_id: str = None, show_recent: bool = False) -> dict:
        """Get order status by ID, or list recent orders for a customer."""
        if order_id:
            order = await self.get_order(order_id)
            if order:
                return order
            return {"error": f"Order {order_id} not found"}

        if show_recent and customer_id:
            orders = await self.list_customer_orders(customer_id, limit=5)
            return {"orders": orders, "count": len(orders)}

        return {"error": "Please provide an order_id or set show_recent=true"}

    async def list_customer_orders(self, customer_id: str, limit: int = 10) -> list:
        """Get all orders for a customer."""
        if USE_FS:
            try:
                q = (_db.collection("orders")
                     .where("customer_id", "==", customer_id)
                     .order_by("placed_at", direction=firestore.Query.DESCENDING)
                     .limit(limit))
                return [d.to_dict() async for d in q.stream()]
            except Exception as e:
                logger.error(f"List orders error: {e}")

        # Memory fallback
        orders = [
            v for k, v in _MEMORY.items()
            if k.startswith("order:") and v.get("customer_id") == customer_id
        ]
        orders.sort(key=lambda o: o.get("placed_at", 0), reverse=True)
        return orders[:limit]

    async def update_status(self, order_id: str, status: str, details: dict = None) -> dict:
        order = await self.get_order(order_id)
        if not order:
            return {"error": f"Order {order_id} not found"}
        order["status"] = status
        order["updated_at"] = time.time()
        if details:
            order.update(details)
        await self._save(order_id, order)
        return order

    async def get_order_context_for_support(self, customer_id: str) -> dict:
        """Get rich order context for support agent."""
        orders = await self.list_customer_orders(customer_id, limit=5)
        return {
            "total_orders": len(orders),
            "recent_orders": [
                {
                    "order_id": o["order_id"],
                    "status": o["status"],
                    "total": o.get("total"),
                    "items": [{"name": i["name"], "qty": i["qty"]} for i in o.get("items", [])],
                    "placed_at": o.get("placed_at"),
                }
                for o in orders
            ],
        }

    async def _save(self, order_id: str, order: dict):
        _MEMORY[f"order:{order_id}"] = order
        if USE_FS:
            try:
                await _db.collection("orders").document(order_id).set(order)
            except Exception as e:
                logger.error(f"Order save error: {e}")

    async def _link_to_customer(self, customer_id: str, order_id: str):
        """Track which orders belong to a customer."""
        key = f"customer_orders:{customer_id}"
        orders = _MEMORY.get(key, [])
        orders.append(order_id)
        _MEMORY[key] = orders
        if USE_FS:
            try:
                from google.cloud.firestore import ArrayUnion
                await _db.collection("customers").document(customer_id).update(
                    {"order_ids": ArrayUnion([order_id])}
                )
            except Exception as e:
                logger.error(f"Link order to customer error: {e}")
