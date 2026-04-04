"""cart.py - Shopping cart manager with Firestore persistence."""
import asyncio, logging, os, time
logger = logging.getLogger(__name__)

try:
    from google.cloud import firestore
    _db = firestore.AsyncClient()
    USE_FS = True
except Exception as e:
    logger.warning(f"Firestore unavailable: {e}")
    _db = None
    USE_FS = False

_MEMORY: dict = {}

from catalog import PRODUCTS as _ALL_PRODUCTS
_PROD_MAP = {p["id"]: p for p in _ALL_PRODUCTS}


class CartManager:
    async def get_or_create(self, customer_id: str) -> dict:
        cart = _MEMORY.get(f"cart:{customer_id}")
        if cart: return cart
        if USE_FS:
            try:
                doc = await _db.collection("carts").document(customer_id).get()
                if doc.exists:
                    cart = doc.to_dict()
                    _MEMORY[f"cart:{customer_id}"] = cart
                    return cart
            except Exception as e: logger.error(f"Cart get error: {e}")
        cart = {"customer_id": customer_id, "items": [], "subtotal": 0.0,
                "discount_pct": 0, "offer_code": None, "updated_at": time.time()}
        _MEMORY[f"cart:{customer_id}"] = cart
        return cart

    async def add_item(self, customer_id: str, product_id: str, qty: int = 1) -> dict:
        cart = await self.get_or_create(customer_id)
        product = _PROD_MAP.get(product_id)
        if not product:
            return {"error": f"Product {product_id} not found"}
        for item in cart["items"]:
            if item["product_id"] == product_id:
                item["qty"] += qty
                break
        else:
            cart["items"].append({
                "product_id": product_id,
                "name": product["name"],
                "price": product.get("sale_price") or product["price"],
                "qty": qty,
                "image_url": product.get("image_url",""),
                "added_by_agent": True,
            })
        cart["subtotal"] = sum(i["price"] * i["qty"] for i in cart["items"])
        cart["updated_at"] = time.time()
        await self._save(customer_id, cart)
        return {"success": True, "cart": cart, "added": product["name"]}

    async def remove_item(self, customer_id: str, product_id: str) -> dict:
        cart = await self.get_or_create(customer_id)
        cart["items"] = [i for i in cart["items"] if i["product_id"] != product_id]
        cart["subtotal"] = sum(i["price"] * i["qty"] for i in cart["items"])
        cart["updated_at"] = time.time()
        await self._save(customer_id, cart)
        return {"success": True, "cart": cart}

    async def apply_offer(self, customer_id: str, code: str, discount_pct: float):
        cart = await self.get_or_create(customer_id)
        cart["offer_code"]    = code
        cart["discount_pct"]  = discount_pct
        cart["updated_at"]    = time.time()
        await self._save(customer_id, cart)

    async def _save(self, customer_id: str, cart: dict):
        _MEMORY[f"cart:{customer_id}"] = cart
        if USE_FS:
            try: await _db.collection("carts").document(customer_id).set(cart)
            except Exception as e: logger.error(f"Cart save error: {e}")
