"use client";
import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { StorefrontLayout } from "@/components/layout/StorefrontLayout";
import { useStore } from "@/store";
import type { Product } from "@/store";
import Link from "next/link";
import { Star } from "lucide-react";

const API = (process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080/ws")
  .replace(/^wss?:\/\//, "https://").replace("/ws", "");

const ALL_CATEGORIES = ["All", "House plants", "Plants & Supplies", "Tools", "Soil", "Fertilizers", "Pots", "Accessories", "Decor"];

const TOOLS_CATEGORIES = ["All", "Tools", "Lighting", "Accessories"];
const PLANTS_CATEGORIES = ["All", "House Plants", "Soil", "Fertilizers", "Pots", "Bundles"];

const TOOLS_CATALOG = ["tools", "lighting", "accessories"];
const PLANTS_CATALOG = ["plants", "soil", "fertilizers", "pots", "bundles"];

const EMOJI_MAP: Record<string, string> = {
  plants:"🌿", soil:"🌍", fertilizers:"🌸", pots:"🏺",
  tools:"🔧", accessories:"✨", decor:"🎍", bundles:"🎁",
  lighting:"💡", default:"🌱",
};

function ShopContent() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading]   = useState(true);
  const [activeFilter, setActiveFilter] = useState("All");
  const searchParams = useSearchParams();
  const store        = useStore();

  const urlCategory = searchParams.get("category") || "";

  // Determine which filter pills to show based on URL category
  const filterList = useMemo(() => {
    if (urlCategory === "tools") return TOOLS_CATEGORIES;
    if (urlCategory === "plants") return PLANTS_CATEGORIES;
    return ALL_CATEGORIES;
  }, [urlCategory]);

  // Reset active filter when URL category changes
  useEffect(() => {
    setActiveFilter("All");
  }, [urlCategory]);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/api/products?limit=50`)
      .then(r => r.ok ? r.json() : { products: [] })
      .then(d => { setProducts(d.products || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const addToCart = async (product: Product) => {
    const r = await fetch(`${API}/api/cart/${store.customerId}/add`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: product.id, qty: 1 }),
    });
    if (r.ok) {
      const d = await r.json();
      const cart = d.cart || d;
      if (cart.items) store.setCart(cart);
    }
  };

  // First, filter by URL category param (broad category group)
  const categoryFiltered = useMemo(() => {
    if (urlCategory === "tools") {
      return products.filter(p => TOOLS_CATALOG.includes(p.category.toLowerCase()));
    }
    if (urlCategory === "plants") {
      return products.filter(p => PLANTS_CATALOG.includes(p.category.toLowerCase()));
    }
    return products;
  }, [products, urlCategory]);

  // Then, filter by the active pill filter
  const filtered = useMemo(() => {
    if (activeFilter === "All") return categoryFiltered;
    return categoryFiltered.filter(p =>
      p.category.toLowerCase().includes(activeFilter.toLowerCase()) ||
      p.tags?.some(t => t.toLowerCase().includes(activeFilter.toLowerCase()))
    );
  }, [categoryFiltered, activeFilter]);

  return (
    <StorefrontLayout>
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-8 overflow-x-auto pb-1">
          {filterList.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveFilter(cat)}
              className={`px-5 py-2.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                activeFilter === cat
                  ? "text-white shadow-sm"
                  : "bg-white border border-gray-200 text-gray-700 hover:border-green-400"
              }`}
              style={activeFilter === cat ? { background: "var(--green-900)" } : {}}
            >
              {cat}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl h-64 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg">No products found in this category.</p>
            <Link href="/shop" className="text-green-700 underline mt-2 inline-block">View all products</Link>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-6">
            {filtered.map(product => (
              <ProductCard key={product.id} product={product} onAddToCart={() => addToCart(product)} />
            ))}
          </div>
        )}
      </div>
    </StorefrontLayout>
  );
}

function ProductCard({ product, onAddToCart }: { product: Product; onAddToCart: () => void }) {
  const price   = product.sale_price ?? product.price;
  const onSale  = product.sale_price != null;
  const emoji   = EMOJI_MAP[product.category] || EMOJI_MAP.default;

  return (
    <div className="bg-white rounded-2xl overflow-hidden hover:shadow-lg transition-all hover:-translate-y-0.5 group">
      <Link href={`/product/${product.id}`}>
        <div className="h-44 flex items-center justify-center relative overflow-hidden" style={{ background: "var(--cream-100)" }}>
          <span className="text-5xl group-hover:scale-110 transition-transform duration-300">{emoji}</span>
          {onSale && (
            <span className="absolute top-3 left-3 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">SALE</span>
          )}
        </div>
      </Link>
      <div className="p-4 space-y-2">
        <div className="flex items-center gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} size={11} className={i < Math.round(product.rating) ? "text-yellow-400 fill-yellow-400" : "text-gray-200 fill-gray-200"} />
          ))}
          <span className="text-[10px] text-gray-400 ml-1">({product.review_count ?? 0})</span>
        </div>
        <Link href={`/product/${product.id}`}>
          <p className="text-sm font-semibold text-gray-900 leading-tight hover:text-green-700 transition-colors">{product.name}</p>
        </Link>
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-baseline gap-1.5">
            <span className="font-bold text-gray-900">${price.toFixed(2)}</span>
            {onSale && <span className="text-xs text-gray-400 line-through">${product.price.toFixed(2)}</span>}
          </div>
          <button
            onClick={onAddToCart}
            className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold transition-all hover:opacity-90 active:scale-95"
            style={{ background: "var(--green-700)" }}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ShopPage() {
  return (
    <Suspense fallback={<StorefrontLayout><div className="h-64" /></StorefrontLayout>}>
      <ShopContent />
    </Suspense>
  );
}
