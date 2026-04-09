"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Home, ShoppingCart, User } from "lucide-react";
import { usePicnicStore } from "@/lib/store";
import { LoginPage } from "./login-page";
import { HomePage } from "./home-page";
import { CartPage } from "./cart-page";
import { ProfilePage } from "./profile-page";

type Tab = "home" | "cart" | "profile";

export function PicnicApp() {
  const isLoggedIn = usePicnicStore((s) => s.isLoggedIn);
  const cartItems = usePicnicStore((s) => s.cartItems);
  const requestOpenCart = usePicnicStore((s) => s.requestOpenCart);
  const [activeTab, setActiveTab] = useState<Tab>("home");

  // Widget tap → navigate to cart
  useEffect(() => {
    if (requestOpenCart > 0) {
      setActiveTab("cart");
    }
  }, [requestOpenCart]);

  if (!isLoggedIn) {
    return <LoginPage />;
  }

  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const tabs: { id: Tab; icon: typeof Home; label: string }[] = [
    { id: "home", icon: Home, label: "Home" },
    { id: "cart", icon: ShoppingCart, label: "Cart" },
    { id: "profile", icon: User, label: "Profile" },
  ];

  return (
    <div className="h-full flex flex-col bg-white pt-[54px]">
      {/* Page content */}
      <div className="flex-1 min-h-0 relative">
        {activeTab === "home" && <HomePage />}
        {activeTab === "cart" && <CartPage />}
        {activeTab === "profile" && <ProfilePage />}
      </div>

      {/* Bottom tab bar */}
      <div className="bg-white/90 backdrop-blur-md border-t border-[#F3F4F6] shadow-[0_-4px_12px_rgba(0,0,0,0.03)] px-2 pb-4 pt-1">
        <div className="flex items-center justify-around">
          {tabs.map(({ id, icon: Icon, label }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`relative flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-colors ${
                  isActive ? "text-[#E1002A] bg-[#FFF1F3]" : "text-[#6B7280]"
                }`}
              >
                <div className="relative">
                  <Icon
                    size={22}
                    className={
                      isActive ? "text-[#E1002A]" : "text-[#6B7280]"
                    }
                    strokeWidth={isActive ? 2.2 : 1.8}
                  />
                  {id === "cart" && totalItems > 0 && (
                    <motion.span
                      key={totalItems}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-1.5 -right-2 w-4 h-4 rounded-full bg-[#E1002A] text-white text-[9px] font-bold flex items-center justify-center"
                    >
                      {totalItems}
                    </motion.span>
                  )}
                </div>
                <span
                  className={`text-[11px] font-semibold ${
                    isActive ? "text-[#E1002A]" : "text-[#6B7280]"
                  }`}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
