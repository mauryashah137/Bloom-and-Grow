"use client";
/**
 * Gemini Live Session Hook — Audio system based on Google's ADK demo.
 * Uses ring buffer AudioWorklet for playback (no repeating/gaps).
 * Mic auto-starts on connect. Continuous conversation like a phone call.
 */
import { useCallback, useEffect, useRef } from "react";
import { useStore } from "@/store";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080/ws";
const API_BASE = WS_URL.replace(/^wss?:\/\//, "https://").replace("/ws", "");

export { API_BASE };

export function useGeminiSession() {
  const wsRef        = useRef<WebSocket | null>(null);
  // Recording (16kHz)
  const recCtxRef    = useRef<AudioContext | null>(null);
  const recWorkletRef = useRef<AudioWorkletNode | null>(null);
  const recSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  // Playback (24kHz) — ring buffer approach
  const playCtxRef   = useRef<AudioContext | null>(null);
  const playerRef    = useRef<AudioWorkletNode | null>(null);
  const speakingRef  = useRef(false);
  const speakingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Camera
  const cameraRef    = useRef<MediaStream | null>(null);
  const camIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef    = useRef<HTMLCanvasElement | null>(null);

  const store = useStore();

  // ── Setup playback context (24kHz) with ring buffer worklet ────────────
  const ensurePlayback = useCallback(async () => {
    if (playCtxRef.current && playCtxRef.current.state !== "closed") {
      if (playCtxRef.current.state === "suspended") await playCtxRef.current.resume();
      return;
    }
    const ctx = new AudioContext({ sampleRate: 24000 });
    playCtxRef.current = ctx;
    await ctx.audioWorklet.addModule("/pcm-player-processor.js");
    const playerNode = new AudioWorkletNode(ctx, "pcm-player-processor");
    playerNode.connect(ctx.destination);
    playerRef.current = playerNode;
  }, []);

  // ── Play audio chunk — sends PCM data to ring buffer worklet ──────────
  const playChunk = useCallback((b64: string) => {
    const player = playerRef.current;
    if (!player) return;

    // Decode base64 to ArrayBuffer
    const binaryStr = atob(b64);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binaryStr.charCodeAt(i);

    // Send raw PCM bytes to the ring buffer worklet
    player.port.postMessage(bytes.buffer);

    // Mark as speaking
    if (!speakingRef.current) {
      speakingRef.current = true;
      store.setAgentSpeaking(true);
    }
    // Reset the "stopped speaking" timer
    if (speakingTimer.current) clearTimeout(speakingTimer.current);
    speakingTimer.current = setTimeout(() => {
      speakingRef.current = false;
      store.setAgentSpeaking(false);
    }, 500);
  }, [store]);

  // ── Stop playback (interrupt) ─────────────────────────────────────────
  const stopPlayback = useCallback(() => {
    playerRef.current?.port.postMessage({ command: "clear" });
    speakingRef.current = false;
    store.setAgentSpeaking(false);
  }, [store]);

  // ── Microphone — auto-starts, stays on ────────────────────────────────
  const micSampleRateRef = useRef<number>(16000);

  const startMic = useCallback(async () => {
    if (micStreamRef.current) return;

    // Get mic stream
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    micStreamRef.current = stream;

    // Create recording context — request 16kHz (Gemini's expected input rate)
    // Note: browser may give a different rate; the worklet will report the actual rate
    if (!recCtxRef.current || recCtxRef.current.state === "closed") {
      recCtxRef.current = new AudioContext({ sampleRate: 16000 });
    }
    const ctx = recCtxRef.current;
    if (ctx.state === "suspended") await ctx.resume();
    console.log(`[Mic] AudioContext actual sample rate: ${ctx.sampleRate}`);
    micSampleRateRef.current = ctx.sampleRate;

    try { await ctx.audioWorklet.addModule("/pcm-processor.js"); } catch {}

    const source = ctx.createMediaStreamSource(stream);
    const worklet = new AudioWorkletNode(ctx, "pcm-processor");

    worklet.port.onmessage = (ev) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

      const msg = ev.data;

      // Handle sample rate report from worklet
      if (msg && msg.type === "sampleRate") {
        console.log(`[Mic] Worklet reports sampleRate: ${msg.sampleRate}`);
        micSampleRateRef.current = msg.sampleRate;
        // Tell backend the actual sample rate
        wsRef.current.send(JSON.stringify({ type: "sample_rate", rate: msg.sampleRate }));
        return;
      }

      // Handle audio data
      const audioData = msg?.data || msg;
      if (!audioData) return;
      const pcmBytes = new Uint8Array(audioData);
      if (pcmBytes.length === 0) return;

      // Convert to base64
      let binary = "";
      const CHUNK = 8192;
      for (let i = 0; i < pcmBytes.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, Array.from(pcmBytes.subarray(i, i + CHUNK)));
      }
      wsRef.current.send(JSON.stringify({ type: "audio_chunk", data: btoa(binary) }));
    };

    // Connect source → worklet only (NOT to destination — prevents echo)
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
          if (ev.customer) store.setCustomer(ev.customer);
          // Auto-start mic — like a phone call
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
            store.addActionCard({ id: `rec-${Date.now()}`, type: "recommendation", title: "Recommended for you", products: ev.products, ts: Date.now() / 1000 });
          }
          break;

        case "vision_result":
          store.setVisionResult(ev);
          store.addActionCard({ id: `vis-${Date.now()}`, type: "vision", title: ev.candidates?.[0]?.name || "Visual Identification", visionResult: ev, products: ev.catalog_matches || [], ts: Date.now() / 1000 });
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

        case "booking_confirmed":
          store.setLastBooking(ev.booking);
          store.addActionCard({ id: `book-${Date.now()}`, type: "booking", title: "Booking confirmed!", booking: ev.booking, ts: Date.now() / 1000 });
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
      store.setSessionError("Connection failed. Check backend URL.");
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
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 768, height: 768, facingMode: "user" } });
    cameraRef.current = stream;
    videoEl.srcObject = stream;
    await videoEl.play();
    if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
    const canvas = canvasRef.current;
    canvas.width = 768; canvas.height = 768;
    store.setCameraActive(true);
    // 1 FPS as per ADK spec
    camIntervalRef.current = setInterval(() => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) return;
      ctx2d.drawImage(videoEl, 0, 0, 768, 768);
      const b64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
      wsRef.current.send(JSON.stringify({ type: "video_frame", data: b64 }));
    }, 1000);
  }, [store]);

  const stopCamera = useCallback(() => {
    if (camIntervalRef.current) { clearInterval(camIntervalRef.current); camIntervalRef.current = null; }
    cameraRef.current?.getTracks().forEach(t => t.stop());
    cameraRef.current = null;
    store.setCameraActive(false);
  }, [store]);

  // ── Disconnect ────────────────────────────────────────────────────────
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

  // NOTE: No useEffect cleanup — we don't want to disconnect on component re-render.
  // The connection persists until the user explicitly clicks "end call".
  // Cleanup happens in disconnect() which is called by the end call button.

  return { connect, disconnect, toggleMic, startMic, stopMic, startCamera, stopCamera, sendImage, sendText, stopPlayback };
}
