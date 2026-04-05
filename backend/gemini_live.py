"""
Gemini Live API session wrapper — full multimodal support.
Uses the google-genai SDK session.send() method with:
  - LiveClientRealtimeInput for audio/video streaming
  - LiveClientContent for turn-based content (images, text)
  - LiveClientToolResponse for function call responses
  - receive() yields LiveServerMessage with server_content and tool_call

Model: gemini-live-2.5-flash-native-audio (production, Vertex AI)
Audio: PCM 16kHz input, 24kHz output
"""
import asyncio, base64, logging, os, time
from typing import AsyncIterator, Optional, TYPE_CHECKING
from google import genai
from google.genai import types

if TYPE_CHECKING:
    from tools import ToolDispatcher
    from session_store import SessionStore
    from catalog import ProductCatalog
    from cart import CartManager
    from approvals import ApprovalQueue

logger = logging.getLogger(__name__)

GCP_PROJECT = os.environ.get("GCP_PROJECT", "")
GCP_LOCATION = os.getenv("GCP_LOCATION", "us-central1")
MODEL = os.getenv("GEMINI_MODEL", "gemini-live-2.5-flash-native-audio")

# ── Tool declarations ─────────────────────────────────────────────────────────
SHOP_TOOLS = [
    "identify_plant_or_product", "recommend_products", "get_product_details",
    "add_to_cart", "remove_from_cart", "apply_offer",
    "request_discount_approval", "get_service_info", "schedule_service",
    "send_care_guide", "navigate_page", "connect_to_human",
]

SUPPORT_TOOLS = [
    "get_order_status", "process_refund", "identify_plant_or_product",
    "update_support_ticket", "send_follow_up_email", "apply_offer",
    "request_discount_approval", "get_service_info", "schedule_service",
    "send_care_guide", "navigate_page", "connect_to_human",
]

ALL_TOOL_DECLARATIONS = {
    "identify_plant_or_product": types.FunctionDeclaration(
        name="identify_plant_or_product",
        description="Identify a plant or product the customer is showing via camera or image. Returns identification, health assessment, and matching catalog products. Safe to call anytime the customer shows something.",
        parameters=types.Schema(type=types.Type.OBJECT, properties={
            "context": types.Schema(type=types.Type.STRING, description="What the customer said about what they're showing"),
        }),
    ),
    "recommend_products": types.FunctionDeclaration(
        name="recommend_products",
        description="Search for product recommendations. Returns a list of suggestions. IMPORTANT: After getting results, TELL the customer what you found and ASK if they want to add anything. Do NOT auto-add to cart.",
        parameters=types.Schema(type=types.Type.OBJECT, properties={
            "need": types.Schema(type=types.Type.STRING, description="What the customer needs"),
            "budget_max": types.Schema(type=types.Type.NUMBER, description="Max budget in USD"),
            "category": types.Schema(type=types.Type.STRING, description="Category: plants, tools, soil, pots, decor"),
            "skill_level": types.Schema(type=types.Type.STRING, enum=["beginner", "intermediate", "expert"]),
        }),
    ),
    "get_product_details": types.FunctionDeclaration(
        name="get_product_details",
        description="Look up details for a specific product including price, availability, and reviews.",
        parameters=types.Schema(type=types.Type.OBJECT, required=["product_id"], properties={
            "product_id": types.Schema(type=types.Type.STRING),
        }),
    ),
    "add_to_cart": types.FunctionDeclaration(
        name="add_to_cart",
        description="Add a product to the cart. ONLY call this AFTER the customer has explicitly said yes to adding it. Never call without customer confirmation.",
        parameters=types.Schema(type=types.Type.OBJECT, required=["product_id"], properties={
            "product_id": types.Schema(type=types.Type.STRING),
            "qty": types.Schema(type=types.Type.INTEGER, description="Quantity, default 1"),
        }),
    ),
    "remove_from_cart": types.FunctionDeclaration(
        name="remove_from_cart",
        description="Remove a product from the cart. Only call after the customer confirms they want it removed.",
        parameters=types.Schema(type=types.Type.OBJECT, required=["product_id"], properties={
            "product_id": types.Schema(type=types.Type.STRING),
        }),
    ),
    "apply_offer": types.FunctionDeclaration(
        name="apply_offer",
        description="Apply a promo code to the cart. Only call when the customer provides a specific code.",
        parameters=types.Schema(type=types.Type.OBJECT, required=["offer_code"], properties={
            "offer_code": types.Schema(type=types.Type.STRING),
        }),
    ),
    "request_discount_approval": types.FunctionDeclaration(
        name="request_discount_approval",
        description="Send a discount request to the manager for approval. Use when the customer asks for a discount above your authorized limit. Tell the customer you are checking with your supervisor and wait for the result.",
        parameters=types.Schema(type=types.Type.OBJECT, required=["discount_pct", "reason"], properties={
            "discount_pct": types.Schema(type=types.Type.NUMBER, description="Discount percentage"),
            "reason": types.Schema(type=types.Type.STRING, description="Why the customer wants this discount"),
        }),
    ),
    "get_order_status": types.FunctionDeclaration(
        name="get_order_status",
        description="Look up order status by order ID, or show recent orders if no ID is given.",
        parameters=types.Schema(type=types.Type.OBJECT, properties={
            "order_id": types.Schema(type=types.Type.STRING),
            "show_recent": types.Schema(type=types.Type.BOOLEAN, description="If true, return recent orders"),
        }),
    ),
    "process_refund": types.FunctionDeclaration(
        name="process_refund",
        description="Process a refund. CRITICAL: You MUST get explicit verbal confirmation from the customer BEFORE calling this. Tell them the amount first and wait for 'yes'.",
        parameters=types.Schema(type=types.Type.OBJECT, required=["order_id", "reason"], properties={
            "order_id": types.Schema(type=types.Type.STRING),
            "amount": types.Schema(type=types.Type.NUMBER, description="Refund amount, or omit for full refund"),
            "reason": types.Schema(type=types.Type.STRING),
        }),
    ),
    "schedule_service": types.FunctionDeclaration(
        name="schedule_service",
        description="Book a service appointment. CRITICAL: Before calling this, you MUST have: 1) Told the customer the price, 2) Discussed the date and time, 3) Gotten explicit 'yes' confirmation. Never book without all three.",
        parameters=types.Schema(type=types.Type.OBJECT, required=["service_type"], properties={
            "service_type": types.Schema(type=types.Type.STRING, enum=["consultation", "planting", "installation", "repair", "delivery"]),
            "preferred_date": types.Schema(type=types.Type.STRING, description="Confirmed date"),
            "preferred_time": types.Schema(type=types.Type.STRING, description="Confirmed time slot"),
            "notes": types.Schema(type=types.Type.STRING),
        }),
    ),
    "get_service_info": types.FunctionDeclaration(
        name="get_service_info",
        description="Get pricing and available time slots for a service. Use this FIRST when the customer asks about services. This does NOT book anything — it just returns info for you to present. Only call schedule_service AFTER the customer confirms.",
        parameters=types.Schema(type=types.Type.OBJECT, required=["service_type"], properties={
            "service_type": types.Schema(type=types.Type.STRING, enum=["consultation", "planting", "installation", "repair", "delivery"]),
            "preferred_date": types.Schema(type=types.Type.STRING, description="Optional date to check availability"),
        }),
    ),
    "navigate_page": types.FunctionDeclaration(
        name="navigate_page",
        description="Navigate the customer to a page on the website. Use when they say 'open my cart', 'go to checkout', 'show me products', 'take me to orders', etc.",
        parameters=types.Schema(type=types.Type.OBJECT, required=["page"], properties={
            "page": types.Schema(type=types.Type.STRING, enum=["cart", "checkout", "shop", "orders", "support", "home"],
                                 description="Which page to navigate to"),
        }),
    ),
    "send_care_guide": types.FunctionDeclaration(
        name="send_care_guide",
        description="Email care instructions for a plant or product. Ask the customer if they would like this before sending.",
        parameters=types.Schema(type=types.Type.OBJECT, required=["product_name"], properties={
            "product_name": types.Schema(type=types.Type.STRING),
        }),
    ),
    "update_support_ticket": types.FunctionDeclaration(
        name="update_support_ticket",
        description="Create or update a support ticket.",
        parameters=types.Schema(type=types.Type.OBJECT, required=["subject", "description", "priority"], properties={
            "ticket_id": types.Schema(type=types.Type.STRING),
            "subject": types.Schema(type=types.Type.STRING),
            "description": types.Schema(type=types.Type.STRING),
            "priority": types.Schema(type=types.Type.STRING, enum=["low", "medium", "high", "urgent"]),
        }),
    ),
    "send_follow_up_email": types.FunctionDeclaration(
        name="send_follow_up_email",
        description="Send a follow-up email to the customer. Ask before sending.",
        parameters=types.Schema(type=types.Type.OBJECT, required=["subject", "body"], properties={
            "subject": types.Schema(type=types.Type.STRING),
            "body": types.Schema(type=types.Type.STRING),
        }),
    ),
    "connect_to_human": types.FunctionDeclaration(
        name="connect_to_human",
        description="Transfer to a human specialist. Tell the customer you are transferring them and why.",
        parameters=types.Schema(type=types.Type.OBJECT, required=["reason"], properties={
            "reason": types.Schema(type=types.Type.STRING),
            "priority": types.Schema(type=types.Type.STRING, enum=["normal", "urgent"]),
            "specialist_type": types.Schema(type=types.Type.STRING, enum=["general", "garden_expert", "sales", "returns"]),
        }),
    ),
}


def get_tools_for_mode(mode: str) -> types.Tool:
    tool_names = SHOP_TOOLS if mode == "shop" else SUPPORT_TOOLS
    declarations = [ALL_TOOL_DECLARATIONS[n] for n in tool_names if n in ALL_TOOL_DECLARATIONS]
    return types.Tool(function_declarations=declarations)


class GeminiLiveSession:
    def __init__(self, session_id, voice, language, system_instruction,
                 tool_dispatcher, session_store, catalog, cart_manager,
                 approval_queue, customer_id, mode="shop"):
        self.session_id          = session_id
        self.voice               = voice
        self.language            = language
        self.system_instruction  = system_instruction
        self.tool_dispatcher     = tool_dispatcher
        self.session_store       = session_store
        self.catalog             = catalog
        self.cart_manager        = cart_manager
        self.approval_queue      = approval_queue
        self.customer_id         = customer_id
        self.mode                = mode

        self._client      = genai.Client(vertexai=True, project=GCP_PROJECT, location=GCP_LOCATION)
        self._session     = None
        self._queue: asyncio.Queue = asyncio.Queue()
        self._approval_queue: asyncio.Queue = asyncio.Queue()
        self._closed      = False
        self._last_image  = None
        self._last_vision_result = None
        self._last_recommendations = None
        self._last_discount_state = None

        self._audio_in_count = 0
        self._audio_sample_rate = 16000  # Will be updated by client
        self._connect_task = asyncio.create_task(self._connect())

    async def _connect(self):
        config = types.LiveConnectConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=self.voice)
                )
            ),
            system_instruction=types.Content(
                parts=[types.Part(text=self.system_instruction)], role="user"
            ),
            tools=[get_tools_for_mode(self.mode)],
            enable_affective_dialog=True,
            input_audio_transcription=types.AudioTranscriptionConfig(),
            output_audio_transcription=types.AudioTranscriptionConfig(),
        )
        try:
            async with self._client.aio.live.connect(model=MODEL, config=config) as session:
                self._session = session
                logger.info(f"[{self.session_id}] Gemini Live connected (model={MODEL}, mode={self.mode})")
                await self._run_session(session)
        except Exception as e:
            logger.exception(f"[{self.session_id}] Gemini error: {e}")
            await self._queue.put({"type": "error", "message": str(e)})
        finally:
            self._closed = True
            await self._queue.put(None)

    async def _run_session(self, session):
        """Run receive loop and approval monitor concurrently."""
        monitor = asyncio.create_task(self._approval_monitor(session))
        try:
            await self._receive_loop(session)
        finally:
            monitor.cancel()

    async def _receive_loop(self, session):
        logger.info(f"[{self.session_id}] Starting receive loop")
        response_count = 0
        turn_count = 0
        # CRITICAL: session.receive() yields responses for ONE model turn then ends.
        # We must loop and call receive() again to keep the conversation going.
        while not self._closed:
          try:
            turn_count += 1
            async for response in session.receive():
                response_count += 1
                if self._closed:
                    break

                # ── Audio data — send exactly ONE copy per response ─────
                audio_bytes = None

                # Prefer response.data (top-level)
                if response.data and len(response.data) > 0:
                    audio_bytes = response.data

                # Fall back to inline_data if response.data was empty
                if audio_bytes is None and response.server_content:
                    sc_check = response.server_content
                    if sc_check.model_turn and sc_check.model_turn.parts:
                        for part in sc_check.model_turn.parts:
                            if part.inline_data and part.inline_data.data and len(part.inline_data.data) > 0:
                                audio_bytes = part.inline_data.data
                                break

                if audio_bytes:
                    await self._queue.put({
                        "type": "audio_chunk",
                        "data": base64.b64encode(audio_bytes).decode(),
                    })

                # ── Server content ───────────────────────────────────────
                if response.server_content:
                    sc = response.server_content

                    # Interruption signal — user started speaking
                    if sc.interrupted:
                        await self._queue.put({"type": "interrupted"})

                    # User transcription
                    if sc.input_transcription and sc.input_transcription.text:
                        await self._queue.put({
                            "type": "transcript", "role": "user",
                            "text": sc.input_transcription.text, "final": True,
                            "ts": time.time(),
                        })

                    # Agent transcription
                    if sc.output_transcription and sc.output_transcription.text:
                        await self._queue.put({
                            "type": "transcript", "role": "agent",
                            "text": sc.output_transcription.text, "final": True,
                            "ts": time.time(),
                        })

                # ── Tool calls ───────────────────────────────────────────
                if response.tool_call:
                    for fc in response.tool_call.function_calls:
                        await self._dispatch_tool(session, fc)

          except Exception as e:
            logger.error(f"[{self.session_id}] Receive error: {type(e).__name__}: {e}")
            break

        logger.info(f"[{self.session_id}] Receive loop ended (closed={self._closed}, audio_in={self._audio_in_count}, responses={response_count}, turns={turn_count})")

    async def _approval_monitor(self, session):
        """
        Listens for manager discount decisions.
        When received, forwards to browser AND injects into Gemini so the agent speaks it.
        """
        while not self._closed:
            try:
                event = await asyncio.wait_for(self._approval_queue.get(), timeout=1.0)
                if event is None:
                    break
                if event.get("type") == "discount_resolved":
                    # Forward to browser
                    await self._queue.put(event)

                    # Update cart for browser
                    cart = await self.cart_manager.get_or_create(self.customer_id)
                    await self._queue.put({"type": "cart_updated", "cart": cart})

                    # Inject into Gemini so the agent speaks the result
                    approved = event.get("approved", False)
                    pct = event.get("discount_pct", 0)
                    original = event.get("original_pct", pct)
                    amended = event.get("amended", False)
                    note = event.get("note", "")

                    if approved:
                        if amended:
                            inject = (
                                f"[SYSTEM: The manager reviewed the discount request. "
                                f"Customer asked for {original}%, manager approved {pct}% instead. "
                                f"{note}. Discount applied to cart. Tell the customer warmly.]"
                            )
                        else:
                            inject = (
                                f"[SYSTEM: Great news! Manager approved the {pct}% discount. "
                                f"{note}. Applied to cart. Tell the customer enthusiastically.]"
                            )
                    else:
                        inject = (
                            f"[SYSTEM: Manager declined the {original}% discount. {note}. "
                            f"Let the customer know gently and suggest promo code SPRING20 for 20% off.]"
                        )

                    if session and not self._closed:
                        await session.send(input=types.LiveClientContent(
                            turns=[types.Content(role="user", parts=[types.Part(text=inject)])],
                            turn_complete=True,
                        ))
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Approval monitor error: {e}")

    async def _dispatch_tool(self, session, fc):
        name    = fc.name
        args    = dict(fc.args) if fc.args else {}
        call_id = fc.id

        # Inject last image into vision tool
        if name == "identify_plant_or_product" and self._last_image:
            args["_image_b64"] = self._last_image["data"]
            args["_mime_type"] = self._last_image["mime"]

        await self._queue.put({
            "type": "tool_call", "tool": name,
            "args": {k: v for k, v in args.items() if not k.startswith("_")},
            "status": "running", "ts": time.time(),
        })

        try:
            result = await self.tool_dispatcher.dispatch(
                name, args,
                customer_id=self.customer_id,
                catalog=self.catalog,
                cart_manager=self.cart_manager,
                approval_queue=self.approval_queue,
                session_id=self.session_id,
                session_store=self.session_store,
                last_vision_result=self._last_vision_result,
                last_recommendations=self._last_recommendations,
                last_discount_state=self._last_discount_state,
            )
            status = "success"
        except Exception as e:
            result = {"error": str(e)}
            status = "error"
            logger.error(f"Tool {name} failed: {e}")

        await self._queue.put({
            "type": "tool_call", "tool": name,
            "args": {k: v for k, v in args.items() if not k.startswith("_")},
            "result": result, "status": status, "ts": time.time(),
        })

        # ── Emit typed events ────────────────────────────────────────────

        # Cart updates
        if name in ("add_to_cart", "remove_from_cart", "apply_offer") and status == "success":
            cart = result.get("cart")
            if not cart:
                cart = await self.cart_manager.get_or_create(self.customer_id)
            await self._queue.put({"type": "cart_updated", "cart": cart})

        # Recommendations
        if name == "recommend_products" and status == "success":
            products = result.get("products", [])
            if products:
                self._last_recommendations = products
                await self._queue.put({
                    "type": "recommendation",
                    "products": products,
                    "complementary": result.get("complementary", []),
                    "context": result.get("context", {}),
                })

        # Vision results
        if name == "identify_plant_or_product" and status == "success":
            self._last_vision_result = result
            await self._queue.put({
                "type": "vision_result",
                "candidates": result.get("candidates", []),
                "health_assessment": result.get("health_assessment", {}),
                "issue_detected": result.get("issue_detected", "none"),
                "catalog_matches": result.get("catalog_matches", []),
                "next_question": result.get("next_question", ""),
                "care_tips": result.get("care_tips", []),
                "ts": time.time(),
            })

        # Discount
        if name == "request_discount_approval" and status == "success":
            self._last_discount_state = result
            if result.get("auto_approved"):
                await self._queue.put({
                    "type": "discount_resolved",
                    "request_id": result.get("request_id"),
                    "approved": True,
                    "discount_pct": result.get("discount_pct", 0),
                    "original_pct": result.get("discount_pct", 0),
                    "amended": False,
                    "note": "Auto-approved based on your loyalty tier",
                })
                cart = await self.cart_manager.get_or_create(self.customer_id)
                await self._queue.put({"type": "cart_updated", "cart": cart})
            else:
                await self._queue.put({
                    "type": "discount_pending",
                    "request_id": result.get("request_id"),
                    "amount": result.get("discount_pct", 0),
                    "reason": args.get("reason", ""),
                })

        # Service info (available times — NOT a booking)
        if name == "get_service_info" and status == "success":
            await self._queue.put({
                "type": "service_info",
                "service": result,
            })

        # Booking confirmed (only from schedule_service, NOT get_service_info)
        if name == "schedule_service" and status == "success" and result.get("success"):
            await self._queue.put({"type": "booking_confirmed", "booking": result})

        # Navigation
        if name == "navigate_page" and status == "success":
            await self._queue.put({
                "type": "navigate",
                "page": result.get("page", "home"),
            })

        # Handoff
        if name == "connect_to_human" and status == "success" and result.get("success"):
            await self._queue.put({
                "type": "handoff_created",
                "handoff_id": result.get("handoff_id"),
                "queue_position": result.get("queue_position"),
                "estimated_wait_minutes": result.get("estimated_wait_minutes"),
                "specialist_type": result.get("specialist_type"),
            })

        # ── Send tool response back to Gemini ────────────────────────────
        await session.send(input=types.LiveClientToolResponse(function_responses=[
            types.FunctionResponse(id=call_id, name=name, response={"result": result})
        ]))

    # ── Input methods ────────────────────────────────────────────────────────

    def set_audio_sample_rate(self, rate: int):
        """Set the actual sample rate from the client's AudioContext."""
        self._audio_sample_rate = rate
        logger.info(f"[{self.session_id}] Audio sample rate set to {rate}Hz")

    async def send_audio(self, b64: str):
        """Send PCM audio chunk using the legacy send() method which is proven to work."""
        if self._session and not self._closed:
            self._audio_in_count += 1
            raw = base64.b64decode(b64)
            if self._audio_in_count <= 5 or self._audio_in_count % 200 == 0:
                import struct
                n_samples = len(raw) // 2
                if n_samples > 0:
                    samples = struct.unpack(f"<{n_samples}h", raw)
                    max_val = max(abs(s) for s in samples[:100])
                else:
                    max_val = 0
                logger.info(f"[{self.session_id}] Audio #{self._audio_in_count}: {len(raw)}B, {n_samples}samp, amp={max_val}, rate={self._audio_sample_rate}")
            try:
                # Use the proven send() method with LiveClientRealtimeInput
                await self._session.send(
                    input=types.LiveClientRealtimeInput(
                        media_chunks=[types.Blob(
                            data=raw,
                            mime_type=f"audio/pcm;rate={self._audio_sample_rate}"
                        )]
                    )
                )
            except Exception as e:
                logger.error(f"[{self.session_id}] send_audio error: {e}")
                self._closed = True

    async def send_video_frame(self, b64: str):
        """Send a live camera frame (JPEG) for real-time visual context."""
        if self._session and not self._closed:
            self._last_image = {"data": b64, "mime": "image/jpeg"}
            await self._session.send(input=types.LiveClientRealtimeInput(
                media_chunks=[types.Blob(data=base64.b64decode(b64), mime_type="image/jpeg")]
            ))

    async def send_image(self, b64: str, mime_type: str = "image/jpeg"):
        """Send a one-shot uploaded image."""
        if self._session and not self._closed:
            self._last_image = {"data": b64, "mime": mime_type}
            await self._session.send(input=types.LiveClientContent(
                turns=[types.Content(role="user", parts=[
                    types.Part(inline_data=types.Blob(data=base64.b64decode(b64), mime_type=mime_type)),
                    types.Part(text="I just uploaded an image. Please analyze it."),
                ])],
                turn_complete=True,
            ))

    async def send_text(self, text: str):
        """Send a text message from the customer."""
        if self._session and not self._closed:
            await self._session.send(input=types.LiveClientContent(
                turns=[types.Content(role="user", parts=[types.Part(text=text)])],
                turn_complete=True,
            ))

    async def interrupt(self):
        """Signal end of audio stream."""
        if self._session and not self._closed:
            try:
                await self._session.send(input=types.LiveClientRealtimeInput(media_chunks=[]))
            except Exception:
                pass

    async def event_stream(self) -> AsyncIterator[dict]:
        logger.info(f"[{self.session_id}] event_stream started, queue size={self._queue.qsize()}")
        while True:
            event = await self._queue.get()
            if event is None:
                logger.info(f"[{self.session_id}] event_stream got None, ending")
                break
            yield event

    async def close(self) -> dict:
        self._closed = True
        if self._connect_task:
            self._connect_task.cancel()
        return {"session_id": self.session_id, "ended_at": time.time()}
