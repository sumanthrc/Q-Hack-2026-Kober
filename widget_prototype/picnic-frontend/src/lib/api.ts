const API = "http://localhost:8000";

export interface ApiCustomer {
  id: string;
  name: string;
  dietary_preference: string;
  preferred_categories?: string[];
}

export interface ApiHouseholdMember {
  customer_id: string;
  role: string;
  color: string;
  name: string;
}

export interface ApiCartItem {
  id: string;
  sku: string;
  quantity: number;
  added_by: string;
  added_at: string;
  name: string;
  category: string;
  price: number;
  added_by_name: string;
  added_by_color: string;
  stock_status?: "in_stock" | "low_stock" | "out_of_stock";
}

export interface SubstituteItem {
  sku: string;
  name: string;
  category: string;
  price: number;
}

export const getSubstitutes = (sku: string) =>
  get<SubstituteItem[]>(`/products/${sku}/substitutes`);

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
  return res.json();
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`POST ${path}: ${res.status}`);
  return res.json();
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE ${path}: ${res.status}`);
  return res.json();
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${path}: ${res.status}`);
  return res.json();
}

// ── Auth ──
export const listCustomers = () => get<ApiCustomer[]>("/auth/customers");

export const login = (customerId: string) =>
  post<{
    customer: ApiCustomer;
    household: {
      household_id: string;
      role: string;
      color: string;
      share_code: string;
      household_name: string;
    } | null;
  }>("/auth/login", { customer_id: customerId });

// ── Household ──
export const createHousehold = (customerId: string, name: string) =>
  post<{ household_id: string; share_code: string; cart_id: string }>(
    `/household/create?customer_id=${customerId}&name=${encodeURIComponent(name)}`
  );

export const joinHousehold = (customerId: string, shareCode: string) =>
  post<{ household_id: string; share_code: string }>(
    "/household/join",
    { customer_id: customerId, share_code: shareCode }
  );

export const leaveHousehold = (customerId: string) =>
  post<{ left: boolean }>("/household/leave", { customer_id: customerId });

export const getHousehold = (householdId: string) =>
  get<{
    id: string;
    name: string;
    share_code: string;
    members: ApiHouseholdMember[];
  }>(`/household/${householdId}`);

// ── Products ──
export const searchProducts = (query: string, limit = 10) =>
  get<Array<{
    sku: string;
    name: string;
    category: string;
    price: number;
    nutriscore?: string;
    is_biological?: boolean;
  }>>(`/products/search?q=${encodeURIComponent(query)}&limit=${limit}`);

export interface SmartSearchResult {
  type: "history_match" | "search_results";
  match: {
    sku: string;
    name: string;
    category: string;
    price: number;
    quantity: number;
    total_orders?: number;
    reason?: string;
  } | null;
  alternatives: Array<{
    sku: string;
    name: string;
    category: string;
    price: number;
    quantity: number;
  }>;
}

export const smartSearch = (query: string, customerId: string) =>
  get<SmartSearchResult>(
    `/products/smart-search?q=${encodeURIComponent(query)}&customer_id=${customerId}`
  );

export const getCategories = () => get<string[]>("/products/categories");

export const getProductsByCategory = (category: string, limit = 30) =>
  get<Array<{
    sku: string;
    name: string;
    category: string;
    price: number;
    nutriscore?: string;
    is_biological?: boolean;
  }>>(`/products/by-category?category=${encodeURIComponent(category)}&limit=${limit}`);

// ── Cart ──
export const getCart = (householdId: string) =>
  get<{ cart_id: string; status: string; items: ApiCartItem[] }>(
    `/cart/${householdId}`
  );

export const addCartItem = (
  householdId: string,
  sku: string,
  quantity: number,
  addedBy: string
) =>
  post<ApiCartItem>(`/cart/${householdId}/items`, {
    sku,
    quantity,
    added_by: addedBy,
  });

export const updateCartItem = (
  householdId: string,
  sku: string,
  quantity: number,
  updatedBy?: string
) => patch<unknown>(`/cart/${householdId}/items/${sku}`, { quantity, updated_by: updatedBy });

export const removeCartItem = (householdId: string, sku: string) =>
  del<unknown>(`/cart/${householdId}/items/${sku}`);

// ── Recommendations ──
export interface RecommendedItem {
  sku: string;
  quantity: number;
  reason: string;
  confidence: number;
  rule_triggered: string;
  name: string;
  price: number;
  category: string;
}

export const getRecommendations = (customerId: string) =>
  post<{
    basket_id: string | null;
    items: RecommendedItem[];
  }>(`/recommendations/generate/${customerId}`);

// ── WebSocket ──
export function connectWebSocket(
  householdId: string,
  onMessage: (msg: unknown) => void,
  onOpen?: () => void
): WebSocket {
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  function createWs(): WebSocket {
    const ws = new WebSocket(`ws://localhost:8000/ws/${householdId}`);
    ws.onopen = () => {
      onOpen?.();
    };
    ws.onmessage = (event) => {
      try {
        onMessage(JSON.parse(event.data));
      } catch {
        // ignore parse errors
      }
    };
    ws.onclose = () => {
      if (!closed) {
        reconnectTimer = setTimeout(() => createWs(), 2000);
      }
    };
    ws.onerror = () => {
      ws.close();
    };
    return ws;
  }

  const ws = createWs();
  // Override close to stop reconnection
  const originalClose = ws.close.bind(ws);
  ws.close = () => {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    originalClose();
  };
  return ws;
}
