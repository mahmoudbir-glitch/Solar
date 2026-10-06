"use client";

import React, { useState } from "react";
import { Eye, EyeOff, Lock, User } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { safeNextPath } from "@/lib/safe-redirect";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const username = String(form.get("username") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const nextParam = searchParams.get("next");
    const next = safeNextPath(nextParam);
    let succeeded = false;

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ username, password, next }),
      });

      let data: { error?: string; redirectTo?: string } = {};
      try {
        data = (await response.json()) as { error?: string; redirectTo?: string };
      } catch {
        data = {};
      }

      if (!response.ok) {
        const messages: Record<string, string> = {
          missing_credentials: "أدخل اسم المستخدم وكلمة المرور.",
          invalid_username: "اسم المستخدم غير موجود.",
          invalid_password: "كلمة المرور غير صحيحة.",
          invalid_credentials: "اسم المستخدم أو كلمة المرور غير صحيحة.",
          auth_not_configured: "إعدادات تسجيل الدخول غير مكتملة على الخادم. تأكد من SOLAR_AUTH_USERNAME و SOLAR_AUTH_PASSWORD و SOLAR_AUTH_SECRET في Vercel.",
          too_many_attempts: "تم تجاوز عدد محاولات الدخول. حاول بعد 10 دقائق.",
          session_creation_failed: "تم التحقق من البيانات لكن تعذر إنشاء الجلسة. تحقق من إعداد AUTH_SECRET في Vercel.",
          invalid_json: "تعذر قراءة طلب تسجيل الدخول.",
        };
        setError(messages[data.error ?? ""] ?? `فشل تسجيل الدخول (HTTP ${response.status}).`);
        return;
      }

      const redirectTo = safeNextPath(data.redirectTo || next);
      // Keep the button busy until the new page takes over, so a second tap
      // does not post the login again.
      succeeded = true;
      router.replace(redirectTo);
      router.refresh();
    } catch {
      setError("تعذر الوصول إلى خادم تسجيل الدخول. تحقق من اتصال الإنترنت ثم حاول مجددًا.");
    } finally {
      if (!succeeded) setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} dir="rtl" className="w-full space-y-3" noValidate={false}>
      <div className="relative">
        <User size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          name="username"
          type="text"
          placeholder="اسم مستخدم Solar"
          aria-label="اسم مستخدم Solar"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          disabled={loading}
          className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-12 text-right text-sm font-semibold text-slate-800 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-100 disabled:opacity-60"
        />
      </div>

      <div className="relative">
        <Lock size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          name="password"
          type={showPassword ? "text" : "password"}
          placeholder="كلمة المرور"
          aria-label="كلمة المرور"
          autoComplete="current-password"
          required
          disabled={loading}
          className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-12 text-right text-sm font-semibold text-slate-800 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-100 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => setShowPassword((value) => !value)}
          disabled={loading}
          aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
          className="absolute left-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-600 disabled:opacity-50"
        >
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>

      {error && (
        <div role="alert" aria-live="polite" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold leading-6 text-rose-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="!mt-5 h-12 w-full rounded-2xl bg-slate-900 text-sm font-black text-white shadow-[0_8px_20px_rgba(82,55,38,0.18)] transition hover:bg-slate-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "جاري تسجيل الدخول..." : "تسجيل الدخول"}
      </button>
    </form>
  );
}
