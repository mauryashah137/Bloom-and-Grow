"use client";
import { useState, useEffect } from "react";
import { StorefrontLayout } from "@/components/layout/StorefrontLayout";
import type { Product } from "@/lib/types";
import Link from "next/link";
import { Droplets, Sun, Wind } from "lucide-react";

const API = (process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080/ws")
  .replace(/^wss?:\/\//, "https://").replace("/ws", "");

const CARE_ICONS: Record<string, React.ReactNode> = {
  watering: <Droplets size={18} className="text-blue-500" />,
  water: <Droplets size={18} className="text-blue-500" />,
  light: <Sun size={18} className="text-yellow-500" />,
  humidity: <Wind size={18} className="text-teal-500" />,
};

export default function CarePage() {
  const [plants, setPlants] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/products?limit=50`)
      .then(r => r.ok ? r.json() : { products: [] })
      .then(d => {
        const all: Product[] = d.products || [];
        setPlants(all.filter(p => p.care && Object.keys(p.care).length > 0));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <StorefrontLayout>
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="text-center mb-10">
          <h1
            className="text-3xl font-bold text-gray-900 mb-3"
            style={{ fontFamily: "'DM Serif Display', serif" }}
          >
            Plant Care Guides
          </h1>
          <p className="text-gray-500 max-w-xl mx-auto">
            Everything you need to keep your plants thriving. Browse care instructions for watering, light, humidity, and more.
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl h-72 animate-pulse" />
            ))}
          </div>
        ) : plants.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg">No plant care guides available yet.</p>
            <Link href="/shop" className="text-green-700 underline mt-2 inline-block">Browse our shop</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {plants.map(plant => (
              <Link
                key={plant.id}
                href={`/product/${plant.id}`}
                className="bg-white rounded-2xl overflow-hidden hover:shadow-lg transition-all hover:-translate-y-0.5 group"
              >
                {/* Header */}
                <div
                  className="h-36 flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, #d4edda 0%, #a8d5b5 100%)" }}
                >
                  <span className="text-5xl group-hover:scale-110 transition-transform duration-300">🌿</span>
                </div>

                {/* Content */}
                <div className="p-5 space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 group-hover:text-green-700 transition-colors">
                      {plant.name}
                    </h2>
                    {plant.description && (
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">{plant.description}</p>
                    )}
                  </div>

                  {/* Care details */}
                  <div className="space-y-2.5">
                    {Object.entries(plant.care!).map(([key, value]) => (
                      <div key={key} className="flex items-center gap-3 bg-green-50 rounded-lg px-3 py-2">
                        <div className="shrink-0">
                          {CARE_ICONS[key.toLowerCase()] || <Sun size={18} className="text-gray-400" />}
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 capitalize font-medium">{key}</p>
                          <p className="text-sm text-gray-800">{value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </StorefrontLayout>
  );
}
