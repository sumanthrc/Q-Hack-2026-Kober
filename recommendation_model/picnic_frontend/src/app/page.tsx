"use client";

import { PhoneFrame } from "@/components/phone-frame";
import { PicnicApp } from "@/components/app/picnic-app";

export default function DemoPage() {
  return (
    <div className="h-dvh bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center px-4">
      <PhoneFrame label="Picnic App">
        <PicnicApp />
      </PhoneFrame>
    </div>
  );
}
