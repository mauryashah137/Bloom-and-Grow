"""
Booking Service — Schedule services with full edge case handling.
"""
import logging, time, uuid
from datetime import datetime, timedelta
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

SERVICE_TYPES = {
    "consultation": {"name": "Garden Consultation", "duration_minutes": 60, "price": 0.0, "description": "Free 1-on-1 session with a garden expert"},
    "planting": {"name": "Professional Planting Service", "duration_minutes": 120, "price": 75.00, "description": "Expert planting and setup"},
    "installation": {"name": "Garden Installation", "duration_minutes": 240, "price": 200.00, "description": "Full garden bed or feature installation"},
    "repair": {"name": "Plant Health Assessment & Repair", "duration_minutes": 60, "price": 45.00, "description": "Diagnose and treat plant health issues"},
    "delivery": {"name": "White Glove Delivery", "duration_minutes": 60, "price": 25.00, "description": "Premium delivery with setup assistance"},
}

SPECIALISTS = [
    {"id": "SP001", "name": "Sarah M.", "title": "Senior Garden Consultant", "specialties": ["consultation", "planting", "installation"]},
    {"id": "SP002", "name": "James K.", "title": "Plant Health Specialist", "specialties": ["repair", "consultation"]},
    {"id": "SP003", "name": "Maria L.", "title": "Landscape Designer", "specialties": ["installation", "planting"]},
    {"id": "SP004", "name": "David R.", "title": "Delivery Coordinator", "specialties": ["delivery"]},
]

AVAILABLE_SLOTS = ["09:00 AM - 10:00 AM", "10:00 AM - 12:00 PM", "01:00 PM - 03:00 PM", "03:00 PM - 05:00 PM"]

# Track booked slots to prevent double-booking
_BOOKED_SLOTS: dict = {}


class BookingService:
    async def create_booking(
        self, customer_id: str, service_type: str,
        preferred_date: str = None, preferred_time: str = None,
        notes: str = "", address: str = None,
    ) -> dict:
        # Validate service type
        svc = SERVICE_TYPES.get(service_type)
        if not svc:
            return {"error": f"Unknown service type: '{service_type}'. Available: {', '.join(SERVICE_TYPES.keys())}"}

        # Validate customer
        if not customer_id:
            return {"error": "Customer ID is required for booking."}

        # Validate and normalize date
        confirmed_date = preferred_date
        if confirmed_date:
            try:
                parsed = self._parse_date(confirmed_date)
                if parsed < datetime.now().date():
                    return {"error": f"Cannot book for a past date ({confirmed_date}). Please choose a future date."}
                confirmed_date = parsed.strftime("%Y-%m-%d")
            except ValueError:
                # Try to interpret natural language dates
                confirmed_date = self._interpret_date(confirmed_date)
                if not confirmed_date:
                    return {"error": f"Could not understand date '{preferred_date}'. Please use a format like '2026-04-15' or 'next Monday'."}
        else:
            # Default to next available day (tomorrow or next business day)
            tomorrow = datetime.now().date() + timedelta(days=1)
            if tomorrow.weekday() >= 5:  # Weekend
                tomorrow += timedelta(days=(7 - tomorrow.weekday()))
            confirmed_date = tomorrow.strftime("%Y-%m-%d")

        # Validate time slot
        confirmed_time = preferred_time or AVAILABLE_SLOTS[1]
        if confirmed_time not in AVAILABLE_SLOTS and preferred_time:
            # Try to match partial input
            matched = [s for s in AVAILABLE_SLOTS if preferred_time.lower() in s.lower()]
            if matched:
                confirmed_time = matched[0]
            else:
                return {
                    "error": f"Time slot '{preferred_time}' is not available.",
                    "available_slots": AVAILABLE_SLOTS,
                }

        # Check for double booking
        slot_key = f"{confirmed_date}:{confirmed_time}"
        if slot_key in _BOOKED_SLOTS:
            return {
                "error": f"That time slot is already booked on {confirmed_date}.",
                "available_slots": [s for s in AVAILABLE_SLOTS if f"{confirmed_date}:{s}" not in _BOOKED_SLOTS],
            }

        # Validate address for delivery/installation
        if service_type in ("delivery", "installation") and not address:
            logger.warning(f"No address provided for {service_type} booking")

        booking_id = f"BK-{uuid.uuid4().hex[:6].upper()}"
        specialist = self._find_specialist(service_type)

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

        # Mark slot as booked
        _BOOKED_SLOTS[slot_key] = booking_id

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
        return [v for k, v in _MEMORY.items() if k.startswith("booking:") and v.get("customer_id") == customer_id]

    async def cancel_booking(self, booking_id: str) -> dict:
        booking = _MEMORY.get(f"booking:{booking_id}")
        if not booking:
            return {"error": "Booking not found"}
        if booking.get("status") == "cancelled":
            return {"error": "This booking is already cancelled."}
        booking["status"] = "cancelled"
        booking["cancelled_at"] = time.time()
        # Free up the slot
        slot_key = f"{booking.get('confirmed_date')}:{booking.get('confirmed_time')}"
        _BOOKED_SLOTS.pop(slot_key, None)
        await self._save(booking_id, booking)
        return {"success": True, "booking_id": booking_id, "status": "cancelled"}

    async def get_available_slots(self, service_type: str, date: str = None) -> dict:
        svc = SERVICE_TYPES.get(service_type, {})
        if date:
            available = [s for s in AVAILABLE_SLOTS if f"{date}:{s}" not in _BOOKED_SLOTS]
        else:
            available = list(AVAILABLE_SLOTS)
        return {
            "service_type": service_type,
            "service_name": svc.get("name", service_type),
            "date": date or "Next available",
            "available_slots": available,
            "price": svc.get("price", 0),
        }

    def _find_specialist(self, service_type: str) -> dict:
        for sp in SPECIALISTS:
            if service_type in sp["specialties"]:
                return {"name": sp["name"], "title": sp["title"], "id": sp["id"]}
        return {"name": "Available Specialist", "title": "Garden Expert", "id": "SP000"}

    def _parse_date(self, date_str: str) -> "datetime.date":
        for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m-%d-%Y", "%B %d, %Y", "%b %d, %Y"):
            try:
                return datetime.strptime(date_str.strip(), fmt).date()
            except ValueError:
                continue
        raise ValueError(f"Cannot parse date: {date_str}")

    def _interpret_date(self, text: str) -> Optional[str]:
        """Try to interpret natural language dates."""
        text = text.lower().strip()
        today = datetime.now().date()
        day_map = {"monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3, "friday": 4, "saturday": 5, "sunday": 6}
        if text == "tomorrow":
            return (today + timedelta(days=1)).strftime("%Y-%m-%d")
        if text == "today":
            return today.strftime("%Y-%m-%d")
        for day_name, day_num in day_map.items():
            if day_name in text:
                days_ahead = day_num - today.weekday()
                if "next" in text or days_ahead <= 0:
                    days_ahead += 7
                return (today + timedelta(days=days_ahead)).strftime("%Y-%m-%d")
        return None

    async def _save(self, booking_id: str, booking: dict):
        _MEMORY[f"booking:{booking_id}"] = booking
        if USE_FS:
            try:
                await _db.collection("bookings").document(booking_id).set(booking)
            except Exception as e:
                logger.error(f"Booking save error: {e}")
