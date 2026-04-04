"use client";
import { useState, useEffect } from "react";
import { StorefrontLayout } from "@/components/layout/StorefrontLayout";
import { useStore } from "@/store";
import type { Order } from "@/lib/types";
import Link from "next/link";
import { Package, Truck, CheckCircle, Clock, ChevronRight } from "lucide-react";

const API = (process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080/ws")
  .replace(/^wss?:\/\//, "https://").replace("/ws", "");

const STATUS_CONFIG: Record<string, { icon: any; color: string; bg: string }> = {
  confirmed:  { icon: Clock,       color: "text-blue-600",   bg: "bg-blue-50" },
  processing: { icon: Clock,       color: "text-yellow-600", bg: "bg-yellow-50" },
  shipped:    { icon: Truck,       color: "text-orange-600", bg: "bg-orange-50" },
  in_transit: { icon: Truck,       color: "text-orange-600", bg: "bg-orange-50" },
  delivered:  { icon: CheckCircle, color: "text-green-600",  bg: "bg-green-50" },
  refund_processed: { icon: Package, color: "text-purple-600", bg: "bg-purple-50" },
};

export default function OrdersPage() {
  const store = useStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Order | null>(null);

  useEffect(() => {
    fetch(`${API}/api/customers/${store.customerId}/orders`)
      .then(r => r.ok ? r.json() : { orders: [] })
      .then(d => { setOrders(d.orders || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [store.customerId]);

  const formatDate = (ts: number | string) => {
    if (typeof ts === "string") return ts;
    return new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <StorefrontLayout>
      <div className="max-w-4xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-8" style={{ fontFamily: "'DM Serif Display', serif" }}>
          Your Orders
        </h1>

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl h-24 animate-pulse" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-20">
            <Package size={48} className="mx-auto text-gray-200 mb-4" />
            <p className="text-gray-500 text-lg mb-4">No orders yet</p>
            <Link href="/shop" className="inline-block px-6 py-3 rounded-full text-white font-semibold text-sm" style={{ background: "var(--green-900)" }}>
              Start Shopping
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map(order => {
              const config = STATUS_CONFIG[order.status] || STATUS_CONFIG.confirmed;
              const Icon = config.icon;

              return (
                <div
                  key={order.order_id}
                  className={`bg-white rounded-2xl p-5 border transition-all cursor-pointer hover:shadow-md ${
                    selected?.order_id === order.order_id ? "border-green-400 shadow-md" : "border-gray-100"
                  }`}
                  onClick={() => setSelected(selected?.order_id === order.order_id ? null : order)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full ${config.bg} flex items-center justify-center`}>
                        <Icon size={18} className={config.color} />
                      </div>
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-gray-900">{order.order_id}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${config.bg} ${config.color}`}>
                            {order.status.replace("_", " ")}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5">{formatDate(order.placed_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-bold text-gray-900">${order.total?.toFixed(2)}</span>
                      <ChevronRight size={16} className={`text-gray-300 transition-transform ${selected?.order_id === order.order_id ? "rotate-90" : ""}`} />
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {selected?.order_id === order.order_id && (
                    <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
                      {/* Items */}
                      <div className="space-y-2">
                        {order.items?.map(item => (
                          <div key={item.product_id} className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded bg-stone-100 flex items-center justify-center">
                                <span className="text-sm">🌱</span>
                              </div>
                              <div>
                                <p className="text-sm text-gray-900">{item.name}</p>
                                <p className="text-xs text-gray-400">Qty {item.qty}</p>
                              </div>
                            </div>
                            <span className="text-sm font-medium">${(item.price * item.qty).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>

                      {/* Tracking */}
                      {order.shipping?.tracking_number && (
                        <div className="bg-gray-50 rounded-xl p-3 space-y-1">
                          <p className="text-xs font-medium text-gray-900">Tracking</p>
                          <p className="text-xs text-gray-600">{order.shipping.carrier} — {order.shipping.tracking_number}</p>
                          {order.shipping.status && (
                            <p className="text-xs text-gray-500">{order.shipping.status}</p>
                          )}
                          {order.shipping.estimated_delivery && (
                            <p className="text-xs text-gray-500">Est. delivery: {order.shipping.estimated_delivery}</p>
                          )}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2">
                        <Link
                          href={`/support`}
                          className="px-4 py-2 rounded-lg text-xs font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          Get Help
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </StorefrontLayout>
  );
}
