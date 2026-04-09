"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { Search, Plus, Check } from "lucide-react";
import { usePicnicStore, type Product } from "@/lib/store";
import * as api from "@/lib/api";

const CATEGORY_EMOJI: Record<string, string> = {
  dairy: "🥛", dairy_alt: "🥛", bakery: "🍞", fresh: "🥬",
  frozen: "🧊", meat: "🥩", protein: "🥚", seafood: "🐟",
  beverages: "☕", snacks: "🍪", dry_food: "🍝",
};

function SharedCartBanner() {
  const sharedCartActive = usePicnicStore((s) => s.sharedCartActive);
  const householdMembers = usePicnicStore((s) => s.householdMembers);

  if (!sharedCartActive) return null;

  return (
    <motion.div
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="mx-4 mt-1 mb-2 px-3 py-2 rounded-xl bg-[#E1002A]/8 border border-[#E1002A]/15 flex items-center gap-2"
    >
      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
      <span className="text-[11px] text-[#E1002A] font-medium flex-1">
        Shared cart active
      </span>
      <div className="flex -space-x-1.5">
        {householdMembers.map((member) => (
          <div
            key={member.id}
            className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white border-2 border-white"
            style={{ backgroundColor: member.color }}
          >
            {member.initials}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

export function HomePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const addItem = usePicnicStore((s) => s.addItem);
  const cartItems = usePicnicStore((s) => s.cartItems);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const cartProductIds = new Set(cartItems.map((i) => i.product.id));

  // Load categories on mount
  useEffect(() => {
    api.getCategories().then(setCategories).catch(() => {});
  }, []);

  // Load products when category changes or search
  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      if (searchQuery.trim()) {
        const results = await api.searchProducts(searchQuery, 20);
        setProducts(
          results.map((p) => ({
            id: p.sku,
            name: p.name,
            emoji: CATEGORY_EMOJI[p.category] ?? "🛒",
            category: p.category,
            price: typeof p.price === "number" ? p.price : parseFloat(String(p.price)),
          }))
        );
      } else if (selectedCategory) {
        const results = await api.getProductsByCategory(selectedCategory, 20);
        setProducts(
          results.map((p) => ({
            id: p.sku,
            name: p.name,
            emoji: CATEGORY_EMOJI[p.category] ?? "🛒",
            category: p.category,
            price: typeof p.price === "number" ? p.price : parseFloat(String(p.price)),
          }))
        );
      } else {
        // Load popular items across categories
        const results = await api.searchProducts("a", 20);
        setProducts(
          results.map((p) => ({
            id: p.sku,
            name: p.name,
            emoji: CATEGORY_EMOJI[p.category] ?? "🛒",
            category: p.category,
            price: typeof p.price === "number" ? p.price : parseFloat(String(p.price)),
          }))
        );
      }
    } catch {
      // ignore
    }
    setLoading(false);
  }, [searchQuery, selectedCategory]);

  useEffect(() => {
    const timer = setTimeout(loadProducts, 300);
    return () => clearTimeout(timer);
  }, [loadProducts]);

  const handleAdd = async (productId: string) => {
    setJustAdded(productId);
    await addItem(productId);
    setTimeout(() => setJustAdded(null), 800);
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white px-4 pt-2 pb-3 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <Image
            src="/picnic-logo.png"
            alt="Picnic"
            width={44}
            height={44}
            className="rounded-lg"
          />
          <div className="text-right">
            <p className="text-[11px] text-gray-500">Delivering to</p>
            <p className="text-xs font-semibold text-gray-900">
              123 Main Street
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search products..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 outline-none focus:border-[#E1002A]/30 transition-colors"
          />
        </div>
      </div>

      <SharedCartBanner />

      {/* Categories */}
      <div className="px-4 py-2 flex gap-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
            !selectedCategory
              ? "bg-[#E1002A] text-white"
              : "bg-white text-gray-600 border border-gray-200"
          }`}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() =>
              setSelectedCategory(selectedCategory === cat ? null : cat)
            }
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              selectedCategory === cat
                ? "bg-[#E1002A] text-white"
                : "bg-white text-gray-600 border border-gray-200"
            }`}
          >
            {CATEGORY_EMOJI[cat] ?? "🛒"} {cat}
          </button>
        ))}
      </div>

      {/* Products grid */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {loading ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            Loading products...
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {products.map((product) => {
              const inCart = cartProductIds.has(product.id);
              const isJustAdded = justAdded === product.id;

              return (
                <motion.div
                  key={product.id}
                  layout
                  className="bg-white rounded-xl border border-gray-100 p-3 flex flex-col"
                >
                  <div className="text-3xl text-center py-3">
                    {product.emoji}
                  </div>
                  <p className="text-xs font-medium text-gray-900 truncate">
                    {product.name}
                  </p>
                  <p className="text-[10px] text-gray-400 mb-2">
                    {product.category}
                  </p>
                  <div className="flex items-center justify-between mt-auto">
                    <span className="text-sm font-bold text-gray-900">
                      €{product.price.toFixed(2)}
                    </span>
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleAdd(product.id)}
                      className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                        isJustAdded
                          ? "bg-green-500 text-white"
                          : inCart
                            ? "bg-[#E1002A]/10 text-[#E1002A]"
                            : "bg-[#E1002A] text-white"
                      }`}
                    >
                      <AnimatePresence mode="wait">
                        {isJustAdded ? (
                          <motion.div
                            key="check"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                          >
                            <Check size={14} />
                          </motion.div>
                        ) : (
                          <motion.div
                            key="plus"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                          >
                            <Plus size={14} />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
