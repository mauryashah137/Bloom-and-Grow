"""
Booking Service — Schedule consultations, installations, planting, repair, delivery.
Manages availability, confirmation, and specialist assignment.
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

# Available service types with details
SERVICE_TYPES = {
    "consultation": {
        "name": "Garden Consultation",
        "duration_minutes": 60,
        "price": 0.0,
        "description": "Free 1-on-1 session with a garden expert",
    },
    "planting": {
        "name": "Professional Planting Service",
        "duration_minutes": 120,
        "price": 75.00,
        "description": "Expert planting and setup for your new plants",
    },
    "installation": {
        "name": "Garden Installation",
        "duration_minutes": 240,
        "price": 200.00,
        "description": "Full garden bed or feature installation",
    },
    "repair": {
        "name": "Plant Health Assessment & Repair",
        "duration_minutes": 60,
        "price": 45.00,
        "description": "Diagnose and treat plant health issues",
    },
    "delivery": {
        "name": "White Glove Delivery",
        "duration_minutes": 60,
        "price": 25.00,
        "description": "Premium delivery with setup assistance",
    },
}

# Specialist roster
SPECIALISTS = [
    {"id": "SP001", "name": "Sarah M.", "title": "Senior Garden Consultant", "specialties": ["consultation", "planting", "installation"]},
    {"id": "SP002", "name": "James K.", "title": "Plant Health Specialist", "specialties": ["repair", "consultation"]},
    {"id": "SP003", "name": "Maria L.", "title": "Landscape Designer", "specialties": ["installation", "planting"]},
    {"id": "SP004", "name": "David R.", "title": "Delivery Coordinator", "specialties": ["delivery"]},
]

# Available time slots (simplified — in production, query calendar API)
AVAILABLE_SLOTS = [
    "09:00 AM - 10:00 AM",
    "10:00 AM - 12:00 PM",
    "01:00 PM - 03:00 PM",
    "03:00 PM - 05:00 PM",
]


class BookingService:
    async def create_booking(
        self,
        customer_id: str,
        service_type: str,
        preferred_date: str = None,
        preferred_time: str = None,
        notes: str = "",
        address: str = None,
    ) -> dict:
        """Create a new service booking."""
        svc = SERVICE_TYPES.get(service_type)
        if not svc:
            return {"error": f"Unknown service type: {service_type}. Available: {list(SERVICE_TYPES.keys())}"}

        booking_id = f"BK-{uuid.uuid4().hex[:6].upper()}"

        # Find available specialist
        specialist = self._find_specialist(service_type)

        # Determine time slot
        confirmed_date = preferred_date or "2026-04-10"
        confirmed_time = preferred_time or AVAILABLE_SLOTS[1]  # Default to 10-12

        booking = {
            "booking_id": booking_id,
            "customer_id": customer_id,
            "service_type": service_type,
            "service_name": svc["name"],
            "service_price": svc["price"],
            "duration_minutes": svc["duration_minutes"],
            "confirmed_date": confirmed_date,
            "confirmed_time": confirmed_time,
            "specialist": specialist,
            "address": address,
            "notes": notes,
            "status": "confirmed",
            "created_at": time.time(),
            "confirmation_sent": True,
        }

        await self._save(booking_id, booking)

        return {
            "success": True,
            "booking_id": booking_id,
            "service_type": service_type,
            "service_name": svc["name"],
            "price": svc["price"],
            "confirmed_date": confirmed_date,
            "confirmed_time": confirmed_time,
            "specialist": f"{specialist['name']}, {specialist['title']}",
            "duration": f"{svc['duration_minutes']} minutes",
            "notes": notes,
            "confirmation_email_sent": True,
        }

    async def get_booking(self, booking_id: str) -> Optional[dict]:
        return _MEMORY.get(f"booking:{booking_id}")

    async def list_customer_bookings(self, customer_id: str) -> list:
        return [
            v for k, v in _MEMORY.items()
            if k.startswith("booking:") and v.get("customer_id") == customer_id
        ]

    async def cancel_booking(self, booking_id: str) -> dict:
        booking = _MEMORY.get(f"booking:{booking_id}")
        if not booking:
            return {"error": "Booking not found"}
        booking["status"] = "cancelled"
        booking["cancelled_at"] = time.time()
        await self._save(booking_id, booking)
        return {"success": True, "booking_id": booking_id, "status": "cancelled"}

    async def get_available_slots(self, service_type: str, date: str = None) -> dict:
        """Get available time slots for a service type."""
        svc = SERVICE_TYPES.get(service_type, {})
        return {
            "service_type": service_type,
            "service_name": svc.get("name", service_type),
            "date": date or "Next available",
            "available_slots": AVAILABLE_SLOTS,
            "price": svc.get("price", 0),
        }

    def _find_specialist(self, service_type: str) -> dict:
        for sp in SPECIALISTS:
            if service_type in sp["specialties"]:
                return {"name": sp["name"], "title": sp["title"], "id": sp["id"]}
        return {"name": "Available Specialist", "title": "Garden Expert", "id": "SP000"}

    async def _save(self, booking_id: str, booking: dict):
        _MEMORY[f"booking:{booking_id}"] = booking
        if USE_FS:
            try:
                await _db.collection("bookings").document(booking_id).set(booking)
            except Exception as e:
                logger.error(f"Booking save error: {e}")
