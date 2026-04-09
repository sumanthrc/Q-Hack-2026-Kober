"use client";

import { motion } from "framer-motion";
import {
  User,
  Share2,
  Copy,
  LogOut,
  ChevronRight,
  MapPin,
  CreditCard,
  Bell,
  HelpCircle,
} from "lucide-react";
import { usePicnicStore } from "@/lib/store";
import { useState } from "react";
import { UserPlus } from "lucide-react";

export function ProfilePage() {
  const currentUser = usePicnicStore((s) => s.currentUser);
  const logout = usePicnicStore((s) => s.logout);
  const shareCode = usePicnicStore((s) => s.shareCode);
  const sharedCartActive = usePicnicStore((s) => s.sharedCartActive);
  const householdMembers = usePicnicStore((s) => s.householdMembers);
  const toggleSharedCart = usePicnicStore((s) => s.toggleSharedCart);
  const joinHousehold = usePicnicStore((s) => s.joinHousehold);
  const leaveHousehold = usePicnicStore((s) => s.leaveHousehold);
  const [copied, setCopied] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [joinError, setJoinError] = useState("");

  const handleCopy = () => {
    if (shareCode) {
      navigator.clipboard.writeText(shareCode).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setJoining(true);
    setJoinError("");
    try {
      await joinHousehold(joinCode.trim());
      setJoinCode("");
    } catch {
      setJoinError("Invalid code");
    }
    setJoining(false);
  };

  return (
    <div className="absolute inset-0 overflow-y-auto bg-[#F8F8FA]">
      {/* Header */}
      <div className="bg-white/90 backdrop-blur-md px-4 pt-2 pb-4 border-b border-[#F3F4F6]">
        <h1 className="text-lg font-bold text-[#111827] mb-3">Profile</h1>

        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold text-white"
            style={{ backgroundColor: currentUser.color }}
          >
            {currentUser.initials}
          </div>
          <div>
            <p className="text-sm font-semibold text-[#111827]">
              {currentUser.name}
            </p>
            <p className="text-xs text-[#6B7280]">
              {currentUser.name.toLowerCase().replace(" ", ".")}@picnic.app
            </p>
            {householdMembers.length > 1 && (
              <div className="flex items-center gap-1.5 mt-1">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: currentUser.color }}
                />
                <span className="text-[10px] text-gray-400">Your color</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Shared Cart Section */}
      <div className="mx-4 mt-4 rounded-2xl bg-white overflow-hidden shadow-[0_4px_12px_rgba(0,0,0,0.03)]">
        <div className="px-4 py-3 border-b border-[#F3F4F6]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Share2 size={16} className="text-[#E1002A]" />
              <span className="text-sm font-semibold text-[#111827]">
                Shared Cart
              </span>
            </div>
            <button
              onClick={toggleSharedCart}
              className={`relative w-10 h-6 rounded-full transition-colors ${
                sharedCartActive ? "bg-[#E1002A]" : "bg-gray-300"
              }`}
            >
              <motion.div
                animate={{ x: sharedCartActive ? 18 : 2 }}
                className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm"
              />
            </button>
          </div>
        </div>

        {/* Share code */}
        <div className={`px-4 py-3 border-b border-[#F3F4F6] transition-opacity ${sharedCartActive ? "opacity-100" : "opacity-40 pointer-events-none select-none"}`}>
          <p className="text-[10px] font-bold text-[#6B7280] tracking-wider uppercase mb-1.5">
            Share this code to invite household members
          </p>
          <div className="flex items-center gap-2">
            <div className={`flex-1 px-3 py-2 rounded-lg border font-mono text-sm font-bold tracking-wider ${sharedCartActive ? "bg-[#F8F8FA] border-[#F3F4F6] text-[#111827]" : "bg-gray-100 border-gray-200 text-gray-400"}`}>
              {sharedCartActive ? shareCode : "••••••••••"}
            </div>
            <motion.button
              whileTap={sharedCartActive ? { scale: 0.95 } : undefined}
              onClick={sharedCartActive ? handleCopy : undefined}
              className={`p-2 rounded-lg border transition-colors ${sharedCartActive ? "bg-[#F8F8FA] border-[#F3F4F6] text-[#6B7280] hover:text-[#111827]" : "bg-gray-100 border-gray-200 text-gray-300 cursor-not-allowed"}`}
              disabled={!sharedCartActive}
            >
              {copied ? (
                <span className="text-green-500 text-xs font-medium px-0.5">
                  ✓
                </span>
              ) : (
                <Copy size={16} />
              )}
            </motion.button>
          </div>
        </div>

        {/* Members */}
        <div className="px-4 py-3">
          <p className="text-[10px] font-bold text-[#6B7280] tracking-wider uppercase mb-2">
            Household Members
          </p>
          <div className="space-y-2">
            {householdMembers.map((member) => (
              <div key={member.id} className="flex items-center gap-2.5">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 border-white"
                  style={{ backgroundColor: member.color }}
                >
                  {member.initials}
                </div>
                <span className="text-sm text-[#111827] flex-1">{member.name}</span>
                {member.id === currentUser.id && (
                  <span className="bg-[#FFF1F3] text-[#E1002A] text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                    you
                  </span>
                )}
              </div>
            ))}
          </div>
          {householdMembers.length > 1 && (
            <button
              onClick={async () => {
                setLeaving(true);
                await leaveHousehold();
                setLeaving(false);
              }}
              disabled={leaving}
              className="mt-3 w-full py-2 rounded-xl border-2 border-[#E1002A] text-[#E1002A] text-xs font-bold hover:bg-red-50 transition-colors disabled:opacity-40"
            >
              {leaving ? "Leaving..." : "Leave Household"}
            </button>
          )}
        </div>
      </div>

      {/* Join another household */}
      <div className="mx-4 mt-4 rounded-2xl bg-white overflow-hidden shadow-[0_4px_12px_rgba(0,0,0,0.03)]">
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <UserPlus size={16} className="text-[#E1002A]" />
            <span className="text-sm font-semibold text-[#111827]">
              Join a Shared Cart
            </span>
          </div>
          <p className="text-[10px] text-[#6B7280] mb-2">
            Enter a share code from another household member
          </p>
          <div className="space-y-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onPaste={(e) => {
                e.stopPropagation();
                const text = e.clipboardData.getData("text");
                e.preventDefault();
                setJoinCode((prev) => (prev + text).toUpperCase());
              }}
              placeholder="PICNIC-XXXXXX"
              className="w-full px-4 py-3 rounded-xl bg-[#F8F8FA] border-none font-mono text-sm text-[#111827] tracking-wider outline-none focus:ring-2 focus:ring-[#E1002A]/20 select-text"
              style={{ userSelect: "text", WebkitUserSelect: "text" }}
            />
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleJoin}
              disabled={!joinCode.trim() || joining}
              className={`w-full py-3 rounded-xl text-sm font-bold transition-colors ${
                joinCode.trim() && !joining
                  ? "bg-[#E1002A] text-white"
                  : "bg-gray-200 text-gray-400"
              }`}
            >
              {joining ? "Joining..." : "Join"}
            </motion.button>
          </div>
          {joinError && (
            <p className="text-xs text-red-500 mt-1">{joinError}</p>
          )}
        </div>
      </div>

      {/* Settings list */}
      <div className="mx-4 mt-4 rounded-2xl bg-white overflow-hidden shadow-[0_4px_12px_rgba(0,0,0,0.03)]">
        {[
          { icon: MapPin, label: "Delivery Address" },
          { icon: CreditCard, label: "Payment Methods" },
          { icon: Bell, label: "Notifications" },
          { icon: HelpCircle, label: "Help & Support" },
        ].map(({ icon: Icon, label }) => (
          <button
            key={label}
            className="w-full flex items-center gap-3 px-4 py-3 border-b border-[#F3F4F6] last:border-0 hover:bg-gray-50 transition-colors"
          >
            <Icon size={16} className="text-[#6B7280]" />
            <span className="flex-1 text-left text-sm text-[#111827]">
              {label}
            </span>
            <ChevronRight size={14} className="text-[#E5E7EB]" />
          </button>
        ))}
      </div>

      {/* Logout */}
      <div className="mx-4 mt-4 mb-16">
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-[#E1002A] text-[#E1002A] font-extrabold hover:bg-red-50 transition-colors"
        >
          <LogOut size={16} />
          <span className="text-sm">Sign Out</span>
        </motion.button>
      </div>
    </div>
  );
}
