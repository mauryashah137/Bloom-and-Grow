"use client";
import { useState } from "react";
import { StorefrontLayout } from "@/components/layout/StorefrontLayout";
import { useStore } from "@/store";
import Link from "next/link";
import { ShoppingCart, Check, Star } from "lucide-react";

const API = (process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080/ws")
  .replace(/^wss?:\/\//, "https://").replace("/ws", "");

const BUNDLES = [
  {
    id: "bundle-beginner",
    name: "Beginner Plant Parent Kit",
    description: "Everything you need to start your plant journey. Perfect for first-time plant owners.",
    discount_pct: 20,
    items: [
      { product_id: "P003", name: "Pothos Golden 4in Hanging", price: 12.99 },
      { product_id: "P004", name: "Snake Plant Laurentii 8in", price: 28.99 },
      { product_id: "P006", name: "Premium Potting Mix 8qt", price: 18.99 },
      { product_id: "P015", name: "Moisture & pH Meter 3-in-1", price: 19.99 },
    ],
    emoji: "🌱",
  },
  {
    id: "bundle-tropical",
    name: "Tropical Paradise Bundle",
    description: "Create a lush tropical corner in your home with these humidity-loving plants.",
    discount_pct: 15,
    items: [
      { product_id: "P001", name: "Monstera Deliciosa 6in Pot", price: 34.99 },
      { product_id: "P017", name: "Monstera Adansonii Hanging 4in", price: 18.99 },
      { product_id: "P014", name: "Humidifier Cool Mist 1.5L", price: 44.99 },
      { product_id: "P006", name: "Premium Potting Mix 8qt", price: 18.99 },
    ],
    emoji: "🌴",
  },
  {
    id: "bundle-tools",
    name: "Garden Tool Essentials",
    description: "Professional-grade tools for serious gardeners. Everything you need in one kit.",
    discount_pct: 15,
    items: [
      { product_id: "P011", name: "Watering Can Copper 1.5L", price: 34.99 },
      { product_id: "P012", name: "Pruning Shears Professional", price: 29.99 },
      { product_id: "P015", name: "Moisture & pH Meter 3-in-1", price: 19.99 },
      { product_id: "P019", name: "Neem Oil Spray 16oz Organic", price: 14.99 },
    ],
    emoji: "🔧",
  },
  {
    id: "bundle-succulent",
    name: "Succulent Lover's Collection",
    description: "Low-maintenance plants with the perfect pots. Ideal for desks and windowsills.",
    discount_pct: 20,
    items: [
      { product_id: "P016", name: "Cactus & Succulent Collection 4-Pack", price: 32.99 },
      { product_id: "P007", name: "Orchid & Succulent Mix 4qt", price: 14.99 },
      { product_id: "P010", name: "Terracotta Pot Set 4/6/8in", price: 24.99 },
    ],
    emoji: "🌵",
  },
  {
    id: "bundle-decor",
    name: "Home Décor Plant Package",
    description: "Beautiful plants with stylish display accessories. Instagram-ready from day one.",
    discount_pct: 10,
    items: [
      { product_id: "P005", name: "Peace Lily 6in", price: 22.99 },
      { product_id: "P009", name: "Self-Watering Ceramic Pot 8in", price: 39.99 },
      { product_id: "P020", name: "Hanging Macrame Plant Holder Set", price: 27.99 },
      { product_id: "P013", name: "Grow Light Full Spectrum 45W", price: 54.99 },
    ],
    emoji: "🏡",
  },
];

export default function BundlesPage() {
  const store = useStore();
  const [addingBundle, setAddingBundle] = useState<string | null>(null);
  const [addedBundle, setAddedBundle] = useState<string | null>(null);

  const addBundle = async (bundle: typeof BUNDLES[0]) => {
    setAddingBundle(bundle.id);
    for (const item of bundle.items) {
      try {
        const r = await fetch(`${API}/api/cart/${store.customerId}/add`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product_id: item.product_id, qty: 1 }),
        });
        if (r.ok) {
          const d = await r.json();
          const cart = d.cart || d;
          if (cart.items) store.setCart(cart);
        }
      } catch {}
    }
    setAddingBundle(null);
    setAddedBundle(bundle.id);
    setTimeout(() => setAddedBundle(null), 3000);
  };

  return (
    <StorefrontLayout>
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900" style={{ fontFamily: "'DM Serif Display', serif" }}>
            Bundle Deals
          </h1>
          <p className="text-gray-500 mt-2">Save more when you buy together. Curated bundles for every gardener.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {BUNDLES.map(bundle => {
            const originalTotal = bundle.items.reduce((sum, i) => sum + i.price, 0);
            const discountAmount = originalTotal * bundle.discount_pct / 100;
            const bundlePrice = originalTotal - discountAmount;
            const isAdding = addingBundle === bundle.id;
            const isAdded = addedBundle === bundle.id;

            return (
              <div key={bundle.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg transition-all">
                {/* Header */}
                <div className="p-6 pb-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ background: "var(--cream-100)" }}>
                        {bundle.emoji}
                      </div>
                      <div>
                        <h2 className="font-bold text-gray-900 text-lg">{bundle.name}</h2>
                        <p className="text-sm text-gray-500 mt-0.5">{bundle.description}</p>
                      </div>
                    </div>
                    <div className="bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full shrink-0">
                      {bundle.discount_pct}% OFF
                    </div>
                  </div>
                </div>

                {/* Items */}
                <div className="px-6 space-y-2">
                  {bundle.items.map(item => (
                    <div key={item.product_id} className="flex items-center justify-between py-2 border-t border-gray-50">
                      <Link href={`/product/${item.product_id}`} className="text-sm text-gray-700 hover:text-green-700 transition-colors flex-1">
                        {item.name}
                      </Link>
                      <span className="text-sm text-gray-400 ml-3">${item.price.toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                {/* Pricing + CTA */}
                <div className="p-6 pt-4 mt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <span className="text-2xl font-bold text-gray-900">${bundlePrice.toFixed(2)}</span>
                      <span className="text-sm text-gray-400 line-through ml-2">${originalTotal.toFixed(2)}</span>
                    </div>
                    <span className="text-sm font-medium text-green-600">Save ${discountAmount.toFixed(2)}</span>
                  </div>
                  <button
                    onClick={() => addBundle(bundle)}
                    disabled={isAdding || isAdded}
                    className="w-full py-3.5 rounded-xl text-white font-semibold text-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-70 flex items-center justify-center gap-2"
                    style={{ background: isAdded ? "#16a34a" : "var(--green-900)" }}
                  >
                    {isAdded ? (
                      <><Check size={16} /> Added to Cart!</>
                    ) : isAdding ? (
                      "Adding..."
                    ) : (
                      <><ShoppingCart size={16} /> Add Bundle to Cart</>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </StorefrontLayout>
  );
}
