"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Minus, Plus, Trash2, ShoppingCart, Calendar, Check } from "lucide-react";
import CountUp from "react-countup";
import { usePicnicStore } from "@/lib/store";
import * as api from "@/lib/api";
import type { SubstituteItem } from "@/lib/api";

const CATEGORY_EMOJI: Record<string, string> = {
  dairy: "🥛", dairy_alt: "🥛", bakery: "🍞", fresh: "🥬",
  frozen: "🧊", meat: "🥩", protein: "🥚", seafood: "🐟",
  beverages: "☕", snacks: "🍪", dry_food: "🍝",
};

export function CartPage() {
  const cartItems = usePicnicStore((s) => s.cartItems);
  const removeItem = usePicnicStore((s) => s.removeItem);
  const updateQuantity = usePicnicStore((s) => s.updateQuantity);
  const addItem = usePicnicStore((s) => s.addItem);
  const setItemHistory = usePicnicStore((s) => s.setItemHistory);
  const orderDay = usePicnicStore((s) => s.orderDay);
  const sharedCartActive = usePicnicStore((s) => s.sharedCartActive);
  const recommendations = usePicnicStore((s) => s.recommendations);
  const liveActivity = usePicnicStore((s) => s.liveActivity);
  const orderConfirmed = usePicnicStore((s) => s.orderConfirmed);
  const orderConfirmedBy = usePicnicStore((s) => s.orderConfirmedBy);
  const confirmOrder = usePicnicStore((s) => s.confirmOrder);
  const [addingRec, setAddingRec] = useState<string | null>(null);
  const [showTruck, setShowTruck] = useState(false);
  const [subs, setSubs] = useState<Record<string, SubstituteItem[]>>({});
  const prevTotal = useRef(0);

  const availableItems = cartItems.filter((i) => i.stockStatus === "in_stock" || i.stockStatus === "low_stock");
  const unavailableItems = cartItems.filter((i) => i.stockStatus === "out_of_stock");
  const cartSkus = new Set(cartItems.map((i) => i.product.id));
  const missingUsuals = recommendations.filter((r) => !cartSkus.has(r.sku));

  // Fetch substitutes for unavailable items
  const fetchSub = async (sku: string) => {
    if (subs[sku]) return;
    const result = await api.getSubstitutes(sku);
    setSubs((prev) => ({ ...prev, [sku]: result }));
  };

  const total = availableItems.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );

  return (
    <div className="absolute inset-0 flex flex-col bg-[#F8F8FA]">
      {/* Header */}
      <div className="bg-white/90 backdrop-blur-md px-4 pt-2 pb-3 border-b border-[#F3F4F6] shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-extrabold text-gray-900">Cart</h1>
          <div className="flex items-center gap-1.5 text-gray-500">
            <Calendar size={14} />
            <span className="text-xs font-medium">{orderDay}</span>
          </div>
        </div>
      </div>

      {/* Live collaboration indicator */}
      <AnimatePresence>
        {liveActivity && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-white/90 backdrop-blur-md border-b border-[#F3F4F6] px-4 py-2 flex items-center gap-2 overflow-hidden"
          >
            <motion.div
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: liveActivity.color }}
            />
            <span className="text-xs text-gray-500">
              <span className="font-medium text-gray-700">{liveActivity.name}</span> is updating the cart...
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cart items */}
      <div className="flex-1 overflow-y-auto">
        {cartItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[#6B7280]">
            <ShoppingCart size={40} strokeWidth={1.5} />
            <p className="mt-3 text-sm font-medium">Your cart is empty</p>
            <p className="text-xs mt-1">
              Add items from the home tab or widget
            </p>
          </div>
        ) : (
          <div className="px-4 py-3 space-y-2">
            <p className="text-xs font-bold text-[#6B7280] uppercase tracking-widest">
              Current order
            </p>
            <AnimatePresence>
              {availableItems.map((item, index) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 20, height: 0 }}
                  transition={{ delay: index * 0.05, type: "spring", bounce: 0.3 }}
                  className="bg-white rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.03)] border border-[#F3F4F6] p-3"
                >
                  {/* Top row: emoji + full name + delete */}
                  <div className="flex items-start gap-2.5">
                    <span className="text-xl">{item.product.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {item.product.name}
                      </p>
                      {sharedCartActive && (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <div
                            className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-bold text-white"
                            style={{ backgroundColor: item.addedBy.color }}
                          >
                            {item.addedBy.initials}
                          </div>
                          <span className="text-[10px] text-gray-400">
                            {item.addedBy.name}
                          </span>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => removeItem(item.product.id)}
                      className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-500 transition-colors shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Bottom row: quantity controls + price */}
                  <div className="flex items-center justify-between mt-2 pl-[30px]">
                    <div className="flex items-center gap-3 bg-[#F8F8FA] rounded-full p-1">
                      <button
                        onClick={() => updateQuantity(item.product.id, -1)}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-white shadow-sm hover:bg-[#FFF1F3] active:scale-90 transition-all text-gray-500"
                      >
                        <Minus size={12} />
                      </button>
                      <motion.span
                        key={item.quantity}
                        initial={{ scale: 1.3 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", bounce: 0.5 }}
                        className="font-bold text-sm w-4 text-center"
                      >
                        {item.quantity}
                      </motion.span>
                      <button
                        onClick={() => updateQuantity(item.product.id, 1)}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-white shadow-sm hover:bg-[#FFF1F3] active:scale-90 transition-all text-gray-500"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                    <span className="text-[#E1002A] font-bold text-sm">
                      €{(item.product.price * item.quantity).toFixed(2)}
                    </span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

          </div>
        )}

        {/* Unavailable items */}
        {unavailableItems.length > 0 && (
          <div className="px-4 py-3">
            <p className="text-xs font-bold text-[#6B7280] uppercase tracking-widest mb-2">
              Unavailable
            </p>
            <div className="space-y-2">
              {unavailableItems.map((item) => {
                // Auto-fetch substitutes on render
                if (!subs[item.product.id]) fetchSub(item.product.id);
                const itemSubs = subs[item.product.id] ?? [];
                return (
                  <div key={item.id}>
                    <div className="bg-white/50 rounded-xl border border-dashed border-[#F3F4F6] p-3 flex items-center gap-3">
                      <span className="text-xl grayscale opacity-50">{item.product.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-[#6B7280]">{item.product.name}</p>
                        <p className="text-[10px] text-red-500 font-medium">Out of stock</p>
                      </div>
                      <button
                        onClick={() => removeItem(item.product.id)}
                        className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-500 transition-colors shrink-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {/* Substitute suggestions */}
                    {itemSubs.length > 0 && (
                      <div className="ml-8 mt-1.5 space-y-1">
                        <p className="text-[10px] text-[#6B7280] font-medium">Try instead:</p>
                        {itemSubs.slice(0, 2).map((sub) => (
                          <div
                            key={sub.sku}
                            className="flex items-center gap-2 bg-[#F8F8FA] rounded-lg px-2.5 py-1.5"
                          >
                            <span className="text-sm">{CATEGORY_EMOJI[sub.category] ?? "🛒"}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-[#111827] truncate">{sub.name}</p>
                              <p className="text-[10px] text-[#E1002A] font-bold">€{Number(sub.price).toFixed(2)}</p>
                            </div>
                            <button
                              onClick={async () => {
                                await addItem(sub.sku, 1);
                                removeItem(item.product.id);
                              }}
                              className="w-6 h-6 rounded-full bg-[#10B981] text-white flex items-center justify-center shrink-0"
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recommended items not in cart */}
        {missingUsuals.length > 0 && (
          <div className="px-4 py-3 pb-4">
            <p className="text-xs font-bold text-[#6B7280] uppercase tracking-widest mb-2">
              Forgot something?
            </p>
            <div className="space-y-1.5">
              {missingUsuals.map((rec) => {
                const emoji = CATEGORY_EMOJI[rec.category] ?? "🛒";
                const added = addingRec === rec.sku;
                return (
                  <div
                    key={rec.sku}
                    className="flex items-center gap-2.5 bg-white rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.03)] border border-[#F3F4F6] px-3 py-2.5"
                  >
                    <span className="text-lg">{emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 truncate">{rec.name}</p>
                      <p className="text-[10px] text-green-600 truncate">
                        {rec.reason}
                      </p>
                    </div>
                    <span className="text-[10px] text-gray-400 shrink-0">
                      ×{rec.quantity}
                    </span>
                    <button
                      onClick={async () => {
                        setAddingRec(rec.sku);
                        setItemHistory(rec.sku, true, "Your usual");
                        await addItem(rec.sku, rec.quantity);
                        setTimeout(() => setAddingRec(null), 600);
                      }}
                      disabled={added}
                      className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                        added
                          ? "bg-[#10B981] text-white"
                          : "bg-[#10B981] text-white"
                      }`}
                    >
                      {added ? <Check size={14} /> : <Plus size={14} />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Total + checkout */}
      {cartItems.length > 0 && (
        <div className="bg-white/90 backdrop-blur-md border-t border-[#F3F4F6] shadow-[0_-4px_12px_rgba(0,0,0,0.03)] px-4 py-3 pb-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-[#6B7280] font-semibold">Total</span>
            <span className="text-lg font-bold text-[#111827]">
              €<CountUp
                start={prevTotal.current}
                end={total}
                decimals={2}
                duration={0.6}
                onEnd={() => { prevTotal.current = total; }}
              />
            </span>
          </div>
          {/* Truck animation above button */}
          <AnimatePresence>
            {showTruck && (
              <div className="relative h-10 mb-1 overflow-hidden">
                <motion.div
                  initial={{ x: "-60px" }}
                  animate={{ x: "calc(100% + 60px)" }}
                  transition={{ duration: 1.5, ease: "linear" }}
                  onAnimationComplete={() => setShowTruck(false)}
                  className="absolute top-1/2 -translate-y-1/2 flex items-center"
                >
                  <motion.span
                    animate={{ opacity: [0.5, 0] }}
                    transition={{ duration: 0.4, repeat: Infinity }}
                    className="text-[10px] mr-[-2px]"
                  >
                    💨
                  </motion.span>
                  <span className="text-[28px] drop-shadow-md" style={{ transform: "scaleX(-1)" }}>
                    🚚
                  </span>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          <div className="relative overflow-hidden rounded-xl">
            {/* Green fill that follows the truck */}
            <AnimatePresence>
              {showTruck && (
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 1.5, ease: "linear" }}
                  className="absolute inset-0 bg-green-500 z-10 origin-left"
                />
              )}
            </AnimatePresence>

            {/* Text overlay that changes as green fills */}
            {showTruck && (
              <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="text-white font-semibold text-sm"
                >
                  Order on its way!
                </motion.span>
              </div>
            )}

            {/* Button */}
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                if (!orderConfirmed) {
                  setShowTruck(true);
                  setTimeout(() => confirmOrder(), 1500);
                }
              }}
              disabled={orderConfirmed || showTruck}
              className={`relative z-5 w-full py-4 font-extrabold text-sm rounded-xl shadow-md transition-all ${
                orderConfirmed
                  ? "bg-green-500 text-white"
                  : "bg-[#E1002A] text-white hover:brightness-110 active:scale-[0.98]"
              }`}
            >
              {orderConfirmed
                ? `✓ Order confirmed${orderConfirmedBy ? ` by ${orderConfirmedBy}` : ""}!`
                : `Confirm Order for ${orderDay}`}
            </motion.button>
          </div>
        </div>
      )}

    </div>
  );
}
