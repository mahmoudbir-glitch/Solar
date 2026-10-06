"use client";

import { Info, X } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

export function InfoTip({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition active:scale-95 hover:bg-slate-50"
      >
        <Info size={15} aria-hidden="true" />
      </button>

      {open && (
        <span
          role="dialog"
          aria-label={title}
          className="absolute left-0 top-9 z-[70] w-64 rounded-2xl border border-slate-200 bg-white p-4 text-right shadow-xl"
        >
          <span className="flex items-start justify-between gap-3">
            <strong className="text-sm font-black text-slate-900">{title}</strong>
            <button
              type="button"
              aria-label="إغلاق الشرح"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1 text-slate-400 transition active:scale-95 hover:bg-slate-100"
            >
              <X size={15} aria-hidden="true" />
            </button>
          </span>
          <span className="mt-2 block text-xs font-semibold leading-6 text-slate-600">{children}</span>
        </span>
      )}
    </span>
  );
}
