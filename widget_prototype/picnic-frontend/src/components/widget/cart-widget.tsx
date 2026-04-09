"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingCart, Calendar } from "lucide-react";
import { usePicnicStore } from "@/lib/store";

/* ─── Main widget — clean and minimal ─── */
export function CartWidget({
  onLongPress,
}: {
  onLongPress?: () => void;
}) {
  const isLoggedIn = usePicnicStore((s) => s.isLoggedIn);
  const cartItems = usePicnicStore((s) => s.cartItems);
  const orderDay = usePicnicStore((s) => s.orderDay);
  const sharedCartActive = usePicnicStore((s) => s.sharedCartActive);
  const recentAdders = usePicnicStore((s) => s.recentAdders);
  const openCart = usePicnicStore((s) => s.openCart);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const adders = recentAdders();
  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const glassStyle = {
    background: "rgba(60, 60, 80, 0.45)",
    backdropFilter: "blur(40px) saturate(180%)",
    WebkitBackdropFilter: "blur(40px) saturate(180%)",
    boxShadow:
      "0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(255,255,255,0.05)",
  };

  const handlePointerDown = useCallback(() => {
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      onLongPress?.();
    }, 500);
  }, [onLongPress]);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (!didLongPress.current) {
      openCart();
    }
  }, [openCart]);

  const handlePointerLeave = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  // ─── Logged-out state ───
  if (!isLoggedIn) {
    return (
      <div
        className="w-full rounded-[22px] p-4 border border-white/[0.18]"
        style={glassStyle}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[12px] bg-[#E1002A] flex items-center justify-center">
            <ShoppingCart size={20} className="text-white" />
          </div>
          <div>
            <p className="text-white/90 font-semibold text-[15px]">
              Picnic Cart
            </p>
            <p className="text-white/30 text-[12px]">
              Sign in to view your cart
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Logged-in state ───
  return (
    <div
      className="w-full rounded-[22px] border border-white/[0.18] select-none"
      style={glassStyle}
    >
      {/* Top highlight */}
      <div
        className="absolute inset-0 rounded-[22px] pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 35%)",
        }}
      />

      {/* Tappable widget face */}
      <div
        className="relative p-4 cursor-pointer active:bg-white/[0.03] transition-colors rounded-[22px]"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      >
        {/* Row 1: Cart icon + name + item count */}
        <div className="flex items-center gap-3 mb-3">
          <div className="relative w-10 h-10 rounded-[12px] bg-[#E1002A] flex items-center justify-center">
            <ShoppingCart size={20} className="text-white" />
            <AnimatePresence>
              {totalItems > 0 && (
                <motion.span
                  key={totalItems}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", bounce: 0.5 }}
                  className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-white text-[#E1002A] text-[11px] font-bold flex items-center justify-center shadow-sm"
                >
                  {totalItems}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <div className="flex-1">
            <p className="text-white/90 font-semibold text-[15px] leading-tight">
              Picnic Cart
            </p>
            <p className="text-white/35 text-[12px] leading-tight mt-0.5">
              {totalItems === 0
                ? "No items yet"
                : `${totalItems} item${totalItems !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>

        {/* Row 2: Order day */}
        <div className="flex items-center gap-2 mb-2">
          <Calendar size={13} className="text-white/35" />
          <span className="text-white/45 text-[12px]">
            Order day:{" "}
            <span className="text-white/85 font-medium">{orderDay}</span>
          </span>
        </div>

        {/* Row 3: Last changed by — visible when shared cart active */}
        {adders.length > 0 && (
          <div className={`flex items-center gap-2 transition-opacity ${sharedCartActive ? "opacity-100" : "opacity-25"}`}>
            <span className="text-white/40 text-[12px]">Added by:</span>
            {sharedCartActive ? (
              <>
                <div
                  className="w-[20px] h-[20px] rounded-full flex items-center justify-center text-[9px] font-bold text-white border-[1.5px] border-white/10"
                  style={{ backgroundColor: adders[0].color }}
                >
                  {adders[0].initials}
                </div>
                <span className="text-white/30 text-[12px]">
                  {adders[0].name}
                </span>
              </>
            ) : (
              <span className="text-white/20 text-[12px]">
                Shared cart off
              </span>
            )}
          </div>
        )}

        {/* Hint */}
        <p className="text-white/15 text-[10px] text-center mt-3">
          tap to open · hold to add items
        </p>
      </div>
    </div>
  );
}
