"use client";
import { useEffect, useRef } from "react";
import { useStore } from "@/store";

const API = (process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080/ws")
  .replace(/^wss?:\/\//, "https://").replace("/ws", "");

// Track if we've already cleared in this JS context (survives client-side nav, not refresh)
let hasCleared = false;

export function CartClearer() {
  const store = useStore();

  useEffect(() => {
    if (!hasCleared) {
      hasCleared = true;
      // Clear cart on backend
      fetch(`${API}/api/cart/${store.customerId}/clear`, { method: "POST" })
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (d?.cart) store.setCart(d.cart);
          else store.setCart(null as any);
        })
        .catch(() => {});
    }
  }, []);

  return null;
}
