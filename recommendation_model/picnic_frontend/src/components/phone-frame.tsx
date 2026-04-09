"use client";

import { ReactNode, useState, useEffect, useCallback } from "react";

interface PhoneFrameProps {
  children: ReactNode;
  label?: string;
  statusBarVariant?: "light" | "dark";
}

const PHONE_W = 393;
const PHONE_H = 852;
const LABEL_H = 36; // label + gap

export function PhoneFrame({
  children,
  label,
  statusBarVariant = "dark",
}: PhoneFrameProps) {
  const textColor =
    statusBarVariant === "light" ? "text-white" : "text-black";

  const [scale, setScale] = useState(1);

  const updateScale = useCallback(() => {
    const availH = window.innerHeight * 0.9;
    const availW = window.innerWidth * 0.85;
    const scaleH = availH / (PHONE_H + LABEL_H);
    const scaleW = availW / PHONE_W;
    setScale(Math.min(1, scaleH, scaleW));
  }, []);

  useEffect(() => {
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, [updateScale]);

  return (
    <div
      className="flex flex-col items-center gap-3"
      style={{
        width: PHONE_W * scale,
        height: (PHONE_H + LABEL_H) * scale,
      }}
    >
      <div
        className="flex flex-col items-center gap-3 origin-top"
        style={{ transform: `scale(${scale})` }}
      >
        {label && (
          <span className="text-sm font-medium text-white/70 tracking-wide uppercase">
            {label}
          </span>
        )}
      {/* iPhone 15 Pro frame */}
      <div className="relative w-[393px] h-[852px]">
        {/* Titanium frame */}
        <div className="absolute inset-0 rounded-[60px] bg-gradient-to-b from-[#2a2a2e] via-[#1d1d1f] to-[#2a2a2e] shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_20px_60px_rgba(0,0,0,0.5)]" />

        {/* Side buttons */}
        {/* Silent switch */}
        <div className="absolute left-[-2.5px] top-[142px] w-[3px] h-[30px] rounded-l-sm bg-[#3a3a3c]" />
        {/* Volume up */}
        <div className="absolute left-[-2.5px] top-[192px] w-[3px] h-[50px] rounded-l-sm bg-[#3a3a3c]" />
        {/* Volume down */}
        <div className="absolute left-[-2.5px] top-[252px] w-[3px] h-[50px] rounded-l-sm bg-[#3a3a3c]" />
        {/* Power */}
        <div className="absolute right-[-2.5px] top-[212px] w-[3px] h-[76px] rounded-r-sm bg-[#3a3a3c]" />

        {/* Screen bezel */}
        <div className="absolute inset-[10px] rounded-[50px] bg-black" />

        {/* Screen */}
        <div className="absolute inset-[11px] rounded-[49px] overflow-hidden">
          {/* Status bar — always on top, pointer-events-none so inputs underneath work */}
          <div
            className={`absolute top-0 left-0 right-0 z-50 h-[54px] flex items-end justify-between px-10 pb-1 pointer-events-none ${textColor}`}
          >
            <span className="text-[15px] font-semibold tracking-tight">
              9:41
            </span>
            <div className="flex items-center gap-[5px]">
              {/* Cellular */}
              <svg
                width="18"
                height="12"
                viewBox="0 0 18 12"
                fill="currentColor"
              >
                <rect x="0" y="8" width="3" height="4" rx="0.5" opacity="0.3" />
                <rect
                  x="4.5"
                  y="5.5"
                  width="3"
                  height="6.5"
                  rx="0.5"
                  opacity="0.5"
                />
                <rect x="9" y="3" width="3" height="9" rx="0.5" opacity="0.7" />
                <rect x="13.5" y="0" width="3" height="12" rx="0.5" />
              </svg>
              {/* WiFi */}
              <svg
                width="16"
                height="12"
                viewBox="0 0 16 12"
                fill="currentColor"
              >
                <path
                  d="M8 3.6C6 3.6 4.2 4.4 2.8 5.8L1.4 4.4C3.2 2.6 5.5 1.6 8 1.6s4.8 1 6.6 2.8L13.2 5.8C11.8 4.4 10 3.6 8 3.6z"
                  opacity="0.4"
                />
                <path
                  d="M8 6.4C6.8 6.4 5.6 6.9 4.7 7.8L3.3 6.4C4.6 5.1 6.2 4.4 8 4.4s3.4.7 4.7 2L11.3 7.8C10.4 6.9 9.2 6.4 8 6.4z"
                  opacity="0.7"
                />
                <path d="M8 9.2c-.6 0-1.2.3-1.7.8L8 11.6l1.7-1.6C9.2 9.5 8.6 9.2 8 9.2z" />
              </svg>
              {/* Battery */}
              <svg
                width="27"
                height="13"
                viewBox="0 0 27 13"
                fill="none"
              >
                <rect
                  x="0.5"
                  y="0.5"
                  width="22"
                  height="12"
                  rx="3"
                  stroke="currentColor"
                  strokeOpacity="0.35"
                />
                <rect
                  x="2"
                  y="2"
                  width="17"
                  height="9"
                  rx="1.5"
                  fill="currentColor"
                />
                <path
                  d="M24 4.5C24.8 4.9 25.5 5.6 25.5 6.5s-.7 1.6-1.5 2V4.5z"
                  fill="currentColor"
                  opacity="0.4"
                />
              </svg>
            </div>
          </div>

          {/* Dynamic Island */}
          <div className="absolute top-[11px] left-1/2 -translate-x-1/2 z-50 w-[126px] h-[37px] bg-black rounded-full pointer-events-none" />

          {/* Content */}
          <div className="h-full w-full">{children}</div>

          {/* Home indicator */}
          <div className="absolute bottom-[8px] left-1/2 -translate-x-1/2 w-[139px] h-[5px] rounded-full z-50 bg-white/30 mix-blend-difference pointer-events-none" />
        </div>
      </div>
      </div>
    </div>
  );
}
