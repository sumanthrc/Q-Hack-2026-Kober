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
}

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

export const login = (customerId: string, name?: string) =>
  post<{
    customer: ApiCustomer;
    household: {
      household_id: string;
      role: string;
      color: string;
      share_code: string;
      household_name: string;
    } | null;
  }>("/auth/login", { customer_id: customerId, name });

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
  quantity: number
) => patch<unknown>(`/cart/${householdId}/items/${sku}`, { quantity });

export const removeCartItem = (householdId: string, sku: string) =>
  del<unknown>(`/cart/${householdId}/items/${sku}`);

export const clearCart = (householdId: string) =>
  del<unknown>(`/cart/${householdId}`);

// ── Recommendations ──
export interface RecommendationItem {
  sku: string;
  name: string;
  price: number;
  category: string;
  quantity: number;
  reason: string;
  confidence: number;
  rule_triggered: string;
  out_of_stock: boolean;
  substitute_sku?: string | null;
  substitute_name?: string | null;
  substitute_price?: number | null;
  substitute_suggestion?: string | null;
}

export interface RecommendationBasket {
  basket_id: string;
  basket_summary: string | null;
  confidence_score: number;
  generation_method: string;
  items: RecommendationItem[];
}

export const generateRecommendations = (customerId: string, useLlm = true) =>
  post<{ basket_id: string; cached: boolean }>("/recommendations/generate", {
    customer_id: customerId,
    use_llm: useLlm,
  });

export const getRecommendations = (customerId: string) =>
  get<RecommendationBasket>(`/recommendations/latest/${customerId}`);

// ── WebSocket ──
export function connectWebSocket(
  householdId: string,
  onMessage: (msg: unknown) => void
): WebSocket {
  const ws = new WebSocket(`ws://localhost:8000/ws/${householdId}`);
  ws.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data));
    } catch {
      // ignore parse errors
    }
  };
  return ws;
}
