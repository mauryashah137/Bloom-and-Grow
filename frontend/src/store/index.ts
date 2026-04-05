import { create } from "zustand";
import type {
  Cart, CartItem, Product, TranscriptEntry, AgentActionCard,
  VisionResultEvent, DiscountRequest, Sentiment, CustomerProfile, Order, Booking,
} from "@/lib/types";

// Re-export types for backwards compatibility
export type { Cart, CartItem, Product, TranscriptEntry, AgentActionCard, Sentiment, DiscountRequest };

export type SessionStatus = "idle" | "connecting" | "connected" | "error";

interface AppState {
  // Session
  sessionStatus: SessionStatus;
  sessionId: string | null;
  sentiment: Sentiment;
  agentSpeaking: boolean;
  isMicActive: boolean;
  isCameraActive: boolean;
  sessionError: string | null;
  agentMode: "shop" | "support";
  customer: CustomerProfile | null;

  // Conversation
  transcript: TranscriptEntry[];
  actionCards: AgentActionCard[];

  // Commerce
  cart: Cart | null;
  recommendations: Product[];
  visionResult: VisionResultEvent | null;
  discountRequest: DiscountRequest | null;
  orders: Order[];
  lastOrder: Order | null;
  lastBooking: Booking | null;

  // UI state
  agentPanelOpen: boolean;
  agentPanelMinimized: boolean;
  showCart: boolean;
  showTranscript: boolean;
  customerId: string;

  // Actions
  setSessionStatus: (s: SessionStatus) => void;
  setSessionId: (id: string | null) => void;
  setSentiment: (s: Sentiment) => void;
  setAgentSpeaking: (b: boolean) => void;
  setMicActive: (b: boolean) => void;
  setCameraActive: (b: boolean) => void;
  setSessionError: (e: string | null) => void;
  setAgentMode: (m: "shop" | "support") => void;
  setCustomer: (c: CustomerProfile) => void;
  addTranscript: (e: TranscriptEntry) => void;
  addActionCard: (card: AgentActionCard) => void;
  clearActionCards: () => void;
  removeActionCard: (id: string) => void;
  setCart: (c: Cart) => void;
  setRecommendations: (p: Product[]) => void;
  setVisionResult: (v: VisionResultEvent | null) => void;
  setDiscountRequest: (d: DiscountRequest | null) => void;
  setLastOrder: (o: Order | null) => void;
  setLastBooking: (b: Booking | null) => void;
  addOrder: (o: Order) => void;
  setAgentPanelOpen: (b: boolean) => void;
  setAgentPanelMinimized: (b: boolean) => void;
  setShowCart: (b: boolean) => void;
  setShowTranscript: (b: boolean) => void;
  pendingNavigation: string | null;
  setPendingNavigation: (route: string | null) => void;
  resetSession: () => void;
}

export const useStore = create<AppState>((set) => ({
  sessionStatus: "idle",
  sessionId: null,
  sentiment: "neutral",
  agentSpeaking: false,
  isMicActive: false,
  isCameraActive: false,
  sessionError: null,
  agentMode: "shop",
  customer: null,
  transcript: [],
  actionCards: [],
  cart: null,
  recommendations: [],
  visionResult: null,
  discountRequest: null,
  orders: [],
  lastOrder: null,
  lastBooking: null,
  agentPanelOpen: false,
  agentPanelMinimized: false,
  showCart: false,
  showTranscript: false,
  pendingNavigation: null,
  customerId: "demo_customer_001",

  setSessionStatus:       (sessionStatus) => set({ sessionStatus }),
  setSessionId:           (sessionId) => set({ sessionId }),
  setSentiment:           (sentiment) => set({ sentiment }),
  setAgentSpeaking:       (agentSpeaking) => set({ agentSpeaking }),
  setMicActive:           (isMicActive) => set({ isMicActive }),
  setCameraActive:        (isCameraActive) => set({ isCameraActive }),
  setSessionError:        (sessionError) => set({ sessionError }),
  setAgentMode:           (agentMode) => set({ agentMode }),
  setCustomer:            (customer) => set({ customer }),
  setCart:                (cart) => set({ cart }),
  setRecommendations:     (recommendations) => set({ recommendations }),
  setVisionResult:        (visionResult) => set({ visionResult }),
  setDiscountRequest:     (discountRequest) => set({ discountRequest }),
  setLastOrder:           (lastOrder) => set({ lastOrder }),
  setLastBooking:         (lastBooking) => set({ lastBooking }),
  setAgentPanelOpen:      (agentPanelOpen) => set({ agentPanelOpen }),
  setAgentPanelMinimized: (agentPanelMinimized) => set({ agentPanelMinimized }),
  setShowCart:            (showCart) => set({ showCart }),
  setShowTranscript:      (showTranscript) => set({ showTranscript }),
  setPendingNavigation:   (pendingNavigation) => set({ pendingNavigation }),

  addTranscript:     (e) => set((s) => ({ transcript: [...s.transcript, e] })),
  addActionCard:     (card) => set((s) => ({ actionCards: [...s.actionCards, card] })),
  clearActionCards:  () => set({ actionCards: [] }),
  removeActionCard:  (id) => set((s) => ({ actionCards: s.actionCards.filter(c => c.id !== id) })),
  addOrder:          (o) => set((s) => ({ orders: [o, ...s.orders], lastOrder: o })),

  resetSession: () => set({
    sessionStatus: "idle",
    sessionId: null,
    transcript: [],
    actionCards: [],
    agentSpeaking: false,
    isMicActive: false,
    isCameraActive: false,
    sessionError: null,
    recommendations: [],
    visionResult: null,
    discountRequest: null,
  }),
}));
