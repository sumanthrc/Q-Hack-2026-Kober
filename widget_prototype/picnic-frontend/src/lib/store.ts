import { create } from "zustand";
import { toast } from "sonner";
import * as api from "./api";
import type { ApiCartItem, ApiHouseholdMember, RecommendedItem } from "./api";

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
  stockStatus: "in_stock" | "low_stock" | "out_of_stock";
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
    stockStatus: item.stock_status ?? "in_stock",
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
  leaveHousehold: () => Promise<void>;

  // Recommendations
  recommendations: RecommendedItem[];
  fetchRecommendations: () => Promise<void>;

  // Order
  orderDay: string;
  orderConfirmed: boolean;
  orderConfirmedBy: string | null;
  confirmOrder: () => void;

  // Widget
  searchProducts: (query: string) => Product[];
  searchResults: Product[];
  doSearch: (query: string) => Promise<void>;

  // Navigation
  requestOpenCart: number;
  openCart: () => void;

  // Adders
  recentAdders: () => HouseholdUser[];

  // WebSocket
  _ws: WebSocket | null;
  _connectWs: () => void;

  // Live activity
  liveActivity: { name: string; color: string } | null;
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
      const resp = await api.login(customerId);
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
          sharedCartActive: false,
          householdMembers: hh.members.map(toUser),
          currentUser: {
            ...user,
            color: resp.household.color,
          },
        });
        get()._connectWs();
        await get().refreshCart();
        get().fetchRecommendations();
      } else {
        // No household yet — auto-create one
        await get().createHousehold();
        get().fetchRecommendations();
      }
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
    });
  },

  itemHistory: {},
  setItemHistory: (sku, hasHistory, reason) =>
    set((state) => ({
      itemHistory: { ...state.itemHistory, [sku]: { hasHistory, reason } },
    })),

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
    const { householdId, cartItems, currentUser } = get();
    if (!householdId) return;
    const item = cartItems.find((i) => i.product.id === sku);
    if (!item) return;
    const newQty = item.quantity + delta;
    if (newQty <= 0) {
      api.removeCartItem(householdId, sku).then(() => get().refreshCart());
    } else {
      api.updateCartItem(householdId, sku, newQty, currentUser.id).then(() => get().refreshCart());
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
        sharedCartActive: false,
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

  leaveHousehold: async () => {
    const { currentUser, _ws } = get();
    if (!currentUser.id) return;
    try {
      if (_ws) _ws.close();
      await api.leaveHousehold(currentUser.id);
      // Reset household state, then create a fresh solo household
      set({
        householdId: null,
        householdMembers: [],
        shareCode: "",
        sharedCartActive: false,
        cartItems: [],
        _ws: null,
      });
      await get().createHousehold();
    } catch (e) {
      console.error("Leave household failed:", e);
    }
  },

  recommendations: [],

  fetchRecommendations: async () => {
    const { currentUser } = get();
    if (!currentUser.id) return;
    try {
      const result = await api.getRecommendations(currentUser.id);
      set({ recommendations: result.items ?? [] });
    } catch {
      // ignore — recommendations are optional
    }
  },

  orderDay: "Thursday, Apr 10",
  orderConfirmed: false,
  orderConfirmedBy: null,

  confirmOrder: () => {
    const { _ws, currentUser } = get();
    set({ orderConfirmed: true, orderConfirmedBy: currentUser.name });
    // Broadcast to other household members via WebSocket
    if (_ws && _ws.readyState === WebSocket.OPEN) {
      _ws.send(JSON.stringify({ type: "order_confirmed", confirmed_by: currentUser.name }));
    }
    toast.success(`Order confirmed by ${currentUser.name}!`);
  },

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

  liveActivity: null,

  _connectWs: () => {
    const { householdId, _ws: existingWs } = get();
    if (!householdId) return;
    if (existingWs) existingWs.close();

    const ws = api.connectWebSocket(
      householdId,
      (msg: unknown) => {
        const m = msg as { type: string; items?: ApiCartItem[]; item?: ApiCartItem };
        if (m.type === "cart_state" && m.items) {
          set({ cartItems: m.items.map(apiItemToCartItem) });
        } else if (m.type === "item_added" || m.type === "item_removed" || m.type === "item_updated") {
          get().refreshCart();
          // Show live activity indicator for other users' changes
          const mTyped = m as { type: string; item?: { added_by_name?: string; added_by_color?: string; name?: string } };
          if (m.type === "item_added" && mTyped.item?.added_by_name) {
            const adderName = mTyped.item.added_by_name;
            const adderColor = mTyped.item.added_by_color ?? "#8e8e93";
            if (adderName !== get().currentUser.name) {
              set({ liveActivity: { name: adderName, color: adderColor } });
              setTimeout(() => set({ liveActivity: null }), 3000);
              toast(`${adderName} added ${mTyped.item.name ?? "an item"}`, { duration: 2500 });
            }
          }
        } else if (m.type === "order_confirmed") {
          const mTyped2 = m as { type: string; confirmed_by?: string };
          const who = mTyped2.confirmed_by ?? "Someone";
          set({ orderConfirmed: true, orderConfirmedBy: who });
          toast.success(`${who} confirmed the order!`);
        } else if (m.type === "member_joined" || m.type === "member_left") {
          const hid = get().householdId;
          if (hid) {
            api.getHousehold(hid).then((hh) => {
              const members = hh.members.map(toUser);
              set({
                householdMembers: members,
              });
            });
          }
        }
      },
      // onOpen: refresh members to catch any missed broadcasts
      () => {
        const hid = get().householdId;
        if (hid) {
          api.getHousehold(hid).then((hh) => {
            set({ householdMembers: hh.members.map(toUser) });
          });
        }
      },
    );

    set({ _ws: ws });
  },
}));
