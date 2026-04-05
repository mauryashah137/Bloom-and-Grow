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
  category: string;
  rating: number;
  image_url?: string;
}

interface SearchResponse {
  results: SearchProduct[];
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
      setResults(data.results || []);
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
            <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-4 py-2 mb-4">
              Showing similar products for &apos;{query}&apos;
            </p>
          )}

          {!loading && searched && results.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <Search size={40} className="mx-auto mb-3 text-gray-300" />
              <p>No products found. Try a different search term.</p>
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {results.map((product) => (
                <Link
                  key={product.id}
                  href={`/product/${product.id}`}
                  onClick={onClose}
                  className="flex gap-4 p-4 rounded-xl border border-gray-100 hover:border-green-200 hover:bg-green-50/30 transition-all group"
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 group-hover:text-green-800 truncate">
                      {product.name}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">{product.category}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="font-semibold" style={{ color: "var(--green-700)" }}>
                        ${product.price.toFixed(2)}
                      </span>
                      {product.rating > 0 && (
                        <span className="flex items-center gap-0.5 text-xs text-amber-600">
                          <Star size={12} fill="currentColor" />
                          {product.rating.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {!loading && !searched && (
            <div className="text-center py-12 text-gray-400">
              <Search size={40} className="mx-auto mb-3 text-gray-200" />
              <p>Start typing to search products</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
