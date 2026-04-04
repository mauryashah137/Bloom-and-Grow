"use client";
import { useState } from "react";
import { useStore } from "@/store";
import { X, Minus, Plus, Trash2, Tag } from "lucide-react";
import Link from "next/link";

const API = (process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080/ws")
  .replace(/^wss?:\/\//, "https://").replace("/ws", "");

export function CartDrawer({ onClose }: { onClose: () => void }) {
  const store   = useStore();
  const cart    = store.cart;
  const setCart = store.setCart;
  const [promoCode, setPromoCode] = useState("");
  const [promoError, setPromoError] = useState("");
  const [promoSuccess, setPromoSuccess] = useState("");
  const [applying, setApplying] = useState(false);

  const remove = async (pid: string) => {
    const r = await fetch(`${API}/api/cart/${store.customerId}/item/${pid}`, { method: "DELETE" });
    if (r.ok) {
      const d = await r.json();
      const c = d.cart || d;
      if (c.items) setCart(c);
    }
  };

  const updateQty = async (pid: string, qty: number) => {
    if (qty <= 0) return remove(pid);
    const r = await fetch(`${API}/api/cart/${store.customerId}/item/${pid}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qty }),
    });
    if (r.ok) {
      const d = await r.json();
      const c = d.cart || d;
      if (c.items) setCart(c);
    }
  };

  const applyPromo = async () => {
    if (!promoCode.trim()) return;
    setApplying(true);
    setPromoError("");
    setPromoSuccess("");
    try {
      const r = await fetch(`${API}/api/cart/${store.customerId}/apply-offer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: promoCode.trim() }),
      });
      const d = await r.json();
      if (d.success) {
        setPromoSuccess(`${d.description} applied!`);
        // Refresh cart
        const cr = await fetch(`${API}/api/cart/${store.customerId}`);
        if (cr.ok) setCart(await cr.json());
      } else {
        setPromoError(d.error || "Invalid code");
      }
    } catch { setPromoError("Failed to apply code"); }
    setApplying(false);
  };

  const subtotal = cart?.subtotal ?? 0;
  const tax      = cart?.tax ?? +(subtotal * 0.084).toFixed(2);
  const discount = cart?.discount_pct ?? 0;
  const discountAmt = cart?.discount_amount ?? +(subtotal * discount / 100).toFixed(2);
  const shipping = cart?.shipping ?? 0;
  const total    = cart?.total ?? +((subtotal - discountAmt + tax + shipping)).toFixed(2);

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-50" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[480px] bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            Your cart {cart?.items?.length ? `(${cart.items.length})` : ""}
          </h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {(!cart?.items?.length) ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <div className="text-5xl">🛒</div>
              <p className="text-gray-400 text-sm">Your cart is empty</p>
              <button onClick={onClose} className="px-6 py-2.5 rounded-full text-sm font-medium text-white transition-colors" style={{ background: "var(--green-600)" }}>
                Start shopping
              </button>
            </div>
          ) : (
            cart.items.map(item => (
              <div key={item.product_id} className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-xl overflow-hidden shrink-0 bg-gray-50 flex items-center justify-center">
                  <span className="text-3xl">🌱</span>
                </div>
                <div className="flex-1 min-w-0">
                  {item.added_by_agent && (
                    <div className="inline-flex items-center gap-1 bg-green-50 border border-green-200 text-green-700 text-[10px] font-medium px-2 py-0.5 rounded-full mb-1">
                      <span>🛒</span> Added by Aria
                    </div>
                  )}
                  <p className="font-medium text-gray-900 text-sm">{item.name}</p>
                  <p className="font-semibold text-gray-900 text-sm mt-1">${item.price.toFixed(2)}/each</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <button onClick={() => remove(item.product_id)} className="p-1 text-gray-300 hover:text-red-400 transition-colors">
                    <Trash2 size={14} />
                  </button>
                  <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-2 py-1">
                    <button onClick={() => updateQty(item.product_id, item.qty - 1)} className="text-gray-500 hover:text-gray-700"><Minus size={12} /></button>
                    <span className="text-sm font-medium text-gray-900 w-4 text-center">{item.qty}</span>
                    <button onClick={() => updateQty(item.product_id, item.qty + 1)} className="text-gray-500 hover:text-gray-700"><Plus size={12} /></button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Summary */}
        {(cart?.items?.length ?? 0) > 0 && (
          <div className="border-t border-gray-100 px-6 py-5 space-y-3">
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>Subtotal</span><span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>Pickup</span><span className="text-green-600">Free</span>
            </div>
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>Tax</span><span>${tax.toFixed(2)}</span>
            </div>

            {/* Promo code */}
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2">
                  <Tag size={14} className="text-gray-400" />
                  <input
                    value={promoCode}
                    onChange={e => { setPromoCode(e.target.value); setPromoError(""); setPromoSuccess(""); }}
                    onKeyDown={e => e.key === "Enter" && applyPromo()}
                    className="flex-1 text-sm outline-none"
                    placeholder="Promo code"
                  />
                </div>
                <button
                  onClick={applyPromo}
                  disabled={applying}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                  style={{ background: "var(--green-600)" }}
                >
                  {applying ? "…" : "Apply"}
                </button>
              </div>
              {promoError && <p className="text-xs text-red-500">{promoError}</p>}
              {promoSuccess && <p className="text-xs text-green-600">{promoSuccess}</p>}
            </div>

            {discount > 0 && (
              <div className="flex items-center justify-between text-sm text-green-600">
                <span>Discount ({discount}%)</span><span>-${discountAmt.toFixed(2)}</span>
              </div>
            )}

            {cart?.free_shipping_eligible && (
              <p className="text-xs text-green-600 text-center">🎉 You qualify for free shipping!</p>
            )}

            <div className="flex items-center justify-between font-semibold text-gray-900 pt-1 border-t border-gray-100">
              <span>Total</span><span>${total.toFixed(2)}</span>
            </div>

            <Link
              href="/checkout"
              onClick={onClose}
              className="block w-full py-4 rounded-xl text-white text-center font-semibold text-base transition-colors hover:opacity-90"
              style={{ background: "var(--green-900)" }}
            >
              Checkout
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
