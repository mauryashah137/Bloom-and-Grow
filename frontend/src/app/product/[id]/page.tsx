"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { StorefrontLayout } from "@/components/layout/StorefrontLayout";
import { useStore } from "@/store";
import Link from "next/link";
import { Star, Minus, Plus, ShoppingCart, Trash2, Truck, Shield, ArrowLeft } from "lucide-react";

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
};

// Mock reviews for each product — in production these come from a reviews API
const MOCK_REVIEWS: Record<string, Array<{name: string; rating: number; date: string; text: string}>> = {};
function getReviews(productId: string, productName: string) {
  if (MOCK_REVIEWS[productId]) return MOCK_REVIEWS[productId];
  const names = ["Sarah M.", "James K.", "Emily R.", "Michael T.", "Lisa P."];
  const texts = [
    `Love this ${productName}! Exactly what I needed for my garden. Great quality and arrived in perfect condition.`,
    `Really happy with this purchase. The quality is outstanding and it's exactly as described. Would definitely recommend!`,
    `This is my second time buying this. Holds up really well and looks beautiful. Five stars from me!`,
  ];
  const reviews = texts.map((text, i) => ({
    name: names[i],
    rating: 4 + Math.round(Math.random()),
    date: `${["Jan", "Feb", "Mar", "Apr"][i]} ${10 + i * 5}, 2026`,
    text,
  }));
  MOCK_REVIEWS[productId] = reviews;
  return reviews;
}

export default function ProductPage() {
  const params = useParams();
  const id = params?.id as string;

  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [complementary, setComplementary] = useState<any[]>([]);
  const [qty, setQty] = useState(1);
  const [galleryIdx, setGalleryIdx] = useState(0);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const store = useStore();

  useEffect(() => {
    if (!id) { setNotFound(true); setLoading(false); return; }
    fetch(`${API}/api/products/${id}`)
      .then(r => { if (!r.ok) { setNotFound(true); setLoading(false); return null; } return r.json(); })
      .then(d => {
        if (d) {
          setProduct(d);
          if (d.complementary_products) setComplementary(d.complementary_products);
        }
        setLoading(false);
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [id]);

  const addToCart = async () => {
    if (!product) return;
    setAdding(true);
    try {
      const r = await fetch(`${API}/api/cart/${store.customerId}/add`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: product.id, qty }),
      });
      if (r.ok) { const d = await r.json(); const cart = d.cart || d; if (cart.items) store.setCart(cart); }
    } catch {}
    setAdding(false);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const removeFromCart = async () => {
    if (!product) return;
    try {
      const r = await fetch(`${API}/api/cart/${store.customerId}/item/${product.id}`, { method: "DELETE" });
      if (r.ok) { const d = await r.json(); const cart = d.cart || d; if (cart.items) store.setCart(cart); }
    } catch {}
  };

  if (loading) {
    return (
      <StorefrontLayout>
        <div className="max-w-7xl mx-auto px-6 py-16 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-green-200 border-t-green-600 rounded-full animate-spin" />
        </div>
      </StorefrontLayout>
    );
  }

  if (notFound || !product) {
    return (
      <StorefrontLayout>
        <div className="max-w-7xl mx-auto px-6 py-16 text-center">
          <div className="text-6xl mb-4">🔍</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Product not found</h1>
          <p className="text-gray-500 mb-6">The product you're looking for doesn't exist or has been removed.</p>
          <Link href="/" className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-white font-semibold" style={{ background: "var(--green-700)" }}>
            <ArrowLeft size={16} /> Back to Shop
          </Link>
        </div>
      </StorefrontLayout>
    );
  }

  const price = product.sale_price ?? product.price;
  const rating = product.rating ?? 0;
  const reviewCount = product.review_count ?? 0;
  const galleryImages = CATEGORY_EMOJIS[product.category] || CATEGORY_EMOJIS.plants;
  const isInCart = store.cart?.items?.some((i: any) => i.product_id === product.id) ?? false;
  const cartItem = store.cart?.items?.find((i: any) => i.product_id === product.id);
  const reviews = getReviews(product.id, product.name);

  return (
    <StorefrontLayout>
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
          <Link href="/" className="hover:text-green-700">Home</Link>
          <span>›</span>
          <Link href={`/shop?category=${["tools","lighting","accessories"].includes(product.category) ? "tools" : "plants"}`} className="hover:text-green-700 capitalize">
            {product.category}
          </Link>
          <span>›</span>
          <span className="text-gray-400 truncate max-w-[200px]">{product.name}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* ── Left: Gallery ──────────────────────────────────────── */}
          <div className="space-y-4">
            <div className="w-full aspect-square rounded-2xl flex items-center justify-center relative overflow-hidden" style={{ background: "var(--cream-100)" }}>
              {product.image_url?.startsWith("http") ? (
                <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-[120px]">{galleryImages[galleryIdx]}</span>
              )}
              {product.sale_price != null && (
                <span className="absolute top-4 left-4 bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full">SALE</span>
              )}
            </div>
            <div className="flex items-center justify-center gap-3">
              {product.image_url?.startsWith("http") ? (
                <button
                  className="w-16 h-16 rounded-xl flex items-center justify-center transition-all ring-2 ring-green-600 bg-green-50 overflow-hidden"
                >
                  <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                </button>
              ) : (
                galleryImages.map((img: string, i: number) => (
                  <button key={i} onClick={() => setGalleryIdx(i)}
                    className={`w-16 h-16 rounded-xl flex items-center justify-center transition-all ${galleryIdx === i ? "ring-2 ring-green-600 bg-green-50" : "border border-gray-200 hover:border-green-300"}`}
                    style={{ background: galleryIdx === i ? undefined : "var(--cream-100)" }}>
                    <span className="text-2xl">{img}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* ── Right: Product Info ─────────────────────────────────── */}
          <div className="space-y-5">
            {/* Name + Rating */}
            <div>
              <h1 className="text-3xl font-bold text-gray-900" style={{ fontFamily: "'DM Serif Display', serif" }}>{product.name}</h1>
              <div className="flex items-center gap-3 mt-2">
                <div className="flex">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} size={16} className={i < Math.round(rating) ? "text-yellow-400 fill-yellow-400" : "text-gray-200 fill-gray-200"} />
                  ))}
                </div>
                <span className="text-sm text-gray-500">{reviewCount.toLocaleString()} reviews</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-medium capitalize">{product.skill_level || "beginner"}</span>
              </div>
            </div>

            {/* Price */}
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold text-gray-900">${price.toFixed(2)}</span>
              {product.sale_price != null && (
                <>
                  <span className="text-xl text-gray-400 line-through">${product.price.toFixed(2)}</span>
                  <span className="text-sm font-semibold text-red-500">Save ${(product.price - product.sale_price).toFixed(2)}</span>
                </>
              )}
            </div>

            {/* Description */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">About this item</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{product.description}</p>
            </div>

            {/* Stock */}
            {product.stock != null && (
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${product.stock > 10 ? "bg-green-500" : product.stock > 0 ? "bg-yellow-500" : "bg-red-500"}`} />
                <span className="text-sm font-medium text-gray-700">
                  {product.stock > 10 ? "In Stock" : product.stock > 0 ? `Only ${product.stock} left — order soon` : "Out of Stock"}
                </span>
              </div>
            )}

            {/* Care Info (for plants) */}
            {product.care && Object.keys(product.care).length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Care Guide</h3>
                <div className="grid grid-cols-3 gap-3">
                  {Object.entries(product.care).map(([k, v]) => (
                    <div key={k} className="bg-green-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-green-600 font-medium capitalize mb-1">{k === "water" ? "💧 Watering" : k === "light" ? "☀️ Light" : k === "humidity" ? "💨 Humidity" : k}</p>
                      <p className="text-xs font-medium text-gray-900">{v as string}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tags */}
            {product.tags?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {product.tags.map((tag: string) => (
                  <span key={tag} className="text-xs px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 font-medium">{tag}</span>
                ))}
              </div>
            )}

            {/* Cart Actions */}
            <div className="space-y-3 pt-2">
              {isInCart && cartItem && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
                  <ShoppingCart size={14} className="text-green-600" />
                  <span className="text-sm text-green-700 font-medium">In your cart ({cartItem.qty}x)</span>
                </div>
              )}
              <div className="flex items-center gap-3">
                <button
                  onClick={addToCart}
                  disabled={adding || added || (product.stock != null && product.stock <= 0)}
                  className="flex-1 py-4 rounded-xl text-white font-semibold text-base transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ background: added ? "#16a34a" : "var(--green-900)" }}
                >
                  {added ? "✓ Added!" : adding ? "Adding..." : <><ShoppingCart size={18} /> {isInCart ? "Add More" : "Add to Cart"}</>}
                </button>
                <div className="flex items-center border border-gray-200 rounded-xl">
                  <button onClick={() => setQty(q => Math.max(1, q - 1))} className="px-3 py-3.5 text-gray-500 hover:text-gray-700"><Minus size={14} /></button>
                  <span className="text-sm font-semibold text-gray-900 w-6 text-center">{qty}</span>
                  <button onClick={() => setQty(q => Math.min(99, q + 1))} className="px-3 py-3.5 text-gray-500 hover:text-gray-700"><Plus size={14} /></button>
                </div>
              </div>
              {isInCart && (
                <button onClick={removeFromCart} className="w-full py-3 rounded-xl border-2 border-red-200 text-red-600 font-semibold text-sm transition-all hover:bg-red-50 flex items-center justify-center gap-2">
                  <Trash2 size={14} /> Remove from Cart
                </button>
              )}
            </div>

            {/* Trust badges */}
            <div className="flex items-center gap-6 pt-2 border-t border-gray-100">
              <div className="flex items-center gap-2 text-gray-500">
                <Truck size={16} />
                <span className="text-xs">Free shipping over $75</span>
              </div>
              <div className="flex items-center gap-2 text-gray-500">
                <Shield size={16} />
                <span className="text-xs">30-day return policy</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Customer Reviews ─────────────────────────────────────── */}
        <section className="mt-16">
          <h2 className="text-xl font-bold text-gray-900 mb-6" style={{ fontFamily: "'DM Serif Display', serif" }}>
            Customer Reviews ({reviewCount.toLocaleString()})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {reviews.map((review, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-xs font-bold text-green-700">
                      {review.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{review.name}</p>
                      <p className="text-[10px] text-gray-400">{review.date}</p>
                    </div>
                  </div>
                  <div className="flex">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <Star key={j} size={12} className={j < review.rating ? "text-yellow-400 fill-yellow-400" : "text-gray-200 fill-gray-200"} />
                    ))}
                  </div>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">{review.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── You May Also Like ───────────────────────────────────── */}
        {complementary.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xl font-bold text-gray-900 mb-4" style={{ fontFamily: "'DM Serif Display', serif" }}>You May Also Like</h2>
            <div className="grid grid-cols-4 gap-4">
              {complementary.map((p: any) => {
                const emojis = CATEGORY_EMOJIS[p.category] || CATEGORY_EMOJIS.plants;
                return (
                  <Link key={p.id} href={`/product/${p.id}`} className="bg-white rounded-2xl overflow-hidden hover:shadow-md transition-all border border-gray-100">
                    <div className="h-32 flex items-center justify-center overflow-hidden" style={{ background: "var(--cream-100)" }}>
                      {p.image_url?.startsWith("http") ? (
                        <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-4xl">{emojis[0]}</span>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="text-sm text-gray-700 font-medium leading-tight">{p.name}</p>
                      <p className="text-sm font-bold text-gray-900 mt-1">${(p.sale_price ?? p.price).toFixed(2)}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </StorefrontLayout>
  );
}
