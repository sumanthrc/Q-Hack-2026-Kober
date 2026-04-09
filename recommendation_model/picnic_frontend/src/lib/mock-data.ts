export interface Product {
  id: string;
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

export const USERS: Record<string, HouseholdUser> = {
  sarah: {
    id: "sarah",
    name: "Sarah",
    initials: "S",
    color: "#E1002A",
  },
  tom: {
    id: "tom",
    name: "Tom",
    initials: "T",
    color: "#2563EB",
  },
};

export const PRODUCTS: Product[] = [
  { id: "p1", name: "Whole Milk", emoji: "🥛", category: "Dairy", price: 1.49 },
  { id: "p2", name: "Free-Range Eggs", emoji: "🥚", category: "Dairy", price: 2.99 },
  { id: "p3", name: "Sourdough Bread", emoji: "🍞", category: "Bakery", price: 3.49 },
  { id: "p4", name: "Bananas", emoji: "🍌", category: "Fruit", price: 1.29 },
  { id: "p5", name: "Avocados", emoji: "🥑", category: "Fruit", price: 1.99 },
  { id: "p6", name: "Cherry Tomatoes", emoji: "🍅", category: "Vegetables", price: 2.49 },
  { id: "p7", name: "Chicken Breast", emoji: "🍗", category: "Meat", price: 5.99 },
  { id: "p8", name: "Pasta Penne", emoji: "🍝", category: "Pantry", price: 1.19 },
  { id: "p9", name: "Olive Oil", emoji: "🫒", category: "Pantry", price: 4.99 },
  { id: "p10", name: "Greek Yogurt", emoji: "🍦", category: "Dairy", price: 1.79 },
  { id: "p11", name: "Orange Juice", emoji: "🍊", category: "Drinks", price: 2.99 },
  { id: "p12", name: "Ground Coffee", emoji: "☕", category: "Drinks", price: 6.49 },
  { id: "p13", name: "Butter", emoji: "🧈", category: "Dairy", price: 2.29 },
  { id: "p14", name: "Cheddar Cheese", emoji: "🧀", category: "Dairy", price: 3.49 },
  { id: "p15", name: "Spinach", emoji: "🥬", category: "Vegetables", price: 1.99 },
  { id: "p16", name: "Rice", emoji: "🍚", category: "Pantry", price: 2.49 },
  { id: "p17", name: "Salmon Fillet", emoji: "🐟", category: "Meat", price: 8.99 },
  { id: "p18", name: "Apples", emoji: "🍎", category: "Fruit", price: 2.49 },
];

export const CATEGORIES = [
  { name: "Dairy", emoji: "🥛" },
  { name: "Bakery", emoji: "🍞" },
  { name: "Fruit", emoji: "🍎" },
  { name: "Vegetables", emoji: "🥬" },
  { name: "Meat", emoji: "🥩" },
  { name: "Pantry", emoji: "🥫" },
  { name: "Drinks", emoji: "🥤" },
];

// Items the household "usually buys" but aren't in the current cart
export const PREDICTED_MISSING: Product[] = [
  PRODUCTS[1],  // Eggs
  PRODUCTS[12], // Butter
  PRODUCTS[11], // Ground Coffee
];

export const SHARE_CODE = "PICNIC-7X2K";

export const ORDER_DAY = "Thursday, Apr 10";
