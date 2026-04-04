"""
Notification Service — Email and messaging notifications.
Handles care guides, booking confirmations, order confirmations, follow-ups.
In production: integrate with SendGrid, SES, or Cloud Tasks for async delivery.
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

_SENT: list = []  # Track all sent notifications


class NotificationService:
    async def send_care_guide(
        self,
        customer_id: str,
        customer_email: str,
        product_name: str,
        product_id: str = None,
        care_tips: list = None,
    ) -> dict:
        """Send a personalized care guide email."""
        msg_id = f"msg_{uuid.uuid4().hex[:8]}"

        guide_sections = [
            "Watering schedule",
            "Light requirements",
            "Fertilizing guide",
            "Common problems & solutions",
            "Seasonal care calendar",
            "Repotting guide",
        ]

        notification = {
            "message_id": msg_id,
            "type": "care_guide",
            "customer_id": customer_id,
            "recipient": customer_email,
            "subject": f"Your Care Guide: {product_name}",
            "product_name": product_name,
            "product_id": product_id,
            "guide_sections": guide_sections,
            "care_tips": care_tips or [],
            "status": "sent",
            "sent_at": time.time(),
        }

        await self._record(notification)

        # In production: trigger actual email via SendGrid/SES
        logger.info(f"Care guide sent to {customer_email} for {product_name}")

        return {
            "success": True,
            "message_id": msg_id,
            "product": product_name,
            "guide_sections": guide_sections,
            "sent_to": customer_email,
        }

    async def send_booking_confirmation(
        self,
        customer_id: str,
        customer_email: str,
        booking: dict,
    ) -> dict:
        """Send booking confirmation email."""
        msg_id = f"msg_{uuid.uuid4().hex[:8]}"

        notification = {
            "message_id": msg_id,
            "type": "booking_confirmation",
            "customer_id": customer_id,
            "recipient": customer_email,
            "subject": f"Booking Confirmed: {booking.get('service_name', 'Service')}",
            "booking_id": booking.get("booking_id"),
            "details": booking,
            "status": "sent",
            "sent_at": time.time(),
        }

        await self._record(notification)
        return {"success": True, "message_id": msg_id}

    async def send_order_confirmation(
        self,
        customer_id: str,
        customer_email: str,
        order: dict,
    ) -> dict:
        """Send order confirmation email."""
        msg_id = f"msg_{uuid.uuid4().hex[:8]}"

        notification = {
            "message_id": msg_id,
            "type": "order_confirmation",
            "customer_id": customer_id,
            "recipient": customer_email,
            "subject": f"Order Confirmed: {order.get('order_id')}",
            "order_id": order.get("order_id"),
            "order_total": order.get("total"),
            "item_count": len(order.get("items", [])),
            "status": "sent",
            "sent_at": time.time(),
        }

        await self._record(notification)
        return {"success": True, "message_id": msg_id}

    async def send_follow_up(
        self,
        customer_id: str,
        customer_email: str,
        subject: str,
        body: str,
        context: dict = None,
    ) -> dict:
        """Send a follow-up email (resolution summary, etc.)."""
        msg_id = f"msg_{uuid.uuid4().hex[:8]}"

        notification = {
            "message_id": msg_id,
            "type": "follow_up",
            "customer_id": customer_id,
            "recipient": customer_email,
            "subject": subject,
            "body": body,
            "context": context,
            "status": "sent",
            "sent_at": time.time(),
        }

        await self._record(notification)
        return {"success": True, "message_id": msg_id, "subject": subject}

    async def send_refund_confirmation(
        self,
        customer_id: str,
        customer_email: str,
        refund: dict,
    ) -> dict:
        """Send refund confirmation email."""
        msg_id = f"msg_{uuid.uuid4().hex[:8]}"

        notification = {
            "message_id": msg_id,
            "type": "refund_confirmation",
            "customer_id": customer_id,
            "recipient": customer_email,
            "subject": f"Refund Processed: {refund.get('refund_id')}",
            "refund_id": refund.get("refund_id"),
            "amount": refund.get("amount_refunded"),
            "status": "sent",
            "sent_at": time.time(),
        }

        await self._record(notification)
        return {"success": True, "message_id": msg_id}

    async def get_delivery_status(self, customer_id: str) -> list:
        """Get all notification delivery statuses for a customer."""
        return [n for n in _SENT if n.get("customer_id") == customer_id]

    async def _record(self, notification: dict):
        _SENT.append(notification)
        if USE_FS:
            try:
                await _db.collection("notifications").document(
                    notification["message_id"]
                ).set(notification)
            except Exception as e:
                logger.error(f"Notification record error: {e}")
