"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { usePicnicStore } from "@/lib/store";

// Demo accounts → map to real DB customer IDs
const DEMO_ACCOUNTS: Record<
  string,
  { customerId: string; displayName: string }
> = {
  "michael.weber@picnic.com": {
    customerId: "3fad58a9-49d5-452c-9e77-5683a57ac3b0",
    displayName: "Michael Weber",
  },
  "maria.wolf@picnic.com": {
    customerId: "853acb6d-5e6d-4693-a597-6b691001ae95",
    displayName: "Maria Wolf",
  },
};

export function LoginPage() {
  const login = usePicnicStore((s) => s.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    setError("");
    const account = DEMO_ACCOUNTS[email.toLowerCase().trim()];
    if (!account) {
      setError("Account not found");
      return;
    }
    setLoading(true);
    await login(account.customerId, account.displayName);
    setLoading(false);
  };

  return (
    <div className="h-full flex flex-col bg-[#F8F8FA] pt-[54px]">
      {/* Top section with logo */}
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", duration: 0.6 }}
        >
          <Image
            src="/picnic-logo.png"
            alt="Picnic"
            width={120}
            height={120}
            className="rounded-2xl shadow-lg shadow-red-200"
            style={{ width: 120, height: "auto" }}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-6 text-center"
        >
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">Welcome back</h1>
          <p className="text-base text-[#6B7280] mt-1">
            Sign in to your Picnic account
          </p>
        </motion.div>
      </div>

      {/* Form section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="px-8 pb-16 space-y-4"
      >
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-600 px-1">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError("");
            }}
            placeholder="name@picnic.com"
            className="w-full h-14 px-4 rounded-xl bg-white border border-[#F3F4F6] text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#E1002A]/20 focus:border-[#E1002A] transition-all"
            style={{ userSelect: "text", WebkitUserSelect: "text" }}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-600 px-1">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full h-14 px-4 rounded-xl bg-white border border-[#F3F4F6] text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#E1002A]/20 focus:border-[#E1002A] transition-all"
          />
        </div>

        {error && (
          <p className="text-xs text-red-500 px-1">{error}</p>
        )}

        <button className="text-xs text-[#E1002A] font-bold text-right w-full pr-1">
          Forgot password?
        </button>

        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={handleLogin}
          disabled={!email || loading}
          className={`w-full h-14 rounded-xl font-semibold text-sm shadow-md shadow-red-100 transition-colors ${
            email && !loading
              ? "bg-[#E1002A] text-white hover:brightness-110"
              : "bg-gray-200 text-gray-400 shadow-none cursor-not-allowed"
          }`}
        >
          {loading ? "Signing in..." : "Sign In"}
        </motion.button>

        <p className="text-center text-xs text-gray-400 pt-2">
          Don&apos;t have an account?{" "}
          <button className="text-[#E1002A] font-medium">Sign up</button>
        </p>
      </motion.div>
    </div>
  );
}
