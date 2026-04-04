"use client";
import { useEffect, useState } from "react";
import { StorefrontLayout } from "@/components/layout/StorefrontLayout";
import { useStore } from "@/store";
import { useGeminiSession } from "@/hooks/useGeminiSession";
import type { Order } from "@/lib/types";
import { MessageSquare, Package, RefreshCw, Star, PhoneCall, Camera, Truck } from "lucide-react";

const API = (process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080/ws")
  .replace(/^wss?:\/\//, "https://").replace("/ws", "");

const QUICK_ISSUES = [
  { icon: Package,      label: "Track my order",        prompt: "I'd like to track my recent order" },
  { icon: RefreshCw,    label: "Return or refund",       prompt: "I need to return an item or get a refund" },
  { icon: Camera,       label: "Show damaged item",      prompt: "I received a damaged item, let me show you" },
  { icon: MessageSquare, label: "Product question",      prompt: "I have a question about a product I bought" },
  { icon: Truck,        label: "Delivery issue",         prompt: "I have an issue with my delivery" },
  { icon: Star,         label: "Leave a review",         prompt: "I'd like to leave a review for a recent purchase" },
];

export default function SupportPage() {
  const store   = useStore();
  const session = useGeminiSession();
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    store.setAgentMode("support");
    store.setAgentPanelOpen(true);

    // Load real orders
    fetch(`${API}/api/customers/${store.customerId}/orders`)
      .then(r => r.ok ? r.json() : { orders: [] })
      .then(d => setOrders(d.orders || []))
      .catch(() => {});
  }, []);

  const startCallWithPrompt = async (prompt: string) => {
    if (store.sessionStatus !== "connected") {
      await session.connect();
      setTimeout(() => session.sendText(prompt), 1500);
    } else {
      session.sendText(prompt);
    }
  };

  const formatDate = (ts: number | string) => {
    if (typeof ts === "string") return ts;
    return new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <StorefrontLayout>
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        {/* Hero */}
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-bold text-gray-900" style={{ fontFamily: "'DM Serif Display', serif" }}>
            How can we help you?
          </h1>
          <p className="text-gray-500">Talk to Aria, our AI specialist, for instant help — or browse common issues below.</p>
        </div>

        {/* Start call banner */}
        {store.sessionStatus !== "connected" && (
          <div className="rounded-2xl p-6 flex items-center justify-between" style={{ background: "var(--green-900)" }}>
            <div>
              <p className="text-white font-semibold text-lg">Talk to Aria</p>
              <p className="text-white/70 text-sm mt-1">Our AI specialist is ready to help right now — she already knows your order history</p>
            </div>
            <button
              onClick={() => startCallWithPrompt("Hello, I need some help")}
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-white font-semibold text-sm transition-all hover:bg-green-50"
              style={{ color: "var(--green-900)" }}
            >
              <PhoneCall size={16} /> Start Call
            </button>
          </div>
        )}

        {/* Quick issue chips */}
        <div>
          <h2 className="font-semibold text-gray-900 mb-4">What can we help with?</h2>
          <div className="grid grid-cols-3 gap-3">
            {QUICK_ISSUES.map(({ icon: Icon, label, prompt }) => (
              <button
                key={label}
                onClick={() => startCallWithPrompt(prompt)}
                className="flex items-center gap-4 bg-white rounded-2xl p-5 text-left hover:shadow-md hover:-translate-y-0.5 transition-all border border-gray-100"
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--green-100)" }}>
                  <Icon size={18} style={{ color: "var(--green-700)" }} />
                </div>
                <span className="font-medium text-gray-900 text-sm">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Recent orders from real data */}
        <div>
          <h2 className="font-semibold text-gray-900 mb-4">Your Recent Orders</h2>
          {orders.length === 0 ? (
            <p className="text-gray-400 text-sm">No orders found.</p>
          ) : (
            <div className="space-y-3">
              {orders.map(order => (
                <div key={order.order_id} className="bg-white rounded-2xl p-5 border border-gray-100">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-gray-900">{order.order_id}</span>
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={
                            order.status === "delivered"
                              ? { background: "var(--green-100)", color: "var(--green-700)" }
                              : { background: "#FEF3C7", color: "#92400E" }
                          }
                        >
                          {order.status.replace("_", " ")}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">{formatDate(order.placed_at)}</p>
                      <p className="text-sm text-gray-600 mt-1">
                        {order.items?.map(i => `${i.name} × ${i.qty}`).join(", ")}
                      </p>
                      {order.shipping?.tracking_number && (
                        <p className="text-xs text-gray-400 mt-1">
                          Tracking: {order.shipping.carrier} {order.shipping.tracking_number}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-gray-900">${order.total?.toFixed(2)}</p>
                      <button
                        onClick={() => startCallWithPrompt(`I need help with order ${order.order_id}`)}
                        className="text-xs mt-2 font-medium transition-colors"
                        style={{ color: "var(--green-700)" }}
                      >
                        Get help →
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </StorefrontLayout>
  );
}
