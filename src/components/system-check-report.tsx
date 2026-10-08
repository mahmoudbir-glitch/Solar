import React from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, XCircle } from "lucide-react";
import type { CheckGroup, CheckReport, CheckStatus } from "@/lib/system-check";

const GROUPS: Array<[CheckGroup, string]> = [
  ["inputs", "القيم الداخلة من الإنفرتر"],
  ["kw", "التحويل إلى kW"],
  ["amps", "الأمبير وطريقة حسابه"],
  ["calc", "الحسابات والتوازن"],
  ["ui", "الأيقونات والبطاقات المنسدلة"],
];

const STATUS: Record<CheckStatus, { icon: typeof CheckCircle2; className: string; text: string }> = {
  pass: { icon: CheckCircle2, className: "text-emerald-600", text: "سليم" },
  warn: { icon: AlertTriangle, className: "text-amber-600", text: "تنبيه" },
  fail: { icon: XCircle, className: "text-rose-600", text: "خطأ" },
};

/** Result of the value/maths/UI self-check, one drop-down per group. */
export function SystemCheckReport({ report }: { report: CheckReport }) {
  return (
    <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-black text-slate-900">فحص القيم والحسابات</h4>
        <div className="flex gap-2 text-[11px] font-black">
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">سليم {report.counts.pass}</span>
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">تنبيه {report.counts.warn}</span>
          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-700">خطأ {report.counts.fail}</span>
        </div>
      </div>
      {GROUPS.map(([group, title]) => {
        const items = report.items.filter((item) => item.group === group);
        if (!items.length) return null;
        const worst: CheckStatus = items.some((i) => i.status === "fail") ? "fail" : items.some((i) => i.status === "warn") ? "warn" : "pass";
        const Worst = STATUS[worst].icon;
        return (
          <details key={group} open={worst !== "pass"} className="group rounded-xl border border-slate-100 bg-slate-50/70">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-black text-slate-800 [&::-webkit-details-marker]:hidden">
              <Worst className={"h-4 w-4 shrink-0 " + STATUS[worst].className} aria-hidden="true" />
              <span className="flex-1">{title}</span>
              <span className="text-[10px] font-bold text-slate-400">{items.length}</span>
              <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" aria-hidden="true" />
            </summary>
            <ul className="space-y-1.5 px-3 pb-3">
              {items.map((item) => {
                const Icon = STATUS[item.status].icon;
                return (
                  <li key={item.id} className="flex gap-2 text-[11px] leading-5">
                    <Icon className={"mt-0.5 h-3.5 w-3.5 shrink-0 " + STATUS[item.status].className} aria-label={STATUS[item.status].text} />
                    <span><b className="font-black text-slate-700">{item.label}:</b> <span className="font-semibold text-slate-600">{item.detail}</span></span>
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
