"use client";
import { useEffect, useState } from "react";
import { StorefrontLayout } from "@/components/layout/StorefrontLayout";
import { useStore } from "@/store";
import { Package, ShoppingCart, Calendar, LogOut, Crown, Award, Star } from "lucide-react";

const API = (process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080/ws")
  .replace(/^wss?:\/\//, "https://").replace("/ws", "");

interface UserData {
  customer_id: string;
  name: string;
  email: string;
  phone?: string;
  loyalty_tier?: string;
  loyalty_points?: number;
  member_since?: string;
  orders?: Array<{
    order_id: string;
    status: string;
    items: Array<{ name: string; quantity: number }>;
    total: number;
    created_at?: string;
  }>;
  cart?: {
    items: Array<{ name: string; quantity: number; price: number }>;
    subtotal: number;
  };
  bookings?: Array<{
    booking_id: string;
    service: string;
    date: string;
    status: string;
  }>;
}

const TIER_COLORS: Record<string, string> = {
  gold: "bg-amber-100 text-amber-800",
  silver: "bg-gray-100 text-gray-700",
  platinum: "bg-purple-100 text-purple-800",
  bronze: "bg-orange-100 text-orange-800",
};

const TIER_ICONS: Record<string, typeof Crown> = {
  gold: Crown,
  platinum: Crown,
  silver: Award,
  bronze: Star,
};

export default function ProfilePage() {
  const [authState, setAuthState] = useState<"logged_out" | "logged_in">("logged_out");
  const [activeTab, setActiveTab] = useState<"signin" | "register">("signin");
  const [user, setUser] = useState<UserData | null>(null);
  const [profile, setProfile] = useState<UserData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const store = useStore();

  // Form fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  // Check localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("bloom_user");
      if (saved) {
        const parsed = JSON.parse(saved);
        setUser(parsed);
        setAuthState("logged_in");
      }
    } catch {
      // ignore
    }
  }, []);

  // Fetch profile when logged in
  useEffect(() => {
    if (authState === "logged_in" && user?.customer_id) {
      fetch(`${API}/api/auth/profile/${user.customer_id}`)
        .then((r) => r.json())
        .then((data) => setProfile(data))
        .catch(() => {});
    }
  }, [authState, user?.customer_id]);

  const handleSignIn = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || data.message || "Sign in failed");
        return;
      }
      localStorage.setItem("bloom_user", JSON.stringify(data));
      setUser(data);
      setAuthState("logged_in");
      setEmail("");
      setPassword("");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    setError("");
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, phone: phone || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || data.message || "Registration failed");
        return;
      }
      localStorage.setItem("bloom_user", JSON.stringify(data));
      setUser(data);
      setAuthState("logged_in");
      setName("");
      setEmail("");
      setPassword("");
      setPhone("");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem("bloom_user");
    setUser(null);
    setProfile(null);
    setAuthState("logged_out");
  };

  const displayData = profile || user;
  const tierKey = (displayData?.loyalty_tier || "").toLowerCase();
  const TierIcon = TIER_ICONS[tierKey] || Star;

  return (
    <StorefrontLayout>
      <div className="max-w-3xl mx-auto px-6 py-10">
        {authState === "logged_out" ? (
          /* ── Auth forms ──────────────────────────────────── */
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-gray-100">
              <button
                onClick={() => { setActiveTab("signin"); setError(""); }}
                className={`flex-1 py-4 text-sm font-medium transition-colors ${
                  activeTab === "signin"
                    ? "border-b-2 text-green-800"
                    : "text-gray-500 hover:text-gray-700"
                }`}
                style={activeTab === "signin" ? { borderColor: "var(--green-700)" } : {}}
              >
                Sign In
              </button>
              <button
                onClick={() => { setActiveTab("register"); setError(""); }}
                className={`flex-1 py-4 text-sm font-medium transition-colors ${
                  activeTab === "register"
                    ? "border-b-2 text-green-800"
                    : "text-gray-500 hover:text-gray-700"
                }`}
                style={activeTab === "register" ? { borderColor: "var(--green-700)" } : {}}
              >
                Register
              </button>
            </div>

            <div className="p-8">
              {error && (
                <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 text-red-700 text-sm">
                  {error}
                </div>
              )}

              {activeTab === "signin" ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-200 focus:border-green-400 transition"
                      placeholder="you@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-200 focus:border-green-400 transition"
                      placeholder="Enter your password"
                      onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
                    />
                  </div>
                  <button
                    onClick={handleSignIn}
                    disabled={loading}
                    className="w-full py-3 rounded-lg text-white font-medium transition-opacity disabled:opacity-50"
                    style={{ background: "var(--green-700)" }}
                  >
                    {loading ? "Signing in..." : "Sign In"}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-200 focus:border-green-400 transition"
                      placeholder="Your full name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-200 focus:border-green-400 transition"
                      placeholder="you@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-200 focus:border-green-400 transition"
                      placeholder="Min 6 characters"
                    />
                    <p className="text-xs text-gray-400 mt-1">Min 6 characters</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone <span className="text-gray-400">(optional)</span></label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-200 focus:border-green-400 transition"
                      placeholder="+1 (555) 000-0000"
                    />
                  </div>
                  <button
                    onClick={handleRegister}
                    disabled={loading}
                    className="w-full py-3 rounded-lg text-white font-medium transition-opacity disabled:opacity-50"
                    style={{ background: "var(--green-700)" }}
                  >
                    {loading ? "Creating account..." : "Create Account"}
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── Profile dashboard ───────────────────────────── */
          <div className="space-y-6">
            {/* Welcome header */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h1 className="text-2xl font-bold" style={{ color: "var(--green-900)" }}>
                      Welcome, {displayData?.name || "User"}
                    </h1>
                    {displayData?.loyalty_tier && (
                      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${TIER_COLORS[tierKey] || "bg-green-100 text-green-800"}`}>
                        <TierIcon size={12} />
                        {displayData.loyalty_tier}
                      </span>
                    )}
                  </div>
                  {displayData?.member_since && (
                    <p className="text-sm text-gray-500">
                      Member since {new Date(displayData.member_since).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                    </p>
                  )}
                  {displayData?.loyalty_points !== undefined && (
                    <p className="text-sm mt-1" style={{ color: "var(--green-700)" }}>
                      {displayData.loyalty_points.toLocaleString()} loyalty points
                    </p>
                  )}
                </div>
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 border border-gray-200 transition-colors"
                >
                  <LogOut size={16} />
                  Sign Out
                </button>
              </div>
            </div>

            {/* Orders */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold mb-4" style={{ color: "var(--green-900)" }}>
                <Package size={20} />
                Your Orders
              </h2>
              {(displayData?.orders?.length ?? 0) > 0 ? (
                <div className="space-y-3">
                  {displayData!.orders!.map((order) => (
                    <div key={order.order_id} className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-gray-100">
                      <div>
                        <p className="font-medium text-gray-900 text-sm">Order #{order.order_id}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {order.items.map((i) => `${i.name} x${i.quantity}`).join(", ")}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          order.status === "delivered" ? "bg-green-100 text-green-700" :
                          order.status === "shipped" ? "bg-blue-100 text-blue-700" :
                          order.status === "cancelled" ? "bg-red-100 text-red-700" :
                          "bg-amber-100 text-amber-700"
                        }`}>
                          {order.status}
                        </span>
                        <p className="text-sm font-semibold mt-1" style={{ color: "var(--green-700)" }}>
                          ${order.total.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 text-sm py-4 text-center">No orders yet</p>
              )}
            </div>

            {/* Cart */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold mb-4" style={{ color: "var(--green-900)" }}>
                <ShoppingCart size={20} />
                Your Cart
              </h2>
              {(displayData?.cart?.items?.length ?? 0) > 0 ? (
                <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-gray-100">
                  <p className="text-sm text-gray-700">
                    {displayData!.cart!.items.length} item{displayData!.cart!.items.length !== 1 ? "s" : ""} in cart
                  </p>
                  <p className="text-sm font-semibold" style={{ color: "var(--green-700)" }}>
                    Subtotal: ${displayData!.cart!.subtotal.toFixed(2)}
                  </p>
                </div>
              ) : (
                <p className="text-gray-400 text-sm py-4 text-center">Cart is empty</p>
              )}
            </div>

            {/* Bookings */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold mb-4" style={{ color: "var(--green-900)" }}>
                <Calendar size={20} />
                Your Bookings
              </h2>
              {(displayData?.bookings?.length ?? 0) > 0 ? (
                <div className="space-y-3">
                  {displayData!.bookings!.map((booking) => (
                    <div key={booking.booking_id} className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-gray-100">
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{booking.service}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {new Date(booking.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        </p>
                      </div>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        booking.status === "confirmed" ? "bg-green-100 text-green-700" :
                        booking.status === "cancelled" ? "bg-red-100 text-red-700" :
                        "bg-amber-100 text-amber-700"
                      }`}>
                        {booking.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 text-sm py-4 text-center">No bookings yet</p>
              )}
            </div>
          </div>
        )}
      </div>
    </StorefrontLayout>
  );
}
