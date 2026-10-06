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

/** ترويسة موحّدة لصفحات التطبيق: أيقونة + عنوان صغير + عنوان رئيسي + وصف + عنصر جانبي اختياري. */
export function PageHeader({ icon: Icon, eyebrow, title, subtitle, tone = "amber", right }: { icon: LucideIcon; eyebrow: string; title: string; subtitle?: string; tone?: keyof typeof TONES; right?: React.ReactNode }) {
  const t = TONES[tone];
  return (
    <header className="energy-card flex items-start gap-3 p-4 sm:p-5">
      <div className={"flex h-11 w-11 shrink-0 items-center justify-center rounded-full ring-1 " + t.box}><Icon className="h-5 w-5" aria-hidden="true" /></div>
      <div className="min-w-0 flex-1">
        <p className={"text-[11px] font-black " + t.eyebrow}>{eyebrow}</p>
        <h1 className="mt-0.5 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}
