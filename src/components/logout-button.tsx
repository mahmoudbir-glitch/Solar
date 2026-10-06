"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";

export default function LogoutButton(){
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string | null>(null);

  async function logout(){
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("logout_failed");
      }

      // Full navigation ensures the expired session is re-checked by middleware.
      // The AppShell pageshow guard also blocks protected pages restored by Back.
      window.location.replace("/login");
    } catch {
      setLoading(false);
      setError("تعذر تسجيل الخروج. حاول مرة أخرى.");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => void logout()}
        disabled={loading}
        aria-label="تسجيل الخروج"
        className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-slate-500 hover:bg-slate-50 hover:text-red-600 disabled:opacity-50"
      >
        <LogOut size={18}/>
        <span>{loading ? "..." : "تسجيل الخروج"}</span>
      </button>
      {error ? <span className="text-xs font-bold text-red-600" role="alert">{error}</span> : null}
    </div>
  );
}
