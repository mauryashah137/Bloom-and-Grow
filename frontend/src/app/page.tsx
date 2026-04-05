"use client";
import { StorefrontLayout } from "@/components/layout/StorefrontLayout";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

const CATEGORIES = [
  {
    name: "Tools\nand accessories",
    href: "/shop?category=tools",
    image: "🌿",
    image_url: "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=600&h=400&fit=crop",
    bg: "bg-green-800",
    imgStyle: { background: "linear-gradient(135deg, #2d5a35 0%, #1a3c2b 100%)" },
  },
  {
    name: "Plants\nand supplies",
    href: "/shop?category=plants",
    image: "🪴",
    image_url: "https://images.unsplash.com/photo-1463320726281-696a485928c7?w=600&h=400&fit=crop",
    bg: "bg-stone-100",
    imgStyle: { background: "linear-gradient(135deg, #f5f0e8 0%, #e8dcc8 100%)" },
  },
  {
    name: "Plant care\nand maintenance",
    href: "/care",
    image: "🌱",
    image_url: "https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?w=600&h=400&fit=crop",
    bg: "bg-green-100",
    imgStyle: { background: "linear-gradient(135deg, #d4edda 0%, #a8d5b5 100%)" },
  },
  {
    name: "Landscaping\nservices",
    href: "/services",
    image: "🏡",
    image_url: "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=600&h=400&fit=crop",
    bg: "bg-stone-200",
    imgStyle: { background: "linear-gradient(135deg, #e8e0d0 0%, #d4c8b0 100%)" },
  },
];

const FEATURED_PRODUCTS = [
  { id: "P006", name: "Bloom Booster Potting Mix", price: 15.99, unit: "1 cubic foot", rating: 5, reviews: "1k", image: "🌿", image_url: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400&h=400&fit=crop", category: "soil" },
  { id: "P008", name: "Flower Power Fertilizer",   price: 22.98, unit: "0.75 cubic feet", rating: 5, reviews: "1k", image: "🌸", image_url: "https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?w=400&h=400&fit=crop", category: "fertilizers" },
  { id: "P003", name: "Budget Bloom Mix",           price: 9.99,  unit: "0.5 cubic feet", rating: 4, reviews: "890", image: "🌻", image_url: "https://images.unsplash.com/photo-1572688484438-313a56e6dc34?w=400&h=400&fit=crop", category: "soil" },
  { id: "P002", name: "Bloom & Grow Soil",          price: 18.99, unit: "1 cubic foot",   rating: 5, reviews: "1.2k", image: "🪴", image_url: "https://images.unsplash.com/photo-1459411552884-841db9b3cc2a?w=400&h=400&fit=crop", category: "soil" },
];

export default function HomePage() {
  return (
    <StorefrontLayout>
      <main className="max-w-7xl mx-auto px-6 pb-16">

        {/* ── Hero: Celebrate spring ──────────────────────────────────── */}
        <section className="py-12">
          <h1
            className="text-4xl font-bold text-center mb-8"
            style={{ fontFamily: "'DM Serif Display', serif", color: "var(--text-dark)" }}
          >
            Celebrate spring with 20% off
          </h1>

          {/* Category cards grid — exactly like screenshots */}
          <div className="grid grid-cols-4 gap-4">
            {CATEGORIES.map((cat) => (
              <Link
                key={cat.name}
                href={cat.href}
                className="group block rounded-2xl overflow-hidden hover:shadow-lg transition-all hover:-translate-y-0.5"
              >
                {/* Image area */}
                <div
                  className="relative h-52 flex items-center justify-center overflow-hidden"
                  style={cat.imgStyle}
                >
                  {cat.image_url ? (
                    <img src={cat.image_url} alt={cat.name.replace("\n", " ")} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <span className="text-6xl group-hover:scale-110 transition-transform duration-300">
                      {cat.image}
                    </span>
                  )}
                </div>
                {/* Label */}
                <div className="bg-white px-4 py-3 flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-800 whitespace-pre-line leading-snug">{cat.name}</p>
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                    style={{ border: "1.5px solid var(--text-dark)" }}
                  >
                    <ArrowRight size={14} className="text-gray-800" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Shop our products ──────────────────────────────────────── */}
        <section>
          <div
            className="rounded-3xl p-8"
            style={{ background: "var(--cream-100)" }}
          >
            <h2
              className="text-2xl font-bold text-center mb-6"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              Shop our products
            </h2>

            {/* Category pills */}
            <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
              {["House plants", "Seeds + Bulbs", "Garden tools", "Best Sellers"].map((c, i) => (
                <Link
                  key={c}
                  href={`/shop?filter=${encodeURIComponent(c)}`}
                  className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                    i === 0
                      ? "text-white"
                      : "bg-white border border-gray-200 text-gray-700 hover:border-green-400"
                  }`}
                  style={i === 0 ? { background: "var(--green-900)" } : {}}
                >
                  {c}
                </Link>
              ))}
            </div>

            {/* Product grid */}
            <div className="grid grid-cols-4 gap-4">
              {FEATURED_PRODUCTS.map((p) => (
                <ProductTile key={p.id} product={p} />
              ))}
            </div>

            <div className="text-center mt-6">
              <Link
                href="/shop"
                className="inline-flex items-center gap-2 px-8 py-3 rounded-full border-2 text-sm font-semibold transition-colors hover:bg-green-50"
                style={{ borderColor: "var(--green-700)", color: "var(--green-700)" }}
              >
                View all products
                <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </section>
      </main>
    </StorefrontLayout>
  );
}

function ProductTile({ product }: { product: typeof FEATURED_PRODUCTS[0] }) {
  return (
    <Link
      href={`/product/${product.id}`}
      className="group bg-white rounded-2xl overflow-hidden hover:shadow-md transition-all hover:-translate-y-0.5"
    >
      <div className="h-40 flex items-center justify-center overflow-hidden" style={{ background: "var(--cream-100)" }}>
        {product.image_url?.startsWith("http") ? (
          <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <span className="text-5xl group-hover:scale-110 transition-transform duration-300">{product.image}</span>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-center gap-1 mb-1">
          {Array.from({ length: Math.round(product.rating) }).map((_, i) => (
            <span key={i} className="text-yellow-400 text-xs">★</span>
          ))}
          <span className="text-xs text-gray-400 ml-1">({product.reviews} reviews)</span>
        </div>
        <p className="font-medium text-gray-900 text-sm leading-tight">{product.name}</p>
        <p className="text-xs text-gray-400 mt-0.5">{product.unit}</p>
        <p className="font-bold text-gray-900 mt-2">${product.price.toFixed(2)}/each</p>
      </div>
    </Link>
  );
}
