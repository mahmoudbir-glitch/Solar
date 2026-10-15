"use client";

import React, { useCallback, useEffect, useState } from "react";
import { startVisiblePolling } from "@/lib/visible-polling";

const REFRESH_MS = 30_000;

type Status = { kind: "loading" } | { kind: "live" | "stale"; at: Date } | { kind: "none" };

/**
 * المصدر الوحيد لحالة الاتصال في التطبيق: نقطة خضراء (مباشر)، صفراء (القراءة
 * متأخرة)، حمراء (لا توجد قراءة). يحلّ محلّ الشارات المتفرقة في الصفحات.
 */
export function StatusBar({ compact = false }: { compact?: boolean } = {}) {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/telemetry", { cache: "no-store" });
      const data = response.ok ? await response.json() : null;
      if (!data || data.source !== "live" || !data.timestamp) return setStatus({ kind: "none" });
      setStatus({ kind: data.stale ? "stale" : "live", at: new Date(data.timestamp) });
    } catch {
      setStatus({ kind: "none" });
    }
  }, []);

  useEffect(() => {
    void load();
    return startVisiblePolling(() => void load(), REFRESH_MS);
  }, [load]);

  if (status.kind === "loading") return null;

  const time = "at" in status ? status.at.toLocaleTimeString("ar-LB-u-nu-latn", { hour: "2-digit", minute: "2-digit" }) : "";
  const view = {
    live: { dot: "bg-emerald-500", text: "text-emerald-700", label: `مباشر · آخر قراءة ${time}` },
    stale: { dot: "bg-amber-500", text: "text-amber-700", label: `القراءة متأخرة · آخر قراءة ${time}` },
    none: { dot: "bg-rose-500", text: "text-rose-700", label: "لا توجد قراءة من الإنفرتر" },
  }[status.kind];

  // In the coloured top bar: just a steady dot, green (live), yellow (late) or red (no reading).
  // The words stay available to screen readers and as a tooltip.
  if (compact) {
    const dot = { live: "bg-emerald-400", stale: "bg-amber-300", none: "bg-rose-500" }[status.kind];
    return (
      <span role="status" title={view.label} className="inline-flex shrink-0 items-center">
        <span className={"h-2.5 w-2.5 rounded-full ring-2 ring-white/80 " + dot} aria-hidden="true" />
        <span className="sr-only">{view.label}</span>
      </span>
    );
  }

  return (
    <div role="status" className={"flex items-center gap-2 text-[11px] font-black " + view.text}>
      <span className={"h-2 w-2 shrink-0 rounded-full " + view.dot + (status.kind === "live" ? " animate-pulse" : "")} aria-hidden="true" />
      {view.label}
    </div>
  );
}
