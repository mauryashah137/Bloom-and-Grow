"use client";
/**
 * Gemini Live Session Hook
 * Audio playback uses simple AudioBufferSourceNode scheduling (no worklet dependency).
 * Mic uses pcm-processor worklet for capture.
 */
import { useCallback, useRef } from "react";
import { useStore } from "@/store";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080/ws";
const API_BASE = WS_URL.replace(/^wss?:\/\//, "https://").replace("/ws", "");

export { API_BASE };

export function useGeminiSession() {
  const wsRef        = useRef<WebSocket | null>(null);
  // Playback (24kHz)
  const playCtxRef   = useRef<AudioContext | null>(null);
  // Recording (16kHz)
  const recCtxRef    = useRef<AudioContext | null>(null);
  const recWorkletRef = useRef<AudioWorkletNode | null>(null);
  const recSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micSampleRateRef = useRef<number>(16000);
  // Camera
  const cameraRef    = useRef<MediaStream | null>(null);
  const camIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef    = useRef<HTMLCanvasElement | null>(null);
  const sessionStartTime = useRef<number>(0);

  const store = useStore();

  // ── Playback using AudioBufferSourceNode (proven to produce sound) ─────
  const nextPlayTime = useRef<number>(0);
  const lastChunkId = useRef<string>("");
  const recentChunks = useRef<Set<string>>(new Set());
  const speakingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ensurePlayback = useCallback(async () => {
    if (playCtxRef.current && playCtxRef.current.state !== "closed") {
      if (playCtxRef.current.state === "suspended") await playCtxRef.current.resume();
      return;
    }
    const ctx = new AudioContext({ sampleRate: 24000 });
    playCtxRef.current = ctx;
    nextPlayTime.current = ctx.currentTime;
  }, []);

  const playChunk = useCallback((b64: string) => {
    const ctx = playCtxRef.current;
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    // Simple dedup — skip if identical to previous chunk
    if (b64 === lastChunkId.current) return;
    lastChunkId.current = b64;

    // Decode base64 → Int16 → Float32
    const raw = atob(b64);
    const len = raw.length;
    if (len < 2) return;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = raw.charCodeAt(i);
    const evenLen = len - (len % 2);
    const i16 = new Int16Array(bytes.buffer, 0, evenLen / 2);
    const f32 = new Float32Array(i16.length);
    for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768;

    const buf = ctx.createBuffer(1, f32.length, 24000);
    buf.copyToChannel(f32, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);

    const now = ctx.currentTime;
    // Reset if fallen behind
    if (nextPlayTime.current < now - 0.3) nextPlayTime.current = now;
    const startAt = Math.max(nextPlayTime.current, now);
    src.start(startAt);
    nextPlayTime.current = startAt + buf.duration;

    store.setAgentSpeaking(true);
    if (speakingTimer.current) clearTimeout(speakingTimer.current);
    speakingTimer.current = setTimeout(() => store.setAgentSpeaking(false), 500);
  }, [store]);

  const stopPlayback = useCallback(() => {
    if (playCtxRef.current) {
      nextPlayTime.current = playCtxRef.current.currentTime;
    }
    lastChunkId.current = "";
    recentChunks.current.clear();
    store.setAgentSpeaking(false);
  }, [store]);

  // ── Microphone ────────────────────────────────────────────────────────
  const startMic = useCallback(async () => {
    if (micStreamRef.current) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    micStreamRef.current = stream;

    if (!recCtxRef.current || recCtxRef.current.state === "closed") {
      recCtxRef.current = new AudioContext({ sampleRate: 16000 });
    }
    const ctx = recCtxRef.current;
    if (ctx.state === "suspended") await ctx.resume();
    micSampleRateRef.current = ctx.sampleRate;
    console.log(`[Mic] AudioContext sampleRate=${ctx.sampleRate}`);

    try { await ctx.audioWorklet.addModule("/pcm-processor.js"); } catch {}

    const source = ctx.createMediaStreamSource(stream);
    const worklet = new AudioWorkletNode(ctx, "pcm-processor");

    worklet.port.onmessage = (ev) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      const msg = ev.data;

      if (msg && msg.type === "sampleRate") {
        micSampleRateRef.current = msg.sampleRate;
        wsRef.current.send(JSON.stringify({ type: "sample_rate", rate: msg.sampleRate }));
        return;
      }

      const audioData = msg?.data || msg;
      if (!audioData) return;
      const pcmBytes = new Uint8Array(audioData);
      if (pcmBytes.length === 0) return;

      let binary = "";
      const CHUNK = 8192;
      for (let i = 0; i < pcmBytes.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, Array.from(pcmBytes.subarray(i, i + CHUNK)));
      }
      wsRef.current.send(JSON.stringify({ type: "audio_chunk", data: btoa(binary) }));
    };

    source.connect(worklet);
    recSourceRef.current = source;
    recWorkletRef.current = worklet;
    store.setMicActive(true);
  }, [store]);

  const stopMic = useCallback(() => {
    recSourceRef.current?.disconnect();
    recSourceRef.current = null;
    recWorkletRef.current?.disconnect();
    recWorkletRef.current = null;
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    micStreamRef.current = null;
    store.setMicActive(false);
  }, [store]);

  const toggleMic = useCallback(async () => {
    if (store.isMicActive) stopMic(); else await startMic();
  }, [store.isMicActive, startMic, stopMic]);

  // ── Connect WebSocket ─────────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (wsRef.current) return;
    store.setSessionStatus("connecting");
    store.setSessionError(null);
    store.clearActionCards();
    await ensurePlayback();

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => ws.send(JSON.stringify({
      type: "config",
      mode: store.agentMode,
      voice: "Aoede",
      language: "en-US",
      customer_id: store.customerId,
    }));

    ws.onmessage = (e) => {
      const ev = JSON.parse(e.data);
      if (ev.type === "ping") return;

      switch (ev.type) {
        case "session_started":
          store.setSessionId(ev.session_id);
          store.setSessionStatus("connected");
          sessionStartTime.current = Date.now();
          if (ev.customer) store.setCustomer(ev.customer);
          startMic();
          break;

        case "audio_chunk":
          playChunk(ev.data);
          break;

        case "interrupted":
          // User started speaking — stop agent audio immediately
          stopPlayback();
          break;

        case "transcript":
          if (ev.final) {
            store.addTranscript({
              id: `${ev.role}-${ev.ts}-${Math.random().toString(36).slice(2,6)}`,
              role: ev.role, text: ev.text, ts: ev.ts,
            });
          }
          break;

        case "tool_call":
          if (ev.status === "success") {
            if (ev.tool === "add_to_cart" && ev.result?.cart) store.setCart(ev.result.cart);
            else if (ev.tool === "remove_from_cart" && ev.result?.cart) store.setCart(ev.result.cart);
          }
          break;

        case "cart_updated":
          if (ev.cart) store.setCart(ev.cart);
          break;

        case "recommendation":
          if (ev.products?.length) {
            store.setRecommendations(ev.products);
            // Only show recommendation card after greeting phase (8s)
            if (Date.now() - sessionStartTime.current > 8000) {
              store.addActionCard({ id: `rec-${Date.now()}`, type: "recommendation", title: "Recommended for you", products: ev.products, ts: Date.now() / 1000 });
            }
          }
          break;

        case "vision_result":
          store.setVisionResult(ev);
          if (Date.now() - sessionStartTime.current > 8000) {
            store.addActionCard({ id: `vis-${Date.now()}`, type: "vision", title: ev.candidates?.[0]?.name || "Visual Identification", visionResult: ev, products: ev.catalog_matches || [], ts: Date.now() / 1000 });
          }
          break;

        case "sentiment":
          store.setSentiment(ev.value);
          break;

        case "discount_pending":
          store.setDiscountRequest({ request_id: ev.request_id, discount_pct: ev.amount, reason: ev.reason, status: "pending" });
          store.addActionCard({ id: `disc-${ev.request_id}`, type: "discount_status", title: "Checking with supervisor...", message: `Requesting ${ev.amount}% discount`, discountRequest: { request_id: ev.request_id, discount_pct: ev.amount, reason: ev.reason, status: "pending" }, ts: Date.now() / 1000 });
          break;

        case "discount_resolved":
          store.setDiscountRequest({ request_id: ev.request_id, discount_pct: ev.discount_pct, reason: ev.note || "", status: ev.approved ? "approved" : "rejected" });
          store.addActionCard({ id: `disc-r-${ev.request_id}`, type: "discount_status", title: ev.approved ? "Discount approved!" : "Discount not available", message: ev.approved ? `${ev.discount_pct}% discount applied!` : `Unable to offer that discount. ${ev.note || ""}`, discountRequest: { request_id: ev.request_id, discount_pct: ev.discount_pct, reason: ev.note || "", status: ev.approved ? "approved" : "rejected" }, ts: Date.now() / 1000 });
          break;

        case "service_info":
          // Show available times — NOT a booking confirmation
          if (ev.service && Date.now() - sessionStartTime.current > 8000) {
            const svc = ev.service;
            const slots = svc.available_slots?.join(", ") || "No slots available";
            store.addActionCard({
              id: `svc-info-${Date.now()}`, type: "text",
              title: svc.service_name || "Service Info",
              message: `${svc.service_name}: $${svc.price?.toFixed(2) || "Free"}\nAvailable: ${slots}`,
              ts: Date.now() / 1000,
            });
          }
          break;

        case "booking_confirmed":
          store.setLastBooking(ev.booking);
          store.addActionCard({ id: `book-${Date.now()}`, type: "booking", title: "Booking confirmed!", booking: ev.booking, ts: Date.now() / 1000 });
          break;

        case "navigate":
          // Set pending navigation — StorefrontLayout will use router.push() (no page reload)
          if (ev.page) {
            const routes: Record<string, string> = { cart: "/cart", checkout: "/checkout", shop: "/shop", orders: "/orders", support: "/support", home: "/" };
            const route = routes[ev.page];
            if (route) {
              store.setPendingNavigation(route);
            }
          }
          break;

        case "order_created":
          store.addOrder(ev.order);
          store.addActionCard({ id: `order-${Date.now()}`, type: "order", title: "Order placed!", order: ev.order, ts: Date.now() / 1000 });
          break;

        case "handoff_created":
          store.addActionCard({ id: `handoff-${ev.handoff_id}`, type: "handoff", title: "Connecting you to a specialist", message: `You're #${ev.queue_position} in queue. Est. wait: ${ev.estimated_wait_minutes} min.`, ts: Date.now() / 1000 });
          break;

        case "session_ended":
          store.setSessionStatus("idle");
          store.setSessionId(null);
          break;

        case "error":
          store.setSessionError(ev.message);
          store.setSessionStatus("error");
          break;
      }
    };

    ws.onerror = () => {
      store.setSessionError("Connection failed.");
      store.setSessionStatus("error");
    };
    ws.onclose = () => {
      wsRef.current = null;
      stopMic();
      stopCamera();
      stopPlayback();
      if (store.sessionStatus !== "error") store.setSessionStatus("idle");
    };
  }, [store, ensurePlayback, playChunk, startMic, stopPlayback]);

  // ── Camera ────────────────────────────────────────────────────────────
  const startCamera = useCallback(async (videoEl: HTMLVideoElement) => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 320, facingMode: "user" } });
    cameraRef.current = stream;
    videoEl.srcObject = stream;
    await videoEl.play();
    if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
    const canvas = canvasRef.current;
    canvas.width = 320; canvas.height = 320;
    store.setCameraActive(true);
    // Send frames every 1.5s — fast enough for identification
    camIntervalRef.current = setInterval(() => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) return;
      ctx2d.drawImage(videoEl, 0, 0, 320, 320);
      const b64 = canvas.toDataURL("image/jpeg", 0.5).split(",")[1];
      wsRef.current.send(JSON.stringify({ type: "video_frame", data: b64 }));
    }, 2000);
  }, [store]);

  const stopCamera = useCallback(() => {
    if (camIntervalRef.current) { clearInterval(camIntervalRef.current); camIntervalRef.current = null; }
    cameraRef.current?.getTracks().forEach(t => t.stop());
    cameraRef.current = null;
    store.setCameraActive(false);
  }, [store]);

  // ── Disconnect ────────────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    // Close WebSocket FIRST to stop new audio arriving
    if (wsRef.current) {
      try { wsRef.current.send(JSON.stringify({ type: "end_session" })); } catch {}
      wsRef.current.close();
      wsRef.current = null;
    }
    // Stop mic immediately
    stopMic();
    stopCamera();
    stopPlayback();
    // Close playback AudioContext to immediately kill all sound
    if (playCtxRef.current && playCtxRef.current.state !== "closed") {
      try { playCtxRef.current.close(); } catch {}
      playCtxRef.current = null;
    }
    // Close recording AudioContext
    if (recCtxRef.current && recCtxRef.current.state !== "closed") {
      try { recCtxRef.current.close(); } catch {}
      recCtxRef.current = null;
    }
    store.resetSession();
  }, [store, stopMic, stopCamera, stopPlayback]);

  const sendImage = useCallback((file: File) => {
    // Resize image to 512x512 before sending — prevents WebSocket choking on large photos
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (!ev.target?.result) return;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const size = 512;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx || !wsRef.current) return;
        // Center-crop and resize
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        const b64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];
        wsRef.current.send(JSON.stringify({ type: "image_upload", data: b64, mime_type: "image/jpeg" }));
      };
      img.src = ev.target.result as string;
    };
    reader.readAsDataURL(file);
  }, []);

  const sendText = useCallback((text: string) => {
    wsRef.current?.send(JSON.stringify({ type: "text", content: text }));
  }, []);

  return { connect, disconnect, toggleMic, startMic, stopMic, startCamera, stopCamera, sendImage, sendText, stopPlayback };
}
