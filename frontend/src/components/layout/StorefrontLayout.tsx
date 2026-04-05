"use client";
import Link from "next/link";
import { useStore } from "@/store";
import { Search, ShoppingCart, User, ChevronDown } from "lucide-react";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { CartDrawer } from "@/components/shop/CartDrawer";
import { useRouter } from "next/navigation";

interface StorefrontLayoutProps {
  children: React.ReactNode;
  promoText?: string;
}

export function StorefrontLayout({ children, promoText = "Up to 20% OFF + free shipping with code SPRING20" }: StorefrontLayoutProps) {
  const store  = useStore();
  const router = useRouter();
  const cartCount = store.cart?.items?.length ?? 0;

  return (
    <div className="min-h-screen" style={{ background: "var(--cream)" }}>
      {/* ── Promo bar ──────────────────────────────────────────────────── */}
      <div className="text-center py-2 text-sm font-medium text-gray-700" style={{ background: "#e8f5ee" }}>
        {promoText}
      </div>

      {/* ── Top nav ────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-30">
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
            <button className="p-2 text-gray-600 hover:text-green-700 transition-colors">
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
            <button className="p-2 text-gray-600 hover:text-green-700 transition-colors">
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
            ].map(item => (
              <Link
                key={item.label}
                href={item.href}
                className="text-sm text-gray-600 hover:text-green-700 whitespace-nowrap transition-colors"
              >
                {item.label}
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
    </div>
  );
}
