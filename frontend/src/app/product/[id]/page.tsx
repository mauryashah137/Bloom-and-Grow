"use client";
import { useState, useEffect, use } from "react";
import { StorefrontLayout } from "@/components/layout/StorefrontLayout";
import { useStore } from "@/store";
import type { Product } from "@/lib/types";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Star, Minus, Plus } from "lucide-react";

const API = (process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080/ws")
  .replace(/^wss?:\/\//, "https://").replace("/ws", "");

const CATEGORY_EMOJIS: Record<string, string[]> = {
  plants: ["🌿", "🪴", "🌱"],
  soil: ["🌍", "🪨", "🌱"],
  fertilizers: ["🌸", "💧", "🌱"],
  pots: ["🏺", "🪴", "🌱"],
  tools: ["🔧", "✂️", "🛠️"],
  lighting: ["💡", "☀️", "🔆"],
  accessories: ["✨", "🌡️", "💧"],
  bundles: ["🎁", "📦", "🌿"],
  "pest-control": ["🛡️", "🐛", "🌿"],
  decor: ["🎍", "🌸", "🏡"],
  default: ["🌿", "🌱", "🪴"],
};

export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const id = resolvedParams?.id;

  const [product, setProduct] = useState<Product | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [complementary, setComplementary] = useState<Product[]>([]);
  const [qty, setQty] = useState(1);
  const [galleryIdx, setGalleryIdx] = useState(0);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const store = useStore();

  useEffect(() => {
    if (!id) {
      setNotFound(true);
      return;
    }
    fetch(`${API}/api/products/${id}`)
      .then(r => {
        if (!r.ok) {
          setNotFound(true);
          return null;
        }
        return r.json();
      })
      .then(d => {
        if (d) {
          setProduct(d);
          if (d.complementary_products) setComplementary(d.complementary_products);
        }
      })
      .catch(() => {
        setNotFound(true);
      });
  }, [id]);

  const addToCart = async () => {
    if (!product) return;
    setAdding(true);
    try {
      const r = await fetch(`${API}/api/cart/${store.customerId}/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: product.id, qty }),
      });
      if (r.ok) {
        const d = await r.json();
        const cart = d.cart || d;
        if (cart.items) store.setCart(cart);
      }
    } catch {
      // silently handle cart errors
    }
    setAdding(false);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  if (notFound) {
    return (
      <StorefrontLayout>
        <div className="max-w-7xl mx-auto px-6 py-16 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Product not found</h1>
          <p className="text-gray-500 mb-6">The product you are looking for does not exist or has been removed.</p>
          <Link
            href="/shop"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-white font-semibold transition-all hover:opacity-90"
            style={{ background: "var(--green-700)" }}
          >
            Back to Shop
          </Link>
        </div>
      </StorefrontLayout>
    );
  }

  if (!product) {
    return (
      <StorefrontLayout>
        <div className="max-w-7xl mx-auto px-6 py-16 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-green-200 border-t-green-600 rounded-full animate-spin" />
        </div>
      </StorefrontLayout>
    );
  }

  const price = product.sale_price ?? product.price;
  const reviewCount = product.review_count ?? 0;
  const rating = product.rating ?? 0;
  const galleryImages = CATEGORY_EMOJIS[product.category] || CATEGORY_EMOJIS.default;
  const isInCart = store.cart?.items?.some(i => i.product_id === product.id) ?? false;

  const removeFromCart = async () => {
    try {
      const r = await fetch(`${API}/api/cart/${store.customerId}/item/${product.id}`, { method: "DELETE" });
      if (r.ok) {
        const d = await r.json();
        const cart = d.cart || d;
        if (cart.items) store.setCart(cart);
      }
    } catch {}
  };

  return (
    <StorefrontLayout>
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-8">
          <Link href="/" className="hover:text-green-700 transition-colors">Home</Link>
          <span>›</span>
          <Link href={`/shop?category=${product.category === "tools" || product.category === "lighting" || product.category === "accessories" ? "tools" : "plants"}`} className="hover:text-green-700 transition-colors capitalize">
            {product.category}
          </Link>
          <span>›</span>
          <span className="text-gray-400">{product.name}</span>
        </div>

        <div className="grid grid-cols-2 gap-16">
          {/* Left: Image gallery */}
          <div className="space-y-4">
            <div className="w-full aspect-square rounded-2xl flex items-center justify-center" style={{ background: "var(--cream-100)" }}>
              <span className="text-9xl">{galleryImages[galleryIdx]}</span>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setGalleryIdx(i => Math.max(0, i - 1))} className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50">
                <ChevronLeft size={14} />
              </button>
              {galleryImages.map((img, i) => (
                <button key={i} onClick={() => setGalleryIdx(i)}
                  className={`w-16 h-16 rounded-xl flex items-center justify-center transition-all ${galleryIdx === i ? "ring-2 ring-green-600" : "border border-gray-200"}`}
                  style={{ background: "var(--cream-100)" }}>
                  <span className="text-2xl">{img}</span>
                </button>
              ))}
              <button onClick={() => setGalleryIdx(i => Math.min(galleryImages.length - 1, i + 1))} className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {/* Right: Product info */}
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900" style={{ fontFamily: "'DM Serif Display', serif" }}>{product.name}</h1>
              <div className="flex items-center gap-2 mt-3">
                <div className="flex">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} size={16} className={i < Math.round(rating) ? "text-yellow-400 fill-yellow-400" : "text-gray-200 fill-gray-200"} />
                  ))}
                </div>
                <span className="text-sm text-gray-500">({reviewCount.toLocaleString()} reviews)</span>
              </div>
            </div>

            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-bold text-gray-900">${price.toFixed(2)}</span>
              {product.sale_price != null && <span className="text-lg text-gray-400 line-through">${product.price.toFixed(2)}</span>}
            </div>

            <div>
              <h3 className="font-semibold text-gray-900 mb-2">About this item</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{product.description}</p>
            </div>

            {/* Stock status */}
            {product.stock !== undefined && product.stock !== null && (
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${product.stock > 5 ? "bg-green-500" : product.stock > 0 ? "bg-yellow-500" : "bg-red-500"}`} />
                <span className="text-sm text-gray-600">
                  {product.stock > 5 ? "In Stock" : product.stock > 0 ? `Only ${product.stock} left` : "Out of Stock"}
                </span>
              </div>
            )}

            {/* Care info */}
            {product.care && Object.keys(product.care).length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                {Object.entries(product.care).map(([k, v]) => (
                  <div key={k} className="bg-green-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-500 capitalize">{k}</p>
                    <p className="text-xs font-medium text-gray-900 mt-1">{v}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Tags */}
            {product.tags && product.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {product.tags.map(tag => (
                  <span key={tag} className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-600">{tag}</span>
                ))}
              </div>
            )}

            {/* Cart actions */}
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <button
                  onClick={addToCart}
                  disabled={adding || added}
                  className="flex-1 py-4 rounded-xl text-white font-semibold text-base transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-70"
                  style={{ background: "var(--green-900)" }}
                >
                  {added ? "Added!" : adding ? "Adding..." : isInCart ? "Add More" : "Add to Cart"}
                </button>
                <div className="flex items-center gap-1 border border-gray-200 rounded-xl px-3 py-3">
                  <button onClick={() => setQty(q => Math.max(1, q - 1))} className="text-gray-500 hover:text-gray-700"><Minus size={14} /></button>
                  <select value={qty} onChange={e => setQty(Number(e.target.value))} className="bg-transparent border-none outline-none text-sm font-medium text-gray-900 cursor-pointer w-8 text-center">
                    {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <button onClick={() => setQty(q => q + 1)} className="text-gray-500 hover:text-gray-700"><Plus size={14} /></button>
                </div>
              </div>
              {isInCart && (
                <button
                  onClick={removeFromCart}
                  className="w-full py-3 rounded-xl border-2 border-red-200 text-red-600 font-semibold text-sm transition-all hover:bg-red-50 active:scale-[0.98]"
                >
                  Remove from Cart
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Complementary products */}
        {complementary.length > 0 && (
          <section className="mt-16">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Frequently bought together</h2>
            <div className="grid grid-cols-4 gap-4">
              {complementary.map(p => (
                <Link key={p.id} href={`/product/${p.id}`} className="bg-white rounded-2xl overflow-hidden hover:shadow-md transition-all cursor-pointer">
                  <div className="h-32 flex items-center justify-center" style={{ background: "var(--cream-100)" }}>
                    <span className="text-4xl">🌱</span>
                  </div>
                  <div className="p-3">
                    <p className="text-sm text-gray-700 font-medium">{p.name}</p>
                    <p className="text-sm font-bold text-gray-900 mt-1">${(p.sale_price ?? p.price).toFixed(2)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </StorefrontLayout>
  );
}
