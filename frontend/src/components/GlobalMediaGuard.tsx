"use client";
import { useEffect } from "react";
import { useStore } from "@/store";
import { killAllMedia } from "@/hooks/useGeminiSession";

/**
 * Global media guard — runs at the app root level.
 * Subscribes to store changes and kills all media when panel closes/minimizes.
 * This works regardless of which page the user is on.
 */
export function GlobalMediaGuard() {
  useEffect(() => {
    const unsub = useStore.subscribe((state, prev) => {
      // Panel closed
      if (prev.agentPanelOpen && !state.agentPanelOpen) {
        killAllMedia();
      }
      // Panel minimized
      if (!prev.agentPanelMinimized && state.agentPanelMinimized) {
        killAllMedia();
      }
    });
    return () => unsub();
  }, []);

  return null;
}
