"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { usePicnicStore } from "@/lib/store";

const ACCOUNT_COLORS = ["#E1002A", "#2563EB", "#16A34A", "#D97706", "#7C3AED"];

function nameToEmail(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ".") + "@picnic.com";
}

export function LoginPage() {
  const login            = usePicnicStore((s) => s.login);
  const loadCustomers    = usePicnicStore((s) => s.loadCustomers);
  const availableCustomers = usePicnicStore((s) => s.availableCustomers);

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const handleLogin = async () => {
    setError("");
    const account = availableCustomers.find(
      (c) => nameToEmail(c.name) === email.toLowerCase().trim()
    );
    if (!account) {
      setError("Account not found");
      return;
    }
    setLoading(true);
    await login(account.id, account.name, ACCOUNT_COLORS[availableCustomers.indexOf(account) % ACCOUNT_COLORS.length]);
    setLoading(false);
  };

  return (
    <div className="h-full flex flex-col bg-white pt-[54px]">
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
            className="rounded-2xl shadow-lg"
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-6 text-center"
        >
          <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
          <p className="text-sm text-gray-500 mt-1">
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
          <label className="text-xs font-medium text-gray-600 px-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(""); }}
            placeholder="name@picnic.com"
            className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 outline-none focus:border-[#E1002A]/40 focus:ring-2 focus:ring-[#E1002A]/10 transition-all"
            style={{ userSelect: "text", WebkitUserSelect: "text" }}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-600 px-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 outline-none focus:border-[#E1002A]/40 focus:ring-2 focus:ring-[#E1002A]/10 transition-all"
          />
        </div>

        {error && <p className="text-xs text-red-500 px-1">{error}</p>}

        <button className="text-xs text-[#E1002A] font-medium text-right w-full pr-1">
          Forgot password?
        </button>

        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={handleLogin}
          disabled={!email || loading}
          className={`w-full py-3.5 rounded-xl font-semibold text-sm shadow-lg transition-colors ${
            email && !loading
              ? "bg-[#E1002A] text-white shadow-[#E1002A]/25 hover:bg-[#C8002A]"
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
