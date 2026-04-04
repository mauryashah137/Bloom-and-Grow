"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, CheckCircle, XCircle, Clock, PhoneCall, TrendingUp, ShoppingCart, AlertTriangle, ChevronRight, Tag, User, MapPin, Package } from "lucide-react";

const API = (process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080/ws")
  .replace(/^wss?:\/\//, "https://").replace("/ws", "");

type Metrics = { total_sessions: number; active_sessions: number; resolved_sessions: number; escalation_rate: number; refund_rate: number; cart_add_rate: number; resolution_rate: number; avg_call_duration_seconds: number };
type Session = { session_id: string; status: string; started_at: number; ended_at?: number; mode?: string; customer_id?: string; transcript?: any[]; tool_calls?: any[]; journey_events?: any[] };
type Approval = { request_id: string; discount_pct: number; reason: string; status: string; customer_id: string; session_id?: string; customer_tier?: string };
type Handoff = { handoff_id: string; customer_id: string; session_id: string; reason: string; priority: string; specialist_type: string; status: string; estimated_wait_minutes: number; queue_position: number; summary?: string; created_at: number };

function fmt(s: number) {
  if (!s || s <= 0) return "0s";
  return Math.floor(s / 60) > 0 ? `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s` : `${Math.floor(s)}s`;
}

export default function ManagerPage() {
  const [metrics,   setMetrics]   = useState<Metrics | null>(null);
  const [sessions,  setSessions]  = useState<Session[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [handoffs,  setHandoffs]  = useState<Handoff[]>([]);
  const [selected,  setSelected]  = useState<Session | null>(null);
  const [sessionContext, setSessionContext] = useState<any>(null);
  const [loading,   setLoading]   = useState(true);

  const load = useCallback(async () => {
    try {
      const [mr, sr, ar, hr] = await Promise.all([
        fetch(`${API}/api/metrics`),
        fetch(`${API}/api/sessions?limit=30`),
        fetch(`${API}/api/manager/approvals`),
        fetch(`${API}/api/manager/handoffs`),
      ]);
      if (mr.ok) setMetrics(await mr.json());
      if (sr.ok) { const d = await sr.json(); setSessions(d.sessions || []); }
      if (ar.ok) { const d = await ar.json(); setApprovals(d.approvals || []); }
      if (hr.ok) { const d = await hr.json(); setHandoffs(d.handoffs || []); }
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]);

  // Load session context when selecting a session
  const selectSession = async (s: Session) => {
    setSelected(s);
    setSessionContext(null);
    try {
      const r = await fetch(`${API}/api/manager/session/${s.session_id}/summary`);
      if (r.ok) setSessionContext(await r.json());
    } catch {}
  };

  // Track amended discount values per approval
  const [amendedValues, setAmendedValues] = useState<Record<string, string>>({});

  const resolve = async (id: string, action: "approve" | "reject", originalPct?: number) => {
    const amended = amendedValues[id];
    const body: any = { note: `Manager ${action}d` };
    // If manager entered a different %, send it as amended_pct
    if (action === "approve" && amended && Number(amended) !== originalPct) {
      body.amended_pct = Number(amended);
      body.note = `Manager approved ${amended}% (customer requested ${originalPct}%)`;
    }
    await fetch(`${API}/api/manager/approvals/${id}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    load();
  };

  const assignHandoff = async (id: string) => {
    await fetch(`${API}/api/manager/handoff/${id}/assign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agent_name: "Manager" }) });
    load();
  };

  const pending = approvals.filter(a => a.status === "pending");

  return (
    <div className="min-h-screen text-white" style={{ background: "#0f1a14" }}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "#2d4a35", background: "#1a3c2b" }}>
        <div className="flex items-center gap-3">
          <Link href="/" className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors">
            <ArrowLeft size={16} />
          </Link>
          <div className="w-8 h-8 rounded-full bg-[#4db876] flex items-center justify-center"><span>🌿</span></div>
          <div>
            <h1 className="text-sm font-bold text-white">Manager Console</h1>
            <p className="text-[10px] text-white/50">Bloom & Grow · Operations</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {pending.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium" style={{ background: "rgba(168,85,247,0.15)", color: "#c084fc", border: "1px solid rgba(168,85,247,0.25)" }}>
              <Tag size={11} /> {pending.length} pending
            </div>
          )}
          {handoffs.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium" style={{ background: "rgba(59,130,246,0.15)", color: "#93c5fd", border: "1px solid rgba(59,130,246,0.25)" }}>
              <PhoneCall size={11} /> {handoffs.length} escalations
            </div>
          )}
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors" style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}>
            <RefreshCw size={11} /> Refresh
          </button>
        </div>
      </header>

      <div className="flex h-[calc(100vh-65px)] overflow-hidden">
        {/* ── Left panel ────────────────────────────────────────────── */}
        <div className="w-[420px] shrink-0 border-r flex flex-col overflow-hidden" style={{ borderColor: "#1e3528" }}>
          {/* Metrics */}
          <div className="p-4 border-b" style={{ borderColor: "#1e3528" }}>
            {metrics ? (
              <div className="grid grid-cols-3 gap-2">
                {[
                  { Icon: PhoneCall,     label: "Total",     value: String(metrics.total_sessions),         color: "#60a5fa" },
                  { Icon: CheckCircle,   label: "Resolved",  value: `${metrics.resolution_rate}%`,          color: "#4ade80" },
                  { Icon: AlertTriangle, label: "Escalated", value: `${metrics.escalation_rate}%`,          color: "#fb923c" },
                  { Icon: ShoppingCart,  label: "Cart Adds", value: `${metrics.cart_add_rate}%`,            color: "#a78bfa" },
                  { Icon: Clock,         label: "Avg Time",  value: fmt(metrics.avg_call_duration_seconds), color: "#38bdf8" },
                  { Icon: TrendingUp,    label: "Refunds",   value: `${metrics.refund_rate}%`,              color: "#f472b6" },
                ].map(({ Icon, label, value, color }) => (
                  <div key={label} className="rounded-xl p-3" style={{ background: "#1e3528" }}>
                    <div className="flex items-center gap-1 mb-1">
                      <Icon size={11} style={{ color }} />
                      <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>{label}</span>
                    </div>
                    <p className="text-lg font-bold text-white">{value}</p>
                  </div>
                ))}
              </div>
            ) : <div className="grid grid-cols-3 gap-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: "#1e3528" }} />)}</div>}
          </div>

          {/* Handoff queue */}
          {handoffs.length > 0 && (
            <div className="border-b" style={{ borderColor: "#1e3528" }}>
              <div className="px-4 py-2.5 flex items-center gap-2">
                <PhoneCall size={12} style={{ color: "#93c5fd" }} />
                <span className="text-xs font-semibold" style={{ color: "#93c5fd" }}>Escalation Queue</span>
              </div>
              <div className="px-3 pb-3 space-y-2 max-h-40 overflow-y-auto">
                {handoffs.map(h => (
                  <div key={h.handoff_id} className="rounded-xl p-3 space-y-2" style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)" }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-white">{h.specialist_type} — {h.priority}</p>
                        <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>{h.reason}</p>
                      </div>
                      <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.3)" }}>#{h.queue_position}</span>
                    </div>
                    <button onClick={() => assignHandoff(h.handoff_id)} className="w-full py-1.5 rounded-lg text-xs font-medium transition-colors" style={{ background: "rgba(59,130,246,0.15)", color: "#93c5fd", border: "1px solid rgba(59,130,246,0.25)" }}>
                      Assign to me
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Approval queue */}
          {pending.length > 0 && (
            <div className="border-b" style={{ borderColor: "#1e3528" }}>
              <div className="px-4 py-2.5 flex items-center gap-2">
                <Tag size={12} style={{ color: "#c084fc" }} />
                <span className="text-xs font-semibold" style={{ color: "#c084fc" }}>Discount Requests</span>
              </div>
              <div className="px-3 pb-3 space-y-2 max-h-56 overflow-y-auto">
                {pending.map(a => (
                  <div key={a.request_id} className="rounded-xl p-3 space-y-2" style={{ background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.2)" }}>
                    <div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-white">Requested: {a.discount_pct}% discount</p>
                        {a.customer_tier && <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}>{a.customer_tier}</span>}
                      </div>
                      <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>{a.reason}</p>
                      <p className="text-[10px] mt-0.5 font-mono" style={{ color: "rgba(255,255,255,0.3)" }}>{a.customer_id} · {a.request_id}</p>
                    </div>
                    {/* Manager can amend the discount % before approving */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-white/40">Approve at:</span>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        defaultValue={a.discount_pct}
                        onChange={e => setAmendedValues(v => ({ ...v, [a.request_id]: e.target.value }))}
                        className="w-16 px-2 py-1 rounded-lg text-xs font-medium text-white text-center outline-none"
                        style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}
                      />
                      <span className="text-[10px] text-white/40">%</span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => resolve(a.request_id, "approve", a.discount_pct)} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-colors" style={{ background: "rgba(74,222,128,0.15)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.25)" }}>
                        <CheckCircle size={11} /> Approve
                      </button>
                      <button onClick={() => resolve(a.request_id, "reject", a.discount_pct)} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-colors" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}>
                        <XCircle size={11} /> Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Session list */}
          <div className="px-4 py-2.5 border-b text-xs font-semibold" style={{ borderColor: "#1e3528", color: "rgba(255,255,255,0.4)" }}>
            Recent Sessions
          </div>
          <div className="flex-1 overflow-y-auto">
            {sessions.map(s => (
              <button key={s.session_id} onClick={() => selectSession(s)}
                className={`w-full text-left px-4 py-3 border-b flex items-center gap-3 transition-colors ${selected?.session_id === s.session_id ? "bg-white/5" : "hover:bg-white/5"}`}
                style={{ borderColor: "#1a2e20" }}>
                <div className={`w-2 h-2 rounded-full shrink-0 ${s.status === "active" ? "bg-green-400" : "bg-gray-600"}`} style={s.status === "active" ? { animation: "orbPulse 2s infinite" } : {}} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono" style={{ color: "rgba(255,255,255,0.6)" }}>{s.session_id.slice(-10)}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={s.status === "active" ? { background: "rgba(74,222,128,0.15)", color: "#4ade80" } : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.3)" }}>
                      {s.status}
                    </span>
                    <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.3)" }}>{s.mode === "shop" ? "🛍" : "🎧"}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>{new Date(s.started_at * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    <span style={{ color: "rgba(255,255,255,0.15)" }}>·</span>
                    <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>{s.ended_at ? fmt(s.ended_at - s.started_at) : "Active"}</span>
                    {(s.tool_calls?.length ?? 0) > 0 && (
                      <span className="text-[10px]" style={{ color: "#60a5fa" }}>{s.tool_calls!.length} actions</span>
                    )}
                  </div>
                </div>
                <ChevronRight size={12} style={{ color: "rgba(255,255,255,0.2)" }} />
              </button>
            ))}
            {sessions.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <PhoneCall size={24} style={{ color: "rgba(255,255,255,0.1)" }} />
                <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>No sessions yet</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: session detail with full context ────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selected ? (
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Session header */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.4)" }}>{selected.session_id}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] px-2 py-0.5 rounded-full" style={selected.status === "active" ? { background: "rgba(74,222,128,0.15)", color: "#4ade80" } : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}>
                      {selected.status}
                    </span>
                    {selected.ended_at && <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>{fmt(selected.ended_at - selected.started_at)}</span>}
                    <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>{selected.mode === "shop" ? "🛍 Shop" : "🎧 Support"}</span>
                  </div>
                </div>
                <button onClick={() => { setSelected(null); setSessionContext(null); }} className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white">
                  <XCircle size={16} />
                </button>
              </div>

              {/* Customer context card */}
              {sessionContext?.customer && (
                <div className="rounded-xl p-4 space-y-2" style={{ background: "#1e3528" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <User size={12} style={{ color: "#4db876" }} />
                    <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.5)" }}>Customer</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-white text-sm font-medium">{sessionContext.customer.name}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>{sessionContext.customer.email}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(74,222,128,0.15)", color: "#4ade80" }}>
                        {sessionContext.customer.loyalty_tier}
                      </span>
                      <p className="text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>{sessionContext.customer.loyalty_points} pts · {sessionContext.customer.total_orders} orders</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Live cart snapshot */}
              {sessionContext?.cart?.items?.length > 0 && (
                <div className="rounded-xl p-4 space-y-2" style={{ background: "#1e3528" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <ShoppingCart size={12} style={{ color: "#a78bfa" }} />
                    <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.5)" }}>Current Cart</span>
                    <span className="text-[10px] ml-auto" style={{ color: "#a78bfa" }}>${sessionContext.cart.subtotal?.toFixed(2)}</span>
                  </div>
                  <div className="space-y-1.5">
                    {sessionContext.cart.items.map((item: any) => (
                      <div key={item.product_id} className="flex items-center justify-between text-[11px]">
                        <span className="text-white/70">{item.name} ×{item.qty}</span>
                        <span className="text-white/50">${(item.price * item.qty).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  {sessionContext.cart.discount_pct > 0 && (
                    <p className="text-[10px] text-green-400">Discount: {sessionContext.cart.discount_pct}% ({sessionContext.cart.offer_code})</p>
                  )}
                </div>
              )}

              {/* Journey summary */}
              {sessionContext?.journey && (
                <div className="rounded-xl p-4 space-y-2" style={{ background: "#1e3528" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin size={12} style={{ color: "#38bdf8" }} />
                    <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.5)" }}>Journey</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      { label: "Turns", value: sessionContext.journey.transcript_turns },
                      { label: "Products", value: sessionContext.journey.products_viewed },
                      { label: "Cart Changes", value: sessionContext.journey.cart_changes },
                      { label: "Vision", value: sessionContext.journey.vision_events },
                      { label: "Recs Shown", value: sessionContext.journey.recommendations_shown },
                    ].map(s => (
                      <div key={s.label} className="rounded-lg p-2" style={{ background: "rgba(255,255,255,0.05)" }}>
                        <p className="text-white text-sm font-bold">{s.value}</p>
                        <p className="text-[9px]" style={{ color: "rgba(255,255,255,0.3)" }}>{s.label}</p>
                      </div>
                    ))}
                  </div>
                  {sessionContext.journey.sentiment_history?.length > 0 && (
                    <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                      Sentiment: {sessionContext.journey.sentiment_history.join(" → ")}
                    </p>
                  )}
                </div>
              )}

              {/* Agent actions */}
              {(selected.tool_calls?.length ?? 0) > 0 && (
                <section>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "rgba(255,255,255,0.4)" }}>Agent Actions ({selected.tool_calls!.length})</p>
                  <div className="space-y-1.5">
                    {selected.tool_calls!.map((tc, i) => (
                      <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-xl" style={{ background: "#1e3528" }}>
                        {tc.status === "success" ? <CheckCircle size={12} style={{ color: "#4ade80" }} /> : <XCircle size={12} style={{ color: "#f87171" }} />}
                        <span className="text-[11px] text-white">{tc.tool.replace(/_/g, " ")}</span>
                        <span className="ml-auto text-[9px]" style={{ color: "rgba(255,255,255,0.3)" }}>{new Date(tc.ts * 1000).toLocaleTimeString()}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Transcript */}
              {(selected.transcript?.length ?? 0) > 0 && (
                <section>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "rgba(255,255,255,0.4)" }}>Transcript ({selected.transcript!.length} turns)</p>
                  <div className="space-y-2">
                    {selected.transcript!.map((t, i) => (
                      <div key={i} className={`flex gap-2 ${t.role === "user" ? "flex-row-reverse" : ""}`}>
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[9px] font-bold ${t.role === "agent" ? "bg-[#4db876] text-white" : "text-white"}`} style={t.role === "user" ? { background: "#2d4a35" } : {}}>
                          {t.role === "agent" ? "A" : "U"}
                        </div>
                        <div className="max-w-[80%] px-3 py-2 rounded-xl text-[11px] leading-relaxed" style={t.role === "agent" ? { background: "#1e3528", color: "rgba(255,255,255,0.8)" } : { background: "rgba(77,184,118,0.15)", color: "rgba(255,255,255,0.8)", border: "1px solid rgba(77,184,118,0.2)" }}>
                          {t.text}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "#1e3528" }}>
                <PhoneCall size={22} style={{ color: "rgba(255,255,255,0.2)" }} />
              </div>
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>Select a session to view full context</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
