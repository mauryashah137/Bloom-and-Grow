"use client";
import { useEffect } from "react";
import { StorefrontLayout } from "@/components/layout/StorefrontLayout";
import { useStore } from "@/store";
import { Trash2, Minus, Plus, ChevronDown } from "lucide-react";
import Link from "next/link";

const API = (process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080/ws")
  .replace(/^wss?:\/\//, "https://").replace("/ws", "");

export default function CartPage() {
  const store   = useStore();
  const cart    = store.cart;
  const setCart = store.setCart;

  // Load cart on mount
  useEffect(() => {
    fetch(`${API}/api/cart/${store.customerId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setCart(d); })
      .catch(() => {});
  }, []);

  const remove = async (pid: string) => {
    const r = await fetch(`${API}/api/cart/${store.customerId}/item/${pid}`, { method: "DELETE" });
    if (r.ok) {
      const d = await r.json();
      const c = d.cart || d;
      if (c.items) setCart(c);
    }
  };

  const subtotal = cart?.subtotal ?? 0;
  const tax = cart?.tax ?? 0;
  const discount = cart?.discount_pct ?? 0;
  const discountAmt = cart?.discount_amount ?? 0;
  const shipping = cart?.shipping ?? 0;
  const total = cart?.total ?? 0;

  return (
    <StorefrontLayout>
      <div className="max-w-7xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-8" style={{ fontFamily: "'DM Serif Display', serif" }}>
          Your cart {cart?.items?.length ? `(${cart.items.length})` : ""}
        </h1>

        {(!cart?.items?.length) ? (
          <div className="text-center py-24">
            <div className="text-6xl mb-6">🛒</div>
            <p className="text-gray-500 text-lg mb-6">Your cart is empty</p>
            <Link href="/" className="inline-block px-8 py-3 rounded-full text-white font-semibold" style={{ background: "var(--green-900)" }}>
              Start shopping
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_360px] gap-8">
            {/* ── Items ──────────────────────────────────────────────── */}
            <div className="space-y-5">
              {cart.items.map(item => (
                <div key={item.product_id} className="flex items-center gap-5 bg-white rounded-2xl p-5">
                  {/* Image */}
                  <div className="w-24 h-24 rounded-xl shrink-0 flex items-center justify-center bg-stone-100">
                    <span className="text-4xl">🌱</span>
                  </div>
                  {/* Details */}
                  <div className="flex-1">
                    {item.added_by_agent && (
                      <div className="inline-flex items-center gap-1.5 bg-green-50 border border-green-200 text-green-700 text-[11px] font-medium px-2.5 py-1 rounded-full mb-2">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>
                        Added by Agent
                      </div>
                    )}
                    <p className="font-semibold text-gray-900">{item.name}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{item.qty > 1 ? `${item.qty} cubic feet` : "0.75 cubic feet"}</p>
                    <p className="font-bold text-gray-900 mt-2">${item.price.toFixed(2)}/each</p>
                  </div>
                  {/* Qty + remove */}
                  <div className="flex flex-col items-end gap-3">
                    <button onClick={() => remove(item.product_id)} className="text-gray-300 hover:text-red-400 transition-colors">
                      <Trash2 size={15} />
                    </button>
                    <div className="flex items-center border border-gray-200 rounded-lg">
                      <button className="px-2.5 py-2 text-gray-500 hover:text-gray-700"><Minus size={12} /></button>
                      <select
                        value={item.qty}
                        className="bg-transparent border-none outline-none text-sm font-medium text-gray-900 cursor-pointer px-1 py-2"
                      >
                        {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                      <button className="px-2.5 py-2 text-gray-500 hover:text-gray-700"><Plus size={12} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Summary sidebar ──────────────────────────────────── */}
            <div className="bg-white rounded-2xl p-6 h-fit space-y-4">
              <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: "'DM Serif Display', serif" }}>Summary</h2>
              <div className="space-y-3 py-3 border-t border-b border-gray-100">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Sub total</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Shipping</span>
                  <span className={shipping === 0 ? "text-green-600" : ""}>{shipping === 0 ? "Free" : `$${shipping.toFixed(2)}`}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Tax</span>
                  <span>${tax.toFixed(2)}</span>
                </div>
                {/* Promo code */}
                <div className="flex items-center justify-between py-1 cursor-pointer">
                  <span className="text-sm text-gray-400">Do you have a promo code?</span>
                  <ChevronDown size={14} className="text-gray-400" />
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Discount ({discount}%)</span>
                    <span>-${(subtotal * discount / 100).toFixed(2)}</span>
                  </div>
                )}
              </div>
              <div className="flex justify-between font-bold text-gray-900">
                <span>Total</span>
                <span>${total.toFixed(2)}</span>
              </div>
              <Link
                href="/checkout"
                className="block w-full py-4 rounded-xl text-white text-center font-semibold text-base transition-all hover:opacity-90"
                style={{ background: "var(--green-900)" }}
              >
                Checkout
              </Link>
            </div>
          </div>
        )}

        {/* Recently viewed */}
        <section className="mt-12">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recently viewed</h2>
          <div className="grid grid-cols-4 gap-4">
            {["Budget Bloom Mix", "Bloom & Grow", "Bloom & Grow Soil", "Spring Mix"].map((n, i) => (
              <div key={i} className="bg-white rounded-2xl overflow-hidden cursor-pointer hover:shadow-md transition-all">
                <div className="h-28 flex items-center justify-center" style={{ background: "var(--cream-100)" }}>
                  <span className="text-4xl">🌱</span>
                </div>
                <div className="p-3">
                  <p className="text-sm font-medium text-gray-700">{n}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </StorefrontLayout>
  );
}
