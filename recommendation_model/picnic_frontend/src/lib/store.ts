import { create } from "zustand";
import * as api from "./api";
import type { ApiCartItem, ApiHouseholdMember, RecommendationItem } from "./api";

// ── Category → emoji mapping (DB products don't have emojis) ──
const CATEGORY_EMOJI: Record<string, string> = {
  dairy: "🥛",
  dairy_alt: "🥛",
  bakery: "🍞",
  fresh: "🥬",
  frozen: "🧊",
  meat: "🥩",
  protein: "🥚",
  seafood: "🐟",
  beverages: "☕",
  snacks: "🍪",
  dry_food: "🍝",
};

function emojiForCategory(category: string): string {
  return CATEGORY_EMOJI[category] ?? "🛒";
}

// ── Public types (unchanged interface for components) ──
export interface Product {
  id: string; // sku
  name: string;
  emoji: string;
  category: string;
  price: number;
}

export interface HouseholdUser {
  id: string;
  name: string;
  initials: string;
  color: string;
}

export interface CartItem {
  id: string;
  product: Product;
  quantity: number;
  addedBy: HouseholdUser;
  addedAt: number;
}

// ── Helpers ──
function toProduct(p: { sku: string; name: string; category: string; price: number }): Product {
  return {
    id: p.sku,
    name: p.name,
    emoji: emojiForCategory(p.category),
    category: p.category,
    price: typeof p.price === "number" ? p.price : parseFloat(String(p.price)),
  };
}

function toUser(m: ApiHouseholdMember): HouseholdUser {
  return {
    id: m.customer_id,
    name: m.name,
    initials: m.name.charAt(0).toUpperCase(),
    color: m.color,
  };
}

function apiItemToCartItem(item: ApiCartItem): CartItem {
  return {
    id: item.id,
    product: {
      id: item.sku,
      name: item.name,
      emoji: emojiForCategory(item.category),
      category: item.category,
      price: typeof item.price === "number" ? item.price : parseFloat(String(item.price)),
    },
    quantity: item.quantity,
    addedBy: {
      id: item.added_by,
      name: item.added_by_name,
      initials: item.added_by_name.charAt(0).toUpperCase(),
      color: item.added_by_color ?? "#8e8e93",
    },
    addedAt: new Date(item.added_at).getTime(),
  };
}

// ── Store ──
interface PicnicStore {
  // Auth
  isLoggedIn: boolean;
  currentUser: HouseholdUser;
  availableCustomers: Array<{ id: string; name: string; dietary_preference: string }>;
  loadCustomers: () => Promise<void>;
  login: (customerId: string, displayName?: string, color?: string) => Promise<void>;
  logout: () => void;

  // Cart
  cartItems: CartItem[];
  addItem: (productId: string, quantity?: number) => Promise<void>;
  removeItem: (sku: string) => Promise<void>;
  updateQuantity: (sku: string, delta: number) => void;
  refreshCart: () => Promise<void>;

  // Item history tracking (for cart page indicators)
  itemHistory: Record<string, { hasHistory: boolean; reason: string }>;
  setItemHistory: (sku: string, hasHistory: boolean, reason: string) => void;

  // Household
  sharedCartActive: boolean;
  householdId: string | null;
  householdMembers: HouseholdUser[];
  shareCode: string;
  toggleSharedCart: () => void;
  createHousehold: () => Promise<void>;
  joinHousehold: (code: string) => Promise<void>;

  // Order
  orderDay: string;

  // Widget
  searchProducts: (query: string) => Product[];
  searchResults: Product[];
  doSearch: (query: string) => Promise<void>;

  // Recommendations
  outOfStockItems: RecommendationItem[];
  recommendationSummary: string | null;
  recommendationBasketId: string | null;
  recommendationsLoading: boolean;
  loadRecommendations: (customerId: string) => Promise<void>;
  addSubstitute: (sku: string, quantity?: number) => Promise<void>;

  // Navigation
  requestOpenCart: number;
  openCart: () => void;

  // Adders
  recentAdders: () => HouseholdUser[];

  // WebSocket
  _ws: WebSocket | null;
  _connectWs: () => void;
}

const DEFAULT_USER: HouseholdUser = {
  id: "",
  name: "",
  initials: "",
  color: "#8e8e93",
};

export const usePicnicStore = create<PicnicStore>((set, get) => ({
  isLoggedIn: false,
  currentUser: DEFAULT_USER,
  availableCustomers: [],

  loadCustomers: async () => {
    try {
      const customers = await api.listCustomers();
      set({ availableCustomers: customers });
    } catch {
      // offline fallback — keep empty
    }
  },

  login: async (customerId: string, displayName?: string, color?: string) => {
    try {
      const resp = await api.login(customerId, displayName);
      const customer = resp.customer;

      const name = displayName ?? customer.name;
      const user: HouseholdUser = {
        id: customer.id,
        name,
        initials: name.charAt(0).toUpperCase(),
        color: color ?? "#E1002A",
      };

      set({ isLoggedIn: true, currentUser: user });

      if (resp.household) {
        // Already in a household — load it
        const hh = await api.getHousehold(resp.household.household_id);
        set({
          householdId: hh.id,
          shareCode: hh.share_code,
          sharedCartActive: true,
          householdMembers: hh.members.map(toUser),
          currentUser: {
            ...user,
            color: resp.household.color,
          },
        });
        get()._connectWs();
      } else {
        // No household yet — auto-create one
        await get().createHousehold();
      }

      // Clear any leftover cart from a previous session, then seed fresh
      const { householdId } = get();
      if (householdId) await api.clearCart(householdId).catch(() => {});

      // Load AI recommendations in the background (non-blocking)
      get().loadRecommendations(customerId);
    } catch (e) {
      console.error("Login failed:", e);
    }
  },

  logout: () => {
    const ws = get()._ws;
    if (ws) ws.close();
    set({
      isLoggedIn: false,
      currentUser: DEFAULT_USER,
      cartItems: [],
      householdId: null,
      householdMembers: [],
      shareCode: "",
      sharedCartActive: false,
      _ws: null,
      outOfStockItems: [],
      recommendationSummary: null,
      recommendationBasketId: null,
    });
  },

  itemHistory: {},
  setItemHistory: (sku, hasHistory, reason) =>
    set((state) => ({
      itemHistory: { ...state.itemHistory, [sku]: { hasHistory, reason } },
    })),

  outOfStockItems: [],
  recommendationSummary: null,
  recommendationBasketId: null,
  recommendationsLoading: false,

  loadRecommendations: async (customerId: string) => {
    set({ recommendationsLoading: true });
    try {
      let basket = await api.getRecommendations(customerId).catch(() => null);
      if (!basket) {
        await api.generateRecommendations(customerId);
        basket = await api.getRecommendations(customerId).catch(() => null);
      }
      if (basket) {
        set({
          outOfStockItems: basket.items.filter((i) => i.out_of_stock),
          recommendationSummary: basket.basket_summary,
          recommendationBasketId: basket.basket_id,
        });
        // Auto-add in-stock recommended items to the (freshly cleared) cart
        for (const item of basket.items.filter((i) => !i.out_of_stock)) {
          await get().addItem(item.sku, item.quantity);
        }
      }
    } catch {
      // Recommendation service unavailable — silently ignore
    } finally {
      set({ recommendationsLoading: false });
    }
  },

  addSubstitute: async (sku: string, quantity = 1) => {
    await get().addItem(sku, quantity);
    set((state) => ({
      outOfStockItems: state.outOfStockItems.filter((i) => i.substitute_sku !== sku),
    }));
  },

  requestOpenCart: 0,
  openCart: () => set({ requestOpenCart: Date.now() }),

  cartItems: [],

  addItem: async (sku: string, quantity = 1) => {
    const { householdId, currentUser } = get();
    if (!householdId) return;
    try {
      await api.addCartItem(householdId, sku, quantity, currentUser.id);
      await get().refreshCart();
    } catch (e) {
      console.error("Add item failed:", e);
    }
  },

  removeItem: async (sku: string) => {
    const { householdId } = get();
    if (!householdId) return;
    try {
      await api.removeCartItem(householdId, sku);
      await get().refreshCart();
    } catch (e) {
      console.error("Remove item failed:", e);
    }
  },

  updateQuantity: (sku: string, delta: number) => {
    const { householdId, cartItems } = get();
    if (!householdId) return;
    const item = cartItems.find((i) => i.product.id === sku);
    if (!item) return;
    const newQty = item.quantity + delta;
    if (newQty <= 0) {
      api.removeCartItem(householdId, sku).then(() => get().refreshCart());
    } else {
      api.updateCartItem(householdId, sku, newQty).then(() => get().refreshCart());
    }
  },

  refreshCart: async () => {
    const { householdId } = get();
    if (!householdId) return;
    try {
      const cart = await api.getCart(householdId);
      set({ cartItems: cart.items.map(apiItemToCartItem) });
    } catch {
      // ignore
    }
  },

  sharedCartActive: false,
  householdId: null,
  householdMembers: [],
  shareCode: "",

  toggleSharedCart: () =>
    set((state) => ({ sharedCartActive: !state.sharedCartActive })),

  createHousehold: async () => {
    const { currentUser } = get();
    if (!currentUser.id) return;
    try {
      const hh = await api.createHousehold(currentUser.id, `${currentUser.name}'s Home`);
      const hhData = await api.getHousehold(hh.household_id);
      set({
        householdId: hh.household_id,
        shareCode: hh.share_code,
        sharedCartActive: true,
        householdMembers: hhData.members.map(toUser),
        currentUser: {
          ...get().currentUser,
          color: hhData.members.find((m) => m.customer_id === currentUser.id)?.color ?? "#E1002A",
        },
      });
      get()._connectWs();
    } catch (e) {
      console.error("Create household failed:", e);
    }
  },

  joinHousehold: async (code: string) => {
    const { currentUser } = get();
    if (!currentUser.id) return;
    try {
      const result = await api.joinHousehold(currentUser.id, code);
      const hh = await api.getHousehold(result.household_id);
      set({
        householdId: result.household_id,
        shareCode: result.share_code,
        sharedCartActive: true,
        householdMembers: hh.members.map(toUser),
        currentUser: {
          ...get().currentUser,
          color: hh.members.find((m) => m.customer_id === currentUser.id)?.color ?? "#2563EB",
        },
      });
      get()._connectWs();
      await get().refreshCart();
    } catch (e) {
      console.error("Join household failed:", e);
    }
  },

  orderDay: "Thursday, Apr 10",

  searchProducts: () => {
    // Sync version — returns cached results
    return get().searchResults;
  },

  searchResults: [],

  doSearch: async (query: string) => {
    if (!query.trim()) {
      set({ searchResults: [] });
      return;
    }
    try {
      const results = await api.searchProducts(query, 8);
      set({ searchResults: results.map(toProduct) });
    } catch {
      set({ searchResults: [] });
    }
  },

  recentAdders: () => {
    const items = get().cartItems;
    const seen = new Set<string>();
    const adders: HouseholdUser[] = [];
    const sorted = [...items].sort((a, b) => b.addedAt - a.addedAt);
    for (const item of sorted) {
      if (!seen.has(item.addedBy.id)) {
        seen.add(item.addedBy.id);
        adders.push(item.addedBy);
      }
    }
    return adders;
  },

  _ws: null,

  _connectWs: () => {
    const { householdId, _ws: existingWs } = get();
    if (!householdId) return;
    if (existingWs) existingWs.close();

    const ws = api.connectWebSocket(householdId, (msg: unknown) => {
      const m = msg as { type: string; items?: ApiCartItem[]; item?: ApiCartItem };
      if (m.type === "cart_state" && m.items) {
        set({ cartItems: m.items.map(apiItemToCartItem) });
      } else if (m.type === "item_added" || m.type === "item_removed" || m.type === "item_updated") {
        get().refreshCart();
      } else if (m.type === "member_joined") {
        const hid = get().householdId;
        if (hid) {
          api.getHousehold(hid).then((hh) => {
            set({ householdMembers: hh.members.map(toUser) });
          });
        }
      }
    });

    set({ _ws: ws });
  },
}));
