"use client";

import { PhoneFrame } from "@/components/phone-frame";
import { WidgetHomeScreen } from "@/components/widget/widget-home-screen";
import { PicnicApp } from "@/components/app/picnic-app";

export default function DemoPage() {
  return (
    <div className="h-dvh flex items-center justify-center gap-6 md:gap-10 px-4" style={{ background: "linear-gradient(180deg, #0a0a12 0%, #0d0b1e 25%, #0f1a2a 50%, #0a1e22 75%, #0b1a1e 100%)" }}>
      <PhoneFrame label="Home Screen Widget" statusBarVariant="light">
        <WidgetHomeScreen />
      </PhoneFrame>
      <PhoneFrame label="Picnic App">
        <PicnicApp />
      </PhoneFrame>
    </div>
  );
}
