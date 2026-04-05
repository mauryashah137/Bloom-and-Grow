"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Search, X, Star } from "lucide-react";
import Link from "next/link";

const API = (process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080/ws")
  .replace(/^wss?:\/\//, "https://").replace("/ws", "");

interface SearchProduct {
  id: string;
  name: string;
  price: number;
  sale_price?: number | null;
  category: string;
  rating: number;
  review_count?: number;
  description?: string;
  image_url?: string;
}

const CATEGORY_EMOJI: Record<string, string> = {
  plants: "🌿", soil: "🌍", fertilizers: "🌸", pots: "🏺",
  tools: "🔧", lighting: "💡", accessories: "✨", bundles: "🎁",
  "pest-control": "🛡️", decor: "🎍",
};

interface SearchResponse {
  products: SearchProduct[];
  similar?: boolean;
  query?: string;
}

export function SearchOverlay({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchProduct[]>([]);
  const [isSimilar, setIsSimilar] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-focus when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery("");
      setResults([]);
      setIsSimilar(false);
      setSearched(false);
    }
  }, [isOpen]);

  // Escape key handler
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleKey);
      return () => document.removeEventListener("keydown", handleKey);
    }
  }, [isOpen, onClose]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setIsSimilar(false);
      setSearched(false);
      return;
    }
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`${API}/api/search?q=${encodeURIComponent(q)}`);
      const data: SearchResponse = await res.json();
      setResults(data.products || []);
      setIsSimilar(!!data.similar);
    } catch {
      setResults([]);
      setIsSimilar(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 300);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Content */}
      <div className="relative z-10 w-full max-w-3xl mx-auto mt-20 bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[70vh] flex flex-col">
        {/* Search input */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <Search size={20} className="text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleChange}
            placeholder="Search for plants, tools, accessories..."
            className="flex-1 text-lg outline-none placeholder-gray-400 bg-transparent"
          />
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Results area */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="text-center py-8 text-gray-500">Searching...</div>
          )}

          {!loading && searched && isSimilar && results.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
              <p className="text-sm text-amber-800 font-medium">We don&apos;t carry &quot;{query}&quot; specifically</p>
              <p className="text-xs text-amber-600 mt-0.5">Here are similar products you might like:</p>
            </div>
          )}

          {!loading && searched && results.length === 0 && (
            <div className="text-center py-12">
              <div className="text-5xl mb-3">🔍</div>
              <p className="text-gray-700 font-medium">No products found for &quot;{query}&quot;</p>
              <p className="text-gray-400 text-sm mt-1">Try searching for: plants, soil, tools, pots, fertilizer</p>
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {results.map((product) => {
                const emoji = CATEGORY_EMOJI[product.category] || "🌱";
                const displayPrice = product.sale_price ?? product.price;
                const onSale = product.sale_price != null;
                return (
                  <Link
                    key={product.id}
                    href={`/product/${product.id}`}
                    onClick={onClose}
                    className="flex gap-3 p-4 rounded-xl border border-gray-100 hover:border-green-200 hover:bg-green-50/30 transition-all group"
                  >
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0 overflow-hidden" style={{ background: "var(--cream-100)" }}>
                      {product.image_url?.startsWith("http") ? (
                        <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-2xl">{emoji}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 group-hover:text-green-800 text-sm leading-tight">
                        {product.name}
                      </h3>
                      <p className="text-[10px] text-gray-400 mt-0.5 capitalize">{product.category}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="font-bold text-sm" style={{ color: "var(--green-700)" }}>
                          ${displayPrice.toFixed(2)}
                        </span>
                        {onSale && (
                          <span className="text-xs text-gray-400 line-through">${product.price.toFixed(2)}</span>
                        )}
                        {product.rating > 0 && (
                          <span className="flex items-center gap-0.5 text-[10px] text-amber-600">
                            <Star size={10} fill="currentColor" />
                            {product.rating.toFixed(1)}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {!loading && !searched && (
            <div className="text-center py-12 text-gray-400">
              <div className="text-5xl mb-3">🌱</div>
              <p className="text-gray-500">Search for plants, tools, soil, pots & more</p>
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                {["Monstera", "Pothos", "Soil", "Fertilizer", "Tools", "Pots"].map(s => (
                  <button key={s} onClick={() => { setQuery(s); doSearch(s); }}
                    className="px-3 py-1.5 rounded-full bg-gray-100 text-xs text-gray-600 hover:bg-green-50 hover:text-green-700 transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
