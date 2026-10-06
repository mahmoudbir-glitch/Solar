"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Shown instead of a blank page when something on a page fails to render. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[ui] page_error", error);
  }, [error]);

  return (
    <div dir="rtl" className="energy-card mx-auto mt-6 max-w-md space-y-3 p-6 text-center">
      <div className="text-3xl" aria-hidden="true">⚠️</div>
      <h1 className="text-lg font-black text-slate-900">حدث خطأ أثناء عرض هذه الصفحة</h1>
      <p className="text-sm font-semibold leading-6 text-slate-500">بياناتك محفوظة ولم يتأثر شيء. جرّب إعادة التحميل، وإن تكرر الأمر فانتقل إلى صفحة أخرى ثم عُد.</p>
      <div className="flex justify-center gap-2 pt-1">
        <button type="button" onClick={reset} className="min-h-11 rounded-xl bg-slate-900 px-5 text-sm font-black text-white">إعادة المحاولة</button>
        <Link href="/" className="flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700">الرئيسية</Link>
      </div>
    </div>
  );
}
