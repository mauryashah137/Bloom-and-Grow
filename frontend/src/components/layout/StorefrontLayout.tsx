"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useStore } from "@/store";
import { Search, ShoppingCart, User, ChevronDown } from "lucide-react";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { CartDrawer } from "@/components/shop/CartDrawer";
import { SearchOverlay } from "@/components/shop/SearchOverlay";
import { useRouter } from "next/navigation";

interface StorefrontLayoutProps {
  children: React.ReactNode;
  promoText?: string;
}

const API = (process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080/ws")
  .replace(/^wss?:\/\//, "https://").replace("/ws", "");

export function StorefrontLayout({ children, promoText = "20% OFF with code SPRING20" }: StorefrontLayoutProps) {
  const store  = useStore();
  const router = useRouter();
  const cartCount = store.cart?.items?.length ?? 0;
  const [searchOpen, setSearchOpen] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState(0);

  // Poll for pending approvals every 5 seconds
  useEffect(() => {
    const check = () => {
      fetch(`${API}/api/manager/approvals`)
        .then(r => r.ok ? r.json() : { approvals: [] })
        .then(d => setPendingApprovals((d.approvals || []).filter((a: any) => a.status === "pending").length))
        .catch(() => {});
    };
    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, []);

  // Handle navigation requests from the chatbot — uses router.push (no page reload)
  useEffect(() => {
    if (store.pendingNavigation) {
      const route = store.pendingNavigation;
      store.setPendingNavigation(null);
      router.push(route);
    }
  }, [store.pendingNavigation, router, store]);

  return (
    <div className="min-h-screen" style={{ background: "var(--cream)" }}>
      {/* ── Promo bar ──────────────────────────────────────────────────── */}
      <div className={`text-center py-2 text-sm font-medium text-gray-700 transition-all duration-300 ${store.agentPanelOpen ? "mr-96" : ""}`} style={{ background: "#e8f5ee" }}>
        {promoText}
      </div>

      {/* ── Top nav ────────────────────────────────────────────────────── */}
      <header className={`bg-white border-b border-gray-100 sticky top-0 z-30 transition-all duration-300 ${store.agentPanelOpen ? "mr-96" : ""}`}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center gap-6">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "var(--green-600)" }}>
              <span className="text-white text-sm">🌿</span>
            </div>
          </Link>

          {/* Nav links */}
          <nav className="flex items-center gap-6 flex-1">
            <Link href="/" className="flex items-center gap-1 hover:text-green-700 transition-colors">
              <span className="text-sm font-medium text-gray-700">Shop</span>
              <ChevronDown size={14} className="text-gray-500" />
            </Link>
            <Link href="/shop?filter=sale" className="text-sm font-medium text-red-600 hover:text-red-700 transition-colors">Sale</Link>
            <Link href="/bundles" className="text-sm font-medium text-gray-700 hover:text-green-700 transition-colors">Bundles</Link>
            <Link href="/care" className="text-sm font-medium text-gray-700 hover:text-green-700 transition-colors">Plant Care</Link>
            <Link href="/services" className="text-sm font-medium text-gray-700 hover:text-green-700 transition-colors">Services</Link>
            <Link href="/support" className="text-sm font-medium text-gray-700 hover:text-green-700 transition-colors">Support</Link>
          </nav>

          {/* Right icons */}
          <div className="flex items-center gap-3">
            <button onClick={() => setSearchOpen(true)} className="p-2 text-gray-600 hover:text-green-700 transition-colors">
              <Search size={20} />
            </button>
            <button
              onClick={() => store.setShowCart(true)}
              className="relative p-2 text-gray-600 hover:text-green-700 transition-colors"
            >
              <ShoppingCart size={20} />
              {cartCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center"
                  style={{ background: "var(--green-600)" }}
                >
                  {cartCount}
                </span>
              )}
            </button>
            <button onClick={() => router.push("/profile")} className="p-2 text-gray-600 hover:text-green-700 transition-colors">
              <User size={20} />
            </button>
          </div>
        </div>

        {/* ── Category chips (from screenshots) */}
        <div className="border-t border-gray-50 bg-white">
          <div className="max-w-7xl mx-auto px-6 h-11 flex items-center gap-6 overflow-x-auto">
            {[
              { label: "House Plants", href: "/shop?category=plants" },
              { label: "Tools & Accessories", href: "/shop?category=tools" },
              { label: "Sale Items", href: "/shop?filter=sale" },
              { label: "Bundle Deals", href: "/bundles" },
              { label: "Plant Care", href: "/care" },
              { label: "Services", href: "/services" },
              { label: "Orders", href: "/orders" },
              { label: "Manager", href: "/manager", showDot: true },
            ].map((item: any) => (
              <Link
                key={item.label}
                href={item.href}
                className="relative text-sm text-gray-600 hover:text-green-700 whitespace-nowrap transition-colors"
              >
                {item.label}
                {item.showDot && pendingApprovals > 0 && (
                  <span className="absolute -top-1 -right-3 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {pendingApprovals}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      </header>

      {/* ── Page content (leaves room for agent panel) ─────────────────── */}
      <div className={`transition-all duration-300 ${store.agentPanelOpen ? "mr-96" : ""}`}>
        {children}
      </div>

      {/* ── Agent panel (fixed right sidebar) ─────────────────────────── */}
      <AgentPanel onNavigateProduct={(id) => router.push(`/product/${id}`)} />

      {/* ── Cart drawer ────────────────────────────────────────────────── */}
      {store.showCart && <CartDrawer onClose={() => store.setShowCart(false)} />}

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className={`border-t border-gray-200 bg-white transition-all duration-300 ${store.agentPanelOpen ? "mr-96" : ""}`}>
        <div className="max-w-7xl mx-auto px-6 py-10">
          <div className="grid grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "var(--green-600)" }}>
                  <span className="text-white text-xs">🌿</span>
                </div>
                <span className="font-semibold text-gray-900">Bloom & Grow</span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">Your garden, elevated. Premium plants, tools, and expert advice.</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Shop</h4>
              <div className="space-y-2">
                <Link href="/shop?category=plants" className="block text-xs text-gray-500 hover:text-green-700">Plants</Link>
                <Link href="/shop?category=tools" className="block text-xs text-gray-500 hover:text-green-700">Tools</Link>
                <Link href="/shop?filter=sale" className="block text-xs text-gray-500 hover:text-green-700">Sale</Link>
                <Link href="/bundles" className="block text-xs text-gray-500 hover:text-green-700">Bundles</Link>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Help</h4>
              <div className="space-y-2">
                <Link href="/care" className="block text-xs text-gray-500 hover:text-green-700">Plant Care</Link>
                <Link href="/services" className="block text-xs text-gray-500 hover:text-green-700">Services</Link>
                <Link href="/support" className="block text-xs text-gray-500 hover:text-green-700">Support</Link>
                <Link href="/orders" className="block text-xs text-gray-500 hover:text-green-700">Orders</Link>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Account</h4>
              <div className="space-y-2">
                <Link href="/profile" className="block text-xs text-gray-500 hover:text-green-700">Profile</Link>
                <Link href="/cart" className="block text-xs text-gray-500 hover:text-green-700">Cart</Link>
                <Link href="/checkout" className="block text-xs text-gray-500 hover:text-green-700">Checkout</Link>
                <Link href="/manager" className="block text-xs text-gray-500 hover:text-green-700">Manager</Link>
              </div>
            </div>
          </div>
          <div className="border-t border-gray-100 pt-6 flex items-center justify-between">
            <p className="text-xs text-gray-400">&copy; 2026 Bloom & Grow. All rights reserved.</p>
            <p className="text-xs text-gray-400">Made by <span className="font-medium text-gray-600">Maurya Shah</span></p>
          </div>
        </div>
      </footer>

      {/* ── Search overlay ─────────────────────────────────────────────── */}
      <SearchOverlay isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
