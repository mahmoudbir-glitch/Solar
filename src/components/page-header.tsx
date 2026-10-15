import React from "react";
import type { LucideIcon } from "lucide-react";

/** لون لكل صفحة حسب وظيفتها: الطاقة كهرماني، البطارية زمردي، المنزل سماوي، المال فيروزي، الإعدادات رمادي. */
const TONES = {
  amber: { box: "bg-amber-50 text-amber-600 ring-amber-200/70", eyebrow: "text-amber-600" },
  emerald: { box: "bg-emerald-50 text-emerald-600 ring-emerald-200/70", eyebrow: "text-emerald-600" },
  sky: { box: "bg-sky-50 text-sky-600 ring-sky-200/70", eyebrow: "text-sky-600" },
  teal: { box: "bg-teal-50 text-teal-600 ring-teal-200/70", eyebrow: "text-teal-600" },
  slate: { box: "bg-slate-100 text-slate-600 ring-slate-200/70", eyebrow: "text-slate-500" },
  rose: { box: "bg-rose-50 text-rose-500 ring-rose-200/70", eyebrow: "text-rose-500" },
} as const;

/**
 * ترويسة الصفحة: العنوان صار في الشريط العلوي الملوّن بلون الصفحة، فتبقى هنا
 * جملة الوصف وزر جانبي اختياري فقط (والعنوان مخفي لقارئات الشاشة).
 */
export function PageHeader({ title, subtitle, right }: { icon?: LucideIcon; eyebrow?: string; title: string; subtitle?: string; tone?: keyof typeof TONES; right?: React.ReactNode }) {
  return (
    <header className="flex min-h-9 items-center justify-between gap-3 px-1">
      <h1 className="sr-only">{title}</h1>
      {subtitle ? <p className="min-w-0 text-xs font-semibold leading-5 text-slate-500">{subtitle}</p> : <span />}
      {right}
    </header>
  );
}
