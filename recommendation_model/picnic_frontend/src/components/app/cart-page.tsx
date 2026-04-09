"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Minus, Plus, Trash2, ShoppingCart, Calendar, Sparkles, PackageX } from "lucide-react";
import { usePicnicStore } from "@/lib/store";

export function CartPage() {
  const cartItems              = usePicnicStore((s) => s.cartItems);
  const removeItem             = usePicnicStore((s) => s.removeItem);
  const updateQuantity         = usePicnicStore((s) => s.updateQuantity);
  const orderDay               = usePicnicStore((s) => s.orderDay);
  const recommendationSummary  = usePicnicStore((s) => s.recommendationSummary);
  const outOfStockItems        = usePicnicStore((s) => s.outOfStockItems);
  const recommendationsLoading = usePicnicStore((s) => s.recommendationsLoading);
  const addSubstitute          = usePicnicStore((s) => s.addSubstitute);

  const total = cartItems.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );

  return (
    <div className="absolute inset-0 flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white px-4 pt-2 pb-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">Cart</h1>
          <div className="flex items-center gap-1.5 text-gray-500">
            <Calendar size={14} />
            <span className="text-xs font-medium">{orderDay}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Loading skeleton while recommendations are being fetched */}
        {recommendationsLoading && cartItems.length === 0 && (
          <div className="px-4 py-3 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 p-3 animate-pulse">
                <div className="flex gap-2.5">
                  <div className="w-8 h-8 bg-gray-100 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-gray-100 rounded w-3/4" />
                    <div className="h-2.5 bg-gray-100 rounded w-1/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!recommendationsLoading && cartItems.length === 0 && outOfStockItems.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <ShoppingCart size={40} strokeWidth={1.5} />
            <p className="mt-3 text-sm font-medium">Your cart is empty</p>
            <p className="text-xs mt-1">Add items from the home tab</p>
          </div>
        )}

        {/* Cart items */}
        {cartItems.length > 0 && (
          <div className="px-4 py-3 space-y-2">
            {/* AI basket summary card */}
            {recommendationSummary && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2.5 bg-gradient-to-r from-[#fff1f3] to-[#fff8f0] border border-[#fcd5da] rounded-xl px-3 py-2.5"
              >
                <Sparkles size={14} className="text-[#E1002A] mt-0.5 shrink-0" />
                <p className="text-[11px] text-[#c0001f] leading-snug font-medium">
                  {recommendationSummary}
                </p>
              </motion.div>
            )}

            <AnimatePresence>
              {cartItems.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20, height: 0 }}
                  className="bg-white rounded-xl border border-gray-100 p-3"
                >
                  {/* Top row */}
                  <div className="flex items-start gap-2.5">
                    <span className="text-xl">{item.product.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {item.product.name}
                      </p>
                    </div>
                    <button
                      onClick={() => removeItem(item.product.id)}
                      className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-500 transition-colors shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Bottom row */}
                  <div className="flex items-center justify-between mt-2 pl-[30px]">
                    <div className="flex items-center gap-1 bg-gray-50 rounded-lg">
                      <button
                        onClick={() => updateQuantity(item.product.id, -1)}
                        className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-700"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="text-xs font-semibold text-gray-900 w-5 text-center">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.product.id, 1)}
                        className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-700"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                    <span className="text-xs font-bold text-gray-900">
                      €{(item.product.price * item.quantity).toFixed(2)}
                    </span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Out-of-stock substitute suggestions */}
        {outOfStockItems.length > 0 && (
          <div className="px-4 pb-3 space-y-2">
            <div className="flex items-center gap-1.5 px-1 pt-1 pb-0.5">
              <PackageX size={12} className="text-gray-400" />
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                Unavailable items
              </span>
            </div>
            {outOfStockItems.map((item) => (
              <div
                key={item.sku}
                className="bg-white border border-gray-100 rounded-xl p-3"
              >
                <div className="flex items-start gap-2.5">
                  <span className="text-xl opacity-40">📦</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-400 line-through">
                      {item.name}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                      {item.substitute_suggestion
                        ? item.substitute_suggestion
                        : item.substitute_name
                          ? `Try ${item.substitute_name} instead`
                          : "Out of stock"}
                    </p>
                    {item.substitute_sku && (
                      <button
                        onClick={() => addSubstitute(item.substitute_sku!, 1)}
                        className="mt-2 text-[11px] font-semibold text-white bg-[#E1002A] rounded-lg px-3 py-1 hover:bg-[#c0001f] transition-colors"
                      >
                        Add {item.substitute_name ?? "substitute"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Total + checkout */}
      {cartItems.length > 0 && (
        <div className="bg-white border-t border-gray-100 px-4 py-3 pb-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500">Total</span>
            <span className="text-lg font-bold text-gray-900">
              €{total.toFixed(2)}
            </span>
          </div>
          <motion.button
            whileTap={{ scale: 0.98 }}
            className="w-full py-3 rounded-xl bg-[#E1002A] text-white font-semibold text-sm shadow-lg shadow-[#E1002A]/20"
          >
            Confirm Order for {orderDay}
          </motion.button>
        </div>
      )}
    </div>
  );
}
