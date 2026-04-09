"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search } from "lucide-react";
import { usePicnicStore } from "@/lib/store";
import * as api from "@/lib/api";
import { CartWidget } from "./cart-widget";

/* ─── iOS-accurate squircle icon ─── */
/* Apple uses a continuous-curvature superellipse at ~22.37% radius */
function AppIcon({
  name,
  bg,
  children,
}: {
  name: string;
  bg: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-[5px]">
      <div
        className="w-[60px] h-[60px] rounded-[13.5px] flex items-center justify-center text-[28px] shadow-[0_1px_3px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.08)]"
        style={{ background: bg }}
      >
        {children}
      </div>
      <span className="text-white text-[11px] leading-none font-normal drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
        {name}
      </span>
    </div>
  );
}

/* ─── SVG-based app icons for realism ─── */
/* Using inline SVGs + emoji fallback to resemble iOS system icons */

function MessagesIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      <path
        d="M15 4C8.4 4 3 8.5 3 14c0 3.2 1.8 6 4.5 7.8L6.5 26l5-2.5c1.1.3 2.3.5 3.5.5 6.6 0 12-4.5 12-10S21.6 4 15 4z"
        fill="white"
      />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <path
        d="M6.6 3.3c.5-.4 1.2-.3 1.8.2l3.5 3.5c.5.5.5 1.2.1 1.7l-2 2.5c-.2.2-.2.5 0 .8l5.8 5.8c.3.3.6.3.8 0l2.5-2c.5-.4 1.2-.4 1.7.1l3.5 3.5c.5.6.6 1.3.2 1.8-1.5 1.8-4 3.1-6.6 2.3-3.8-1.2-8.5-4.7-12-8.2S1.2 7.4 2.4 3.6c-.7-2.6.6-5.1 2.3-6.6z"
        fill="white"
        transform="translate(1,2)"
      />
    </svg>
  );
}

const HOME_APPS = [
  {
    name: "Messages",
    bg: "linear-gradient(180deg, #65D543 0%, #34C759 100%)",
    icon: <MessagesIcon />,
  },
  {
    name: "Photos",
    bg: "linear-gradient(135deg, #FF6482 0%, #FF9F43 25%, #FFD93D 50%, #6BCB77 75%, #4D96FF 100%)",
    icon: <span className="text-white text-[26px]">🌸</span>,
  },
  {
    name: "Camera",
    bg: "linear-gradient(180deg, #636366 0%, #1C1C1E 100%)",
    icon: (
      <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
        <circle cx="15" cy="16" r="6" stroke="white" strokeWidth="2" />
        <circle cx="15" cy="16" r="3" fill="white" />
        <rect x="6" y="7" width="18" height="2" rx="1" fill="white" opacity="0.6" />
      </svg>
    ),
  },
  {
    name: "Maps",
    bg: "linear-gradient(180deg, #5AC8FA 0%, #34C759 100%)",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <path
          d="M14 4L8 7v17l6-3 6 3 6-3V4l-6 3-6-3z"
          fill="white"
          opacity="0.9"
        />
        <path d="M14 4v17" stroke="white" strokeWidth="1" opacity="0.4" />
      </svg>
    ),
  },
  {
    name: "Weather",
    bg: "linear-gradient(180deg, #5AC8FA 0%, #007AFF 100%)",
    icon: (
      <span className="text-[26px] drop-shadow-sm">☀️</span>
    ),
  },
  {
    name: "Clock",
    bg: "linear-gradient(180deg, #1C1C1E 0%, #000000 100%)",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <circle cx="14" cy="14" r="11" stroke="white" strokeWidth="1.5" />
        <line x1="14" y1="14" x2="14" y2="7" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="14" y1="14" x2="20" y2="14" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="14" cy="14" r="1.5" fill="white" />
      </svg>
    ),
  },
  {
    name: "Notes",
    bg: "linear-gradient(180deg, #FFD60A 0%, #FFCC00 100%)",
    icon: (
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
        <rect x="4" y="5" width="18" height="1.5" rx="0.75" fill="#1C1C1E" opacity="0.25" />
        <rect x="4" y="9" width="18" height="1.5" rx="0.75" fill="#1C1C1E" opacity="0.25" />
        <rect x="4" y="13" width="12" height="1.5" rx="0.75" fill="#1C1C1E" opacity="0.25" />
        <path d="M6 4l14 0" stroke="#1C1C1E" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      </svg>
    ),
  },
  {
    name: "Music",
    bg: "linear-gradient(135deg, #FC3C44 0%, #FF2D55 100%)",
    icon: (
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
        <path
          d="M19 3v14a3 3 0 1 1-2-2.83V7l-8 2v10a3 3 0 1 1-2-2.83V5l12-3z"
          fill="white"
          opacity="0.9"
        />
      </svg>
    ),
  },
];

const DOCK_APPS = [
  {
    name: "Phone",
    bg: "linear-gradient(180deg, #65D543 0%, #34C759 100%)",
    icon: <PhoneIcon />,
  },
  {
    name: "Safari",
    bg: "linear-gradient(180deg, #5AC8FA 0%, #007AFF 100%)",
    icon: (
      <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
        <circle cx="15" cy="15" r="11" stroke="white" strokeWidth="1.5" />
        <path d="M15 4l1 7h-2l1-7z" fill="white" opacity="0.5" />
        <path d="M15 26l-1-7h2l-1 7z" fill="white" opacity="0.5" />
        <polygon points="12,12 18,12 15,18" fill="white" opacity="0.8" />
        <polygon points="12,18 18,18 15,12" fill="#FF3B30" opacity="0.8" />
      </svg>
    ),
  },
  {
    name: "Mail",
    bg: "linear-gradient(180deg, #5AC8FA 0%, #007AFF 100%)",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <rect x="3" y="7" width="22" height="14" rx="2" stroke="white" strokeWidth="1.5" fill="none" />
        <path d="M3 7l11 8 11-8" stroke="white" strokeWidth="1.5" fill="none" />
      </svg>
    ),
  },
  {
    name: "Picnic",
    bg: "#E1002A",
    icon: (
      <span className="text-white text-[10px] font-black leading-[1.1] text-center tracking-wide">
        PIC
        <br />
        NIC
      </span>
    ),
  },
];

/* ─── Full-screen instant-add overlay ─── */
function FullScreenSearch({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const addItem = usePicnicStore((s) => s.addItem);
  const setItemHistory = usePicnicStore((s) => s.setItemHistory);
  const currentUser = usePicnicStore((s) => s.currentUser);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleAdd = async () => {
    const q = query.trim();
    if (!q || searching) return;

    setSearching(true);
    setQuery("");
    try {
      const result = await api.smartSearch(q, currentUser.id);

      if (result.type === "history_match" && result.match) {
        const m = result.match;
        setItemHistory(m.sku, true, "Your usual");
        await addItem(m.sku, m.quantity);
      } else if (result.alternatives.length > 0) {
        const top = result.alternatives[0];
        setItemHistory(top.sku, false, "New pick");
        await addItem(top.sku, 1);
      }
    } catch {
      // ignore
    }
    setSearching(false);
    inputRef.current?.focus();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="absolute inset-0 z-30 flex items-start justify-center pt-[60px] px-[14px]"
      style={{
        background: "rgba(10, 10, 14, 0.92)",
        backdropFilter: "blur(50px) saturate(180%)",
        WebkitBackdropFilter: "blur(50px) saturate(180%)",
      }}
    >
      <div className="flex items-center gap-2 w-full">
        <div className="min-w-0 flex-1 flex items-center gap-2 px-3 py-[9px] rounded-[12px] bg-white/10 border border-white/[0.06]">
          <Search size={14} className="text-white/35 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
            placeholder={searching ? "Adding..." : "Type item name"}
            className="min-w-0 flex-1 bg-transparent text-[15px] text-white placeholder:text-white/25 outline-none"
            style={{ userSelect: "text", WebkitUserSelect: "text" }}
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={!query.trim() || searching}
          className="text-[15px] text-[#30D158] font-medium shrink-0 px-1 disabled:text-white/20"
        >
          Add
        </button>
        <button
          onClick={onClose}
          className="text-[15px] text-[#0A84FF] font-medium shrink-0 pl-1"
        >
          Done
        </button>
      </div>
    </motion.div>
  );
}

export function WidgetHomeScreen() {
  const [showSearch, setShowSearch] = useState(false);

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      {/* ─── iOS 17 Wallpaper ─── */}
      <div className="absolute inset-0">
        {/* Base gradient */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(220deg, #0a0a1a 0%, #0d1b3e 20%, #162454 40%, #1a1040 60%, #2d1b4e 75%, #1a0a2e 100%)",
          }}
        />
        {/* Bloom orbs — mimics iOS 17 dynamic wallpaper */}
        <div
          className="absolute w-[280px] h-[280px] rounded-full opacity-40 blur-[80px]"
          style={{
            background: "radial-gradient(circle, #6366f1 0%, transparent 70%)",
            top: "5%",
            left: "-10%",
          }}
        />
        <div
          className="absolute w-[320px] h-[320px] rounded-full opacity-30 blur-[90px]"
          style={{
            background: "radial-gradient(circle, #ec4899 0%, transparent 70%)",
            top: "25%",
            right: "-15%",
          }}
        />
        <div
          className="absolute w-[250px] h-[250px] rounded-full opacity-25 blur-[70px]"
          style={{
            background: "radial-gradient(circle, #8b5cf6 0%, transparent 70%)",
            bottom: "20%",
            left: "10%",
          }}
        />
        <div
          className="absolute w-[200px] h-[200px] rounded-full opacity-20 blur-[60px]"
          style={{
            background: "radial-gradient(circle, #06b6d4 0%, transparent 70%)",
            bottom: "5%",
            right: "5%",
          }}
        />
        {/* Grain overlay */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E\")",
          }}
        />
      </div>

      {/* ─── Content ─── */}
      <div className="relative z-10 h-full flex flex-col pt-[54px]">
        {/* Spacer below status bar */}
        <div className="h-3" />

        {/* ─── Widget (iOS medium size) ─── */}
        <div className="px-[18px]">
          <CartWidget onLongPress={() => setShowSearch(true)} />
        </div>

        {/* Flexible spacer pushes icons to bottom */}
        <div className="flex-1" />

        {/* ─── App icon grid (bottom) ─── */}
        <div className="px-[26px] mb-3">
          <div className="grid grid-cols-4 gap-x-[18px] gap-y-[18px] justify-items-center">
            {HOME_APPS.map((app) => (
              <AppIcon key={app.name} name={app.name} bg={app.bg}>
                {app.icon}
              </AppIcon>
            ))}
          </div>
        </div>

        {/* ─── Page dots ─── */}
        <div className="flex items-center justify-center gap-[6px] py-1.5">
          <div className="w-[6px] h-[6px] rounded-full bg-white/30" />
          <div className="w-[6px] h-[6px] rounded-full bg-white" />
          <div className="w-[6px] h-[6px] rounded-full bg-white/30" />
        </div>

        {/* ─── Search pill ─── */}
        <div className="flex justify-center mb-2">
          <div className="px-10 py-[7px] rounded-full bg-white/10 backdrop-blur-xl border border-white/[0.08]">
            <span className="text-[15px] text-white/50 font-normal">
              Search
            </span>
          </div>
        </div>

        {/* ─── Dock ─── */}
        <div className="mx-[10px] mb-[5px] px-[14px] py-[12px] rounded-[26px] bg-white/[0.12] backdrop-blur-2xl border border-white/[0.08]">
          <div className="flex justify-around items-center">
            {DOCK_APPS.map((app) => (
              <div
                key={app.name}
                className="w-[60px] h-[60px] rounded-[13.5px] flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.12)]"
                style={{ background: app.bg }}
              >
                {app.icon}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Full-screen search overlay (long press on widget) ─── */}
      <AnimatePresence>
        {showSearch && (
          <FullScreenSearch onClose={() => setShowSearch(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
