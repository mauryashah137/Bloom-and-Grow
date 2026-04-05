"use client";
import { useRef, useState, useCallback, useEffect } from "react";
import { useStore } from "@/store";
import type { AgentActionCard, Product } from "@/lib/types";
import { useGeminiSession } from "@/hooks/useGeminiSession";

// Strip markdown formatting (* ** _ etc.) for clean voice transcript display
function cleanText(text: string): string {
  return text.replace(/\*\*/g, "").replace(/\*/g, "").replace(/__/g, "").replace(/_/g, "").replace(/#{1,6}\s/g, "").replace(/`/g, "").trim();
}
import { Minus, X, MessageSquare, Mic, Camera, PhoneOff, ArrowUpRight, Upload, CheckCircle, Clock, XCircle, MapPin, Send } from "lucide-react";

// ── Wave bars ────────────────────────────────────────────────────────────────
function WaveBars({ active }: { active: boolean }) {
  if (!active) {
    return (
      <div className="flex items-center gap-1">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#3a7a54]/60" />
        ))}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-0.5 h-8">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="w-1.5 rounded-full bg-[#4db876]"
          style={{
            height: `${12 + Math.random() * 16}px`,
            animation: `waveBar ${0.6 + i * 0.05}s ease-in-out infinite`,
            animationDelay: `${i * 0.06}s`,
          }}
        />
      ))}
    </div>
  );
}

// ── Product card ─────────────────────────────────────────────────────────────
function AgentProductCard({ product, onNavigate, compact }: { product: Product; onNavigate?: (id: string) => void; compact?: boolean }) {
  return (
    <div
      className="flex items-center gap-3 bg-white/10 rounded-xl p-3 cursor-pointer hover:bg-white/15 transition-colors"
      onClick={() => onNavigate?.(product.id)}
    >
      <div className="w-12 h-12 rounded-lg bg-[#2d6644]/50 flex items-center justify-center shrink-0">
        <div className="text-2xl">🌱</div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white leading-tight truncate">{product.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-sm font-semibold text-white">${(product.sale_price ?? product.price).toFixed(2)}</p>
          {product.sale_price && (
            <span className="text-xs text-white/40 line-through">${product.price.toFixed(2)}</span>
          )}
        </div>
        {!compact && product.recommendation_reasons?.[0] && (
          <p className="text-[10px] text-[#4db876] mt-0.5 truncate">{product.recommendation_reasons[0]}</p>
        )}
      </div>
      <ArrowUpRight size={14} className="text-white/60 shrink-0" />
    </div>
  );
}

// ── Vision result card ───────────────────────────────────────────────────────
function VisionCard({ card, onNavigate }: { card: AgentActionCard; onNavigate?: (id: string) => void }) {
  const vr = card.visionResult;
  if (!vr) return null;
  const topCandidate = vr.candidates?.[0];
  const health = vr.health_assessment;

  return (
    <div className="space-y-3 animate-fade-up">
      {topCandidate && (
        <div className="bg-white/10 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-white font-semibold text-sm">{topCandidate.name}</p>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#4db876]/20 text-[#4db876]">
              {Math.round(topCandidate.confidence * 100)}% match
            </span>
          </div>
          {topCandidate.scientific_name && (
            <p className="text-white/50 text-xs italic">{topCandidate.scientific_name}</p>
          )}
          {topCandidate.description && (
            <p className="text-white/70 text-xs leading-relaxed">{cleanText(topCandidate.description)}</p>
          )}
        </div>
      )}
      {health && health.status !== "healthy" && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3">
          <p className="text-yellow-300 text-xs font-medium">
            Health: {health.status.replace("_", " ")}
          </p>
          {health.observations?.map((obs, i) => (
            <p key={i} className="text-white/60 text-[10px] mt-1">• {obs}</p>
          ))}
        </div>
      )}
      {vr.care_tips?.length > 0 && (
        <div className="space-y-1">
          <p className="text-white/50 text-[10px] font-medium uppercase tracking-wider">Care Tips</p>
          {vr.care_tips.slice(0, 3).map((tip, i) => (
            <p key={i} className="text-white/70 text-xs">• {tip}</p>
          ))}
        </div>
      )}
      {card.products && card.products.length > 0 && (
        <div className="space-y-2">
          <p className="text-white/50 text-[10px] font-medium uppercase tracking-wider">Matching Products</p>
          {card.products.slice(0, 2).map(p => (
            <AgentProductCard key={p.id} product={p} onNavigate={onNavigate} compact />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Discount status card ─────────────────────────────────────────────────────
function DiscountCard({ card }: { card: AgentActionCard }) {
  const dr = card.discountRequest;
  if (!dr) return null;
  const isPending = dr.status === "pending";
  const isApproved = dr.status === "approved";

  return (
    <div className={`rounded-xl p-4 space-y-2 ${
      isPending ? "bg-purple-500/10 border border-purple-500/20" :
      isApproved ? "bg-green-500/10 border border-green-500/20" :
      "bg-red-500/10 border border-red-500/20"
    }`}>
      <div className="flex items-center gap-2">
        {isPending && <Clock size={14} className="text-purple-400" />}
        {isApproved && <CheckCircle size={14} className="text-green-400" />}
        {!isPending && !isApproved && <XCircle size={14} className="text-red-400" />}
        <p className="text-white text-sm font-semibold">{card.title}</p>
      </div>
      <p className="text-white/70 text-xs">{card.message}</p>
    </div>
  );
}

// ── Booking card ─────────────────────────────────────────────────────────────
function BookingCard({ card }: { card: AgentActionCard }) {
  const b = card.booking;
  if (!b) return null;
  return (
    <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-2">
        <CheckCircle size={14} className="text-green-400" />
        <p className="text-white text-sm font-semibold">Booking Confirmed</p>
      </div>
      <div className="space-y-1">
        <p className="text-white/80 text-xs">{b.service_name}</p>
        <p className="text-white/60 text-xs">{b.confirmed_date} • {b.confirmed_time}</p>
        <p className="text-white/60 text-xs">{b.specialist}</p>
        {b.price > 0 && <p className="text-white font-medium text-xs">${b.price.toFixed(2)}</p>}
      </div>
    </div>
  );
}

// ── Handoff card ─────────────────────────────────────────────────────────────
function HandoffCard({ card }: { card: AgentActionCard }) {
  return (
    <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-2">
        <MapPin size={14} className="text-blue-400" />
        <p className="text-white text-sm font-semibold">{card.title}</p>
      </div>
      <p className="text-white/70 text-xs">{card.message}</p>
    </div>
  );
}

// ── Cart confirm card ────────────────────────────────────────────────────────
function CartConfirmCard({ card }: { card: AgentActionCard }) {
  const items = card.items?.slice(0, 2) || [];
  const store = useStore();
  return (
    <div className="space-y-3">
      <p className="text-white font-semibold text-center text-sm">{card.title || "Items updated in your cart"}</p>
      <div className="space-y-2">
        {items.map(item => (
          <div key={item.product_id} className="flex items-center gap-3 bg-white rounded-xl p-3">
            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
              <span className="text-xl">🌱</span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900 leading-tight">{item.name}</p>
              <p className="text-sm text-gray-600">${item.price.toFixed(2)}</p>
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={() => store.removeActionCard(card.id)}
        className="w-full py-2.5 rounded-full bg-[#4db876] text-white font-semibold text-sm hover:bg-[#3da866] transition-colors"
      >
        Got it
      </button>
    </div>
  );
}

// ── Main Agent Panel ─────────────────────────────────────────────────────────
export function AgentPanel({ onNavigateProduct }: { onNavigateProduct?: (id: string) => void }) {
  const store   = useStore();
  const session = useGeminiSession();
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef  = useRef<HTMLInputElement>(null);
  const [textInput, setTextInput] = useState("");
  const [showCameraPrompt, setShowCameraPrompt] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);


  const isConnected  = store.sessionStatus === "connected";
  const isConnecting = store.sessionStatus === "connecting";
  const latestCard = store.actionCards[store.actionCards.length - 1] || null;

  // Clear analyzing indicator when vision result arrives or agent speaks
  useEffect(() => {
    if (store.visionResult || (latestCard && latestCard.type === "vision")) {
      setAnalyzing(false);
    }
  }, [store.visionResult, latestCard]);

  // Also clear when agent starts speaking (response received)
  useEffect(() => {
    if (store.agentSpeaking && analyzing) {
      setAnalyzing(false);
    }
  }, [store.agentSpeaking, analyzing]);

  const handleStartCall = useCallback(async () => {
    store.setAgentPanelOpen(true);
    await session.connect();
  }, [store, session]);

  const handleEndCall = useCallback(() => {
    session.disconnect();
    store.setAgentPanelOpen(false);
    setShowCameraPrompt(false);
    setUploadedImage(null);
    setAnalyzing(false);
  }, [session, store]);

  const handleCameraToggle = useCallback(async () => {
    if (store.isCameraActive) {
      session.stopCamera();
      setShowCameraPrompt(false);
    } else {
      setShowCameraPrompt(true);
    }
  }, [session, store.isCameraActive]);

  const handleCameraAccept = useCallback(async () => {
    setShowCameraPrompt(false);
    if (videoRef.current) {
      try {
        await session.startCamera(videoRef.current);
      } catch (e) {
        console.error("Camera access failed:", e);
        // Show a text card about camera failure
        store.addActionCard({
          id: `cam-err-${Date.now()}`, type: "text",
          message: "Unable to access camera. Please check your browser permissions and try again.",
          ts: Date.now() / 1000,
        });
      }
    }
  }, [session, store]);

  const handleCameraDecline = useCallback(() => {
    setShowCameraPrompt(false);
  }, []);

  const handleImageUpload = useCallback(() => {
    fileRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate image type
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/heic"];
    if (!validTypes.includes(file.type) && !file.type.startsWith("image/")) {
      store.addActionCard({ id: `err-${Date.now()}`, type: "text", message: "Please upload an image file (JPEG, PNG, WebP).", ts: Date.now() / 1000 });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) {
        setUploadedImage(ev.target.result as string);
        setAnalyzing(true);
        // Clear analyzing after 10s max (in case no response)
        setTimeout(() => setAnalyzing(false), 10000);
      }
    };
    reader.readAsDataURL(file);

    // Send to backend
    session.sendImage(file);
    if (fileRef.current) fileRef.current.value = "";
  }, [session, store]);

  const handleSendText = useCallback(() => {
    if (!textInput.trim()) return;
    session.sendText(textInput.trim());
    store.addTranscript({
      id: `user-text-${Date.now()}`,
      role: "user",
      text: textInput.trim(),
      ts: Date.now() / 1000,
    });
    setTextInput("");
  }, [textInput, session, store]);

  // Floating button when panel is closed
  if (!store.agentPanelOpen) {
    return (
      <>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic" className="hidden" onChange={handleFileChange} />
        <button
          onClick={handleStartCall}
          className="fixed bottom-6 right-6 w-16 h-16 rounded-full flex items-center justify-center shadow-2xl z-50 transition-transform hover:scale-105 active:scale-95 orb-pulse"
          style={{ background: "var(--green-900)" }}
          title="Talk to Aria"
        >
          {isConnecting ? (
            <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full spin" />
          ) : (
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <circle cx="14" cy="14" r="13" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
              <path d="M8 14a6 6 0 0112 0" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" />
              <rect x="7" y="14" width="3" height="5" rx="1.5" fill="white" />
              <rect x="18" y="14" width="3" height="5" rx="1.5" fill="white" />
            </svg>
          )}
        </button>
      </>
    );
  }

  return (
    <div className="fixed top-0 right-0 h-full w-96 flex flex-col shadow-2xl z-40" style={{ background: "var(--green-900)" }}>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic" className="hidden" onChange={handleFileChange} />

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
        <div className="relative">
          <div className="w-9 h-9 rounded-full bg-[#4db876] flex items-center justify-center">
            <span className="text-lg">🌿</span>
          </div>
          {isConnected && (
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#4db876] border-2 border-[#1a3c2b]" />
          )}
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">Aria</p>
          <p className="text-[10px] text-white/40">
            {isConnected ? (store.agentMode === "shop" ? "Shopping Assistant" : "Support Specialist") : "AI Concierge"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => {
              const willMinimize = !store.agentPanelMinimized;
              store.setAgentPanelMinimized(willMinimize);
              if (willMinimize) {
                // Stop everything when minimized
                session.stopMic();
                session.stopCamera();
                session.stopPlayback();
                setShowCameraPrompt(false);
                setUploadedImage(null);
                setAnalyzing(false);
              } else if (!willMinimize && isConnected) {
                // Restart mic when expanded (camera stays off — user must re-enable)
                if (!store.isMicActive) session.startMic();
              }
            }}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors">
            <Minus size={14} />
          </button>
          <button onClick={handleEndCall}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>

      {!store.agentPanelMinimized && (
        <>
          {/* Wave / status bar */}
          <div className="px-5 py-3">
            <div className="w-full rounded-full flex items-center justify-center" style={{ background: "#1e4d35", padding: "10px 20px", minHeight: 44 }}>
              <WaveBars active={store.agentSpeaking} />
            </div>
          </div>

          {/* Camera — always render video element, toggle visibility */}
          <div className={`px-5 pb-3 ${store.isCameraActive ? "" : "hidden"}`}>
            <div className="rounded-xl overflow-hidden relative bg-black">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-44 object-cover" />
              <button
                onClick={() => { session.stopCamera(); setShowCameraPrompt(false); }}
                className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/60 text-white text-xs font-medium hover:bg-black/80 transition-colors"
              >
                <Camera size={12} /> Stop sharing video
              </button>
            </div>
          </div>

          {/* Main content — action cards */}
          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">

            {/* Uploaded image preview */}
            {uploadedImage && (
              <div className="animate-fade-up space-y-2">
                <div className="rounded-xl overflow-hidden relative">
                  <img src={uploadedImage} alt="Uploaded" className="w-full h-40 object-cover rounded-xl" />
                  {analyzing && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-xl">
                      <div className="flex items-center gap-2 bg-black/60 px-4 py-2 rounded-full">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full spin" />
                        <span className="text-white text-xs font-medium">Analyzing...</span>
                      </div>
                    </div>
                  )}
                </div>
                <button onClick={() => { setUploadedImage(null); setAnalyzing(false); }} className="text-white/40 text-xs hover:text-white/60 transition-colors">
                  Dismiss
                </button>
              </div>
            )}

            {/* Camera permission prompt */}
            {showCameraPrompt && !store.isCameraActive && (
              <div className="animate-fade-up space-y-4 py-4">
                <div className="flex items-center justify-center">
                  <div className="w-14 h-14 rounded-xl border-2 border-white/20 flex items-center justify-center">
                    <Camera size={24} className="text-white/60" />
                  </div>
                </div>
                <p className="text-white font-semibold text-center text-sm">
                  Would like to access your camera for video call?
                </p>
                <div className="flex gap-3">
                  <button onClick={handleCameraDecline} className="flex-1 py-3 rounded-full border-2 border-white/40 text-white font-semibold text-sm hover:bg-white/10 transition-colors">
                    No
                  </button>
                  <button onClick={handleCameraAccept} className="flex-1 py-3 rounded-full bg-[#4db876] text-white font-semibold text-sm hover:bg-[#3da866] transition-colors">
                    Yes
                  </button>
                </div>
              </div>
            )}

            {/* Show transcript toggle */}
            {store.showTranscript && store.transcript.length > 0 && (
              <div className="space-y-2 mb-4">
                {store.transcript.slice(-6).map(t => (
                  <div key={t.id} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                      t.role === "user" ? "bg-[#4db876]/20 text-white/80" : "bg-white/10 text-white/80"
                    }`}>
                      {cleanText(t.text)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Latest action card */}
            {latestCard && (
              <div className="animate-fade-up">
                {latestCard.type === "recommendation" && latestCard.products && (
                  <div className="space-y-3">
                    <p className="text-white font-semibold text-sm">{latestCard.title}</p>
                    <div className="space-y-2">
                      {latestCard.products.slice(0, 3).map(p => (
                        <AgentProductCard key={p.id} product={p} onNavigate={onNavigateProduct} />
                      ))}
                    </div>
                  </div>
                )}
                {latestCard.type === "cart_confirm" && <CartConfirmCard card={latestCard} />}
                {latestCard.type === "vision" && <VisionCard card={latestCard} onNavigate={onNavigateProduct} />}
                {latestCard.type === "discount_status" && <DiscountCard card={latestCard} />}
                {latestCard.type === "booking" && <BookingCard card={latestCard} />}
                {latestCard.type === "handoff" && <HandoffCard card={latestCard} />}
                {latestCard.type === "service_offer" && (
                  <div className="space-y-3">
                    <p className="text-white font-semibold text-sm">{latestCard.title || "Service Offering"}</p>
                    <div className="bg-white/10 rounded-xl p-4 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#4db876]/30 flex items-center justify-center shrink-0">
                        <span className="text-lg">🌿</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-white">Landscaping service</p>
                      </div>
                      <p className="text-sm font-bold text-white">$200.00</p>
                    </div>
                  </div>
                )}
                {latestCard.type === "text" && latestCard.message && (
                  <p className="text-white text-sm leading-relaxed">{cleanText(latestCard.message)}</p>
                )}
              </div>
            )}

            {/* Empty states */}
            {!latestCard && isConnected && !store.showTranscript && (
              <div className="flex flex-col items-center justify-center h-32 gap-3 text-center">
                <p className="text-white/40 text-sm">Aria is listening…</p>
                <p className="text-white/25 text-xs">Try speaking, uploading an image, or typing below</p>
              </div>
            )}
            {!latestCard && !isConnected && (
              <div className="flex flex-col items-center justify-center h-32 gap-3 text-center">
                <p className="text-white/40 text-sm">Start a call to get help</p>
              </div>
            )}
          </div>

          {/* Text input */}
          {isConnected && (
            <div className="px-5 py-2 border-t border-white/5">
              <div className="flex items-center gap-2 bg-white/10 rounded-full px-4 py-2">
                <input
                  type="text"
                  value={textInput}
                  onChange={e => setTextInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSendText()}
                  placeholder="Type a message…"
                  className="flex-1 bg-transparent text-white text-sm placeholder-white/30 outline-none"
                />
                <button onClick={handleSendText} className="text-white/60 hover:text-white transition-colors">
                  <Send size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Bottom controls */}
          <div className="px-5 py-4 border-t border-white/10">
            <div className="flex items-center justify-between">
              {/* Transcript toggle */}
              <button
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${store.showTranscript ? "bg-white/20" : ""}`}
                style={{ background: store.showTranscript ? undefined : "rgba(255,255,255,0.1)" }}
                onClick={() => store.setShowTranscript(!store.showTranscript)}
              >
                <MessageSquare size={18} className="text-white/80" />
              </button>

              {/* Camera toggle */}
              <button
                onClick={handleCameraToggle}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${store.isCameraActive ? "bg-[#4db876]" : ""}`}
                style={{ background: store.isCameraActive ? undefined : "rgba(255,255,255,0.1)" }}
              >
                <Camera size={18} className={store.isCameraActive ? "text-white" : "text-white/60"} />
              </button>

              {/* Upload */}
              <button
                onClick={handleImageUpload}
                className="w-11 h-11 rounded-full flex items-center justify-center transition-colors"
                style={{ background: "rgba(255,255,255,0.1)" }}
              >
                <Upload size={18} className="text-white/60" />
              </button>

              {/* Mic */}
              <button
                onClick={session.toggleMic}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${store.isMicActive ? "bg-[#4db876]" : ""}`}
                style={{ background: store.isMicActive ? undefined : "rgba(255,255,255,0.1)" }}
              >
                <Mic size={18} className={store.isMicActive ? "text-white" : "text-white/60"} />
              </button>

              {/* End call */}
              <button
                onClick={handleEndCall}
                className="w-11 h-11 rounded-full flex items-center justify-center transition-colors hover:bg-red-600"
                style={{ background: "#dc2626" }}
              >
                <PhoneOff size={18} className="text-white" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
