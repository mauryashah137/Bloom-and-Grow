"use client";
import { useEffect } from "react";

const API = (process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080/ws")
  .replace(/^wss?:\/\//, "https://").replace("/ws", "");

export function CartClearer() {
  useEffect(() => {
    // Clear cart on page refresh/new session
    const hasSession = sessionStorage.getItem("bloom_session_active");
    if (!hasSession) {
      // First load or refresh — clear the cart
      sessionStorage.setItem("bloom_session_active", "true");
      fetch(`${API}/api/cart/demo_customer_001/clear`, { method: "POST" }).catch(() => {});
    }
  }, []);
  return null;
}
