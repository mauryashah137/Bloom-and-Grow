"use client";
import { useEffect, useState } from "react";
import { StorefrontLayout } from "@/components/layout/StorefrontLayout";
import { useStore } from "@/store";
import { MapPin, CreditCard, CheckCircle, Package } from "lucide-react";
import Link from "next/link";

const API = (process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080/ws")
  .replace(/^wss?:\/\//, "https://").replace("/ws", "");

export default function CheckoutPage() {
  const store = useStore();
  const cart  = store.cart;

  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", phone: "",
    card_number: "", card_expiry: "", card_cvc: "", card_name: "",
    delivery_method: "pickup" as "pickup" | "delivery",
  });
  const [placing, setPlacing] = useState(false);
  const [order, setOrder]     = useState<any>(null);

  useEffect(() => {
    if (!cart) {
      fetch(`${API}/api/cart/${store.customerId}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) store.setCart(d); })
        .catch(() => {});
    }
  }, []);

  const subtotal = cart?.subtotal ?? 0;
  const tax      = cart?.tax ?? +(subtotal * 0.084).toFixed(2);
  const discount = cart?.discount_pct ?? 0;
  const discountAmt = cart?.discount_amount ?? +(subtotal * discount / 100).toFixed(2);
  const shipping = form.delivery_method === "delivery" ? (subtotal >= 75 ? 0 : 8.99) : 0;
  const total    = cart?.total ?? +((subtotal - discountAmt + tax + shipping)).toFixed(2);

  const placeOrder = async () => {
    setPlacing(true);
    try {
      const r = await fetch(`${API}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: store.customerId,
          shipping: {
            method: form.delivery_method,
            cost: shipping,
            first_name: form.first_name,
            last_name: form.last_name,
            email: form.email,
            phone: form.phone,
          },
          payment: {
            method: "card",
            last4: form.card_number.slice(-4) || "4242",
          },
        }),
      });
      if (r.ok) {
        const orderData = await r.json();
        setOrder(orderData);
        store.addOrder(orderData);
        store.setCart(null as any);
      }
    } catch (e) {
      console.error("Order failed:", e);
    }
    setPlacing(false);
  };

  // Order confirmation
  if (order) {
    return (
      <StorefrontLayout>
        <div className="max-w-2xl mx-auto py-16 px-6">
          <div className="text-center space-y-4 mb-10">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
              <CheckCircle size={32} className="text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'DM Serif Display', serif" }}>
              Order confirmed!
            </h1>
            <p className="text-gray-500">Order <span className="font-semibold text-gray-900">{order.order_id}</span></p>
          </div>

          {/* Order summary card */}
          <div className="bg-white rounded-2xl p-6 space-y-4 mb-6">
            <h2 className="font-semibold text-gray-900">Order Summary</h2>
            <div className="space-y-3">
              {order.items?.map((item: any) => (
                <div key={item.product_id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-stone-100 flex items-center justify-center overflow-hidden">
                      {item.image_url?.match(/^(http|\/images)/) ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" /> : <span>🌱</span>}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.name}</p>
                      <p className="text-xs text-gray-400">Qty {item.qty}</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold">${(item.price * item.qty).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-100 pt-3 space-y-2">
              <div className="flex justify-between text-sm text-gray-500">
                <span>Subtotal</span>
                <span>${order.subtotal?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-500">
                <span>Tax</span>
                <span>${order.tax?.toFixed(2)}</span>
              </div>
              {order.discount_pct > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Discount ({order.discount_pct}%)</span>
                  <span>-${order.discount_amount?.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-100">
                <span>Total</span>
                <span>${order.total?.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Next steps */}
          <div className="bg-white rounded-2xl p-6 space-y-4 mb-6">
            <h2 className="font-semibold text-gray-900">What's next</h2>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Package size={14} className="text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Confirmation email sent</p>
                  <p className="text-xs text-gray-500">Check your inbox for order details and tracking</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                  <MapPin size={14} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {order.shipping?.method === "pickup" ? "Ready for pickup in 2 hours" : "Shipping in 1-2 business days"}
                  </p>
                  <p className="text-xs text-gray-500">We'll notify you when your order is ready</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3 justify-center">
            <Link href="/" className="px-6 py-3 rounded-full text-white font-semibold text-sm" style={{ background: "var(--green-900)" }}>
              Continue Shopping
            </Link>
            <Link href="/orders" className="px-6 py-3 rounded-full border border-gray-200 text-gray-700 font-semibold text-sm">
              View Orders
            </Link>
            <Link href="/support" className="px-6 py-3 rounded-full border border-gray-200 text-gray-700 font-semibold text-sm">
              Get Support
            </Link>
          </div>
        </div>
      </StorefrontLayout>
    );
  }

  return (
    <StorefrontLayout>
      <div className="max-w-7xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-8" style={{ fontFamily: "'DM Serif Display', serif" }}>Checkout</h1>

        <div className="grid grid-cols-[1fr_360px] gap-8">
          {/* Left: form */}
          <div className="space-y-5">
            {/* Delivery */}
            <div className="bg-white rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-green-700" />
                <h2 className="font-semibold text-gray-900">Pickup or Delivery</h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: "pickup", label: "Free Pickup (Ready in 2h)" },
                  { value: "delivery", label: `Home Delivery (${subtotal >= 75 ? "Free" : "$8.99"})` },
                ].map(opt => (
                  <label key={opt.value} className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${form.delivery_method === opt.value ? "border-green-600 bg-green-50" : "border-gray-200 hover:border-gray-300"}`}>
                    <input type="radio" name="delivery" checked={form.delivery_method === opt.value}
                      onChange={() => setForm(f => ({ ...f, delivery_method: opt.value as any }))} className="accent-green-700" />
                    <span className="text-sm font-medium text-gray-900">{opt.label}</span>
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <input placeholder="First name" value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                  className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-green-400" />
                <input placeholder="Last name" value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
                  className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-green-400" />
                <input placeholder="Email address" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-green-400 col-span-2" />
                <input placeholder="Phone (optional)" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-green-400 col-span-2" />
              </div>
            </div>

            {/* Payment */}
            <div className="bg-white rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2">
                <CreditCard size={16} className="text-green-700" />
                <h2 className="font-semibold text-gray-900">Payment</h2>
              </div>
              <div className="space-y-3">
                <input placeholder="Card number" value={form.card_number} onChange={e => setForm(f => ({ ...f, card_number: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-green-400" />
                <div className="grid grid-cols-2 gap-3">
                  <input placeholder="MM / YY" value={form.card_expiry} onChange={e => setForm(f => ({ ...f, card_expiry: e.target.value }))}
                    className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-green-400" />
                  <input placeholder="CVC" value={form.card_cvc} onChange={e => setForm(f => ({ ...f, card_cvc: e.target.value }))}
                    className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-green-400" />
                </div>
                <input placeholder="Name on card" value={form.card_name} onChange={e => setForm(f => ({ ...f, card_name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-green-400" />
              </div>
            </div>
          </div>

          {/* Right: order summary */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-6 space-y-4">
              <h2 className="font-bold text-gray-900 text-lg" style={{ fontFamily: "'DM Serif Display', serif" }}>Summary</h2>
              <div className="space-y-3 max-h-48 overflow-y-auto">
                {cart?.items?.map(item => (
                  <div key={item.product_id} className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-stone-100 flex items-center justify-center shrink-0">
                      <span className="text-xl">🌱</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900 truncate">{item.name}</p>
                      <p className="text-xs text-gray-400">Qty {item.qty}</p>
                    </div>
                    <span className="text-sm font-semibold text-gray-900">${(item.price * item.qty).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-2 pt-3 border-t border-gray-100">
                <div className="flex justify-between text-sm text-gray-500"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
                <div className="flex justify-between text-sm text-gray-500">
                  <span>{form.delivery_method === "pickup" ? "Pickup" : "Delivery"}</span>
                  <span className={shipping === 0 ? "text-green-600" : ""}>{shipping === 0 ? "Free" : `$${shipping.toFixed(2)}`}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-500"><span>Tax</span><span>${tax.toFixed(2)}</span></div>
                {discount > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Discount ({discount}%)</span>
                    <span>-${discountAmt.toFixed(2)}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-between font-bold text-gray-900 border-t border-gray-100 pt-3">
                <span>Total</span>
                <span>${total.toFixed(2)}</span>
              </div>

              <button
                onClick={placeOrder}
                disabled={placing || !cart?.items?.length}
                className="w-full py-4 rounded-xl text-white font-semibold text-base transition-all hover:opacity-90 disabled:opacity-60"
                style={{ background: "var(--green-900)" }}
              >
                {placing ? "Placing order…" : "Place Order"}
              </button>

              <p className="text-[10px] text-center text-gray-400">
                By placing your order you agree to our <span className="underline cursor-pointer">Terms</span> and <span className="underline cursor-pointer">Privacy Policy</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </StorefrontLayout>
  );
}
