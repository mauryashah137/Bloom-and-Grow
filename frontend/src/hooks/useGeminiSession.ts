"use client";
import { useCallback, useEffect, useRef } from "react";
import { useStore } from "@/store";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080/ws";
const API_BASE = WS_URL.replace(/^wss?:\/\//, "https://").replace("/ws", "");

export { API_BASE };

export function useGeminiSession() {
  const wsRef       = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletRef  = useRef<AudioWorkletNode | null>(null);
  const sourceRef   = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const cameraRef   = useRef<MediaStream | null>(null);
  const camIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef   = useRef<HTMLCanvasElement | null>(null);
  const nextPlayRef = useRef<number>(0);
  const playingRef  = useRef<Set<AudioBufferSourceNode>>(new Set());
  const store = useStore();

  // ── Audio context setup ─────────────────────────────────────────────────
  const ensureAudio = useCallback(async () => {
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      if (audioCtxRef.current.state === "suspended") {
        await audioCtxRef.current.resume();
      }
      return;
    }
    audioCtxRef.current = new AudioContext({ sampleRate: 24000 });
    nextPlayRef.current = audioCtxRef.current.currentTime;
  }, []);

  // ── Play audio chunk from agent — prevents repeating ────────────────────
  const playChunk = useCallback((b64: string) => {
    const ctx = audioCtxRef.current;
    if (!ctx || ctx.state === "closed") return;

    store.setAgentSpeaking(true);

    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    // Ensure byte alignment for Int16Array
    const aligned = bytes.length % 2 === 0 ? bytes : bytes.slice(0, bytes.length - 1);
    if (aligned.length === 0) return;

    const i16 = new Int16Array(aligned.buffer, aligned.byteOffset, aligned.length / 2);
    const f32 = new Float32Array(i16.length);
    for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768;

    const buf = ctx.createBuffer(1, f32.length, 24000);
    buf.copyToChannel(f32, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);

    // Schedule after current playback — prevent overlaps/repeating
    const now = ctx.currentTime;
    const startAt = Math.max(nextPlayRef.current, now);
    src.start(startAt);
    nextPlayRef.current = startAt + buf.duration;

    playingRef.current.add(src);
    src.onended = () => {
      playingRef.current.delete(src);
      if (playingRef.current.size === 0 && nextPlayRef.current <= ctx.currentTime + 0.15) {
        store.setAgentSpeaking(false);
      }
    };
  }, [store]);

  // ── Stop all playing audio (for interruption) ──────────────────────────
  const stopPlayback = useCallback(() => {
    playingRef.current.forEach(src => {
      try { src.stop(); } catch {}
    });
    playingRef.current.clear();
    if (audioCtxRef.current) {
      nextPlayRef.current = audioCtxRef.current.currentTime;
    }
    store.setAgentSpeaking(false);
  }, [store]);

  // ── Microphone — starts automatically on connect, stays on ──────────────
  const startMic = useCallback(async () => {
    if (streamRef.current) return; // Already running
    await ensureAudio();
    const ctx = audioCtxRef.current!;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    streamRef.current = stream;

    try { await ctx.audioWorklet.addModule("/pcm-processor.js"); } catch {}

    const source = ctx.createMediaStreamSource(stream);
    const worklet = new AudioWorkletNode(ctx, "pcm-processor");

    worklet.port.onmessage = (ev) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      const b64 = btoa(String.fromCharCode(...new Uint8Array(ev.data)));
      wsRef.current.send(JSON.stringify({ type: "audio_chunk", data: b64 }));
    };

    // Connect source → worklet only (NOT to destination — that causes echo)
    source.connect(worklet);
    sourceRef.current = source;
    workletRef.current = worklet;
    store.setMicActive(true);
  }, [ensureAudio, store]);

  const stopMic = useCallback(() => {
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    workletRef.current?.disconnect();
    workletRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    store.setMicActive(false);
  }, [store]);

  const toggleMic = useCallback(async () => {
    if (store.isMicActive) stopMic(); else await startMic();
  }, [store.isMicActive, startMic, stopMic]);

  // ── Connect WebSocket — auto-starts mic after session starts ────────────
  const connect = useCallback(async () => {
    if (wsRef.current) return;
    store.setSessionStatus("connecting");
    store.setSessionError(null);
    store.clearActionCards();
    await ensureAudio();

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
      switch (ev.type) {
        case "session_started":
          store.setSessionId(ev.session_id);
          store.setSessionStatus("connected");
          if (ev.customer) store.setCustomer(ev.customer);
          // Auto-start microphone — like a phone call
          startMic();
          break;

        case "audio_chunk":
          playChunk(ev.data);
          break;

        case "transcript":
          if (ev.final) {
            store.addTranscript({
              id: `${ev.role}-${ev.ts}-${Math.random().toString(36).slice(2,6)}`,
              role: ev.role,
              text: ev.text,
              ts: ev.ts,
            });
          }
          break;

        case "tool_call":
          if (ev.status === "success") {
            if (ev.tool === "add_to_cart" && ev.result?.cart) {
              store.setCart(ev.result.cart);
            } else if (ev.tool === "remove_from_cart" && ev.result?.cart) {
              store.setCart(ev.result.cart);
            }
          }
          break;

        case "cart_updated":
          if (ev.cart) store.setCart(ev.cart);
          break;

        case "recommendation":
          if (ev.products?.length) {
            store.setRecommendations(ev.products);
            store.addActionCard({
              id: `rec-${Date.now()}`,
              type: "recommendation",
              title: "Recommended for you",
              products: ev.products,
              ts: Date.now() / 1000,
            });
          }
          break;

        case "vision_result":
          store.setVisionResult(ev);
          store.addActionCard({
            id: `vis-${Date.now()}`,
            type: "vision",
            title: ev.candidates?.[0]?.name || "Visual Identification",
            visionResult: ev,
            products: ev.catalog_matches || [],
            ts: Date.now() / 1000,
          });
          break;

        case "sentiment":
          store.setSentiment(ev.value);
          break;

        case "discount_pending":
          store.setDiscountRequest({
            request_id: ev.request_id, discount_pct: ev.amount,
            reason: ev.reason, status: "pending",
          });
          store.addActionCard({
            id: `disc-${ev.request_id}`, type: "discount_status",
            title: "Checking with supervisor...",
            message: `Requesting ${ev.amount}% discount — waiting for manager approval`,
            discountRequest: { request_id: ev.request_id, discount_pct: ev.amount, reason: ev.reason, status: "pending" },
            ts: Date.now() / 1000,
          });
          break;

        case "discount_resolved":
          store.setDiscountRequest({
            request_id: ev.request_id, discount_pct: ev.discount_pct,
            reason: ev.note || "", status: ev.approved ? "approved" : "rejected",
          });
          store.addActionCard({
            id: `disc-resolved-${ev.request_id}`, type: "discount_status",
            title: ev.approved ? "Discount approved!" : "Discount not available",
            message: ev.approved
              ? `${ev.discount_pct}% discount has been applied to your cart!`
              : `Unable to offer ${ev.original_pct || ev.discount_pct}% at this time. ${ev.note || ""}`,
            discountRequest: {
              request_id: ev.request_id, discount_pct: ev.discount_pct,
              reason: ev.note || "", status: ev.approved ? "approved" : "rejected",
            },
            ts: Date.now() / 1000,
          });
          break;

        case "booking_confirmed":
          store.setLastBooking(ev.booking);
          store.addActionCard({
            id: `book-${Date.now()}`, type: "booking",
            title: "Booking confirmed!", booking: ev.booking,
            ts: Date.now() / 1000,
          });
          break;

        case "order_created":
          store.addOrder(ev.order);
          store.addActionCard({
            id: `order-${Date.now()}`, type: "order",
            title: "Order placed!", order: ev.order,
            ts: Date.now() / 1000,
          });
          break;

        case "handoff_created":
          store.addActionCard({
            id: `handoff-${ev.handoff_id}`, type: "handoff",
            title: "Connecting you to a specialist",
            message: `You're #${ev.queue_position} in queue. Estimated wait: ${ev.estimated_wait_minutes} minutes.`,
            ts: Date.now() / 1000,
          });
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
      store.setSessionError("Connection failed. Check your backend URL.");
      store.setSessionStatus("error");
    };
    ws.onclose = () => {
      wsRef.current = null;
      stopMic();
      stopCamera();
      stopPlayback();
      if (store.sessionStatus !== "error") store.setSessionStatus("idle");
    };
  }, [store, ensureAudio, playChunk, startMic, stopPlayback]);

  // ── Camera — sends frames at 1fps ──────────────────────────────────────
  const startCamera = useCallback(async (videoEl: HTMLVideoElement) => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
    cameraRef.current = stream;
    videoEl.srcObject = stream;
    await videoEl.play();
    if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
    const canvas = canvasRef.current;
    canvas.width = 320; canvas.height = 240;
    store.setCameraActive(true);
    // Send frames at 1fps (every 1000ms) — better for bandwidth + Gemini processing
    camIntervalRef.current = setInterval(() => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) return;
      ctx2d.drawImage(videoEl, 0, 0, 320, 240);
      const b64 = canvas.toDataURL("image/jpeg", 0.6).split(",")[1];
      wsRef.current.send(JSON.stringify({ type: "video_frame", data: b64 }));
    }, 1000);
  }, [store]);

  const stopCamera = useCallback(() => {
    if (camIntervalRef.current) { clearInterval(camIntervalRef.current); camIntervalRef.current = null; }
    cameraRef.current?.getTracks().forEach(t => t.stop());
    cameraRef.current = null;
    store.setCameraActive(false);
  }, [store]);

  // ── Disconnect — must be after stopCamera is defined ─────────────────────
  const disconnect = useCallback(() => {
    stopMic();
    stopCamera();
    stopPlayback();
    if (wsRef.current) {
      try { wsRef.current.send(JSON.stringify({ type: "end_session" })); } catch {}
      wsRef.current.close();
      wsRef.current = null;
    }
    store.resetSession();
  }, [store, stopMic, stopCamera, stopPlayback]);

  const sendImage = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (!ev.target?.result || !wsRef.current) return;
      const b64 = (ev.target.result as string).split(",")[1];
      wsRef.current.send(JSON.stringify({ type: "image_upload", data: b64, mime_type: file.type }));
    };
    reader.readAsDataURL(file);
  }, []);

  const sendText = useCallback((text: string) => {
    wsRef.current?.send(JSON.stringify({ type: "text", content: text }));
  }, []);

  useEffect(() => {
    return () => {
      stopMic();
      stopCamera();
      stopPlayback();
      try { audioCtxRef.current?.close(); } catch {}
    };
  }, []);

  return { connect, disconnect, toggleMic, startMic, stopMic, startCamera, stopCamera, sendImage, sendText, stopPlayback };
}
