"use client";

import { Info, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const WIDTH = 256;
const GUTTER = 12;

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
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLSpanElement>(null);

  // The panel lives on <body> so a card with overflow-hidden can't cut it
  // off; it is placed under the button and kept inside the screen.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const button = buttonRef.current?.getBoundingClientRect();
      if (!button) return;
      const width = Math.min(WIDTH, window.innerWidth - GUTTER * 2);
      const left = Math.min(Math.max(button.left, GUTTER), window.innerWidth - width - GUTTER);
      const height = panelRef.current?.offsetHeight ?? 0;
      let top = button.bottom + 8;
      // Not enough room below: open above the button instead.
      if (height && top + height > window.innerHeight - GUTTER && button.top - 8 - height >= GUTTER) {
        top = button.top - 8 - height;
      }
      setPos({ top, left });
    };
    place();
    // Measure again once the panel has rendered and has a height.
    const frame = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  // Tapping anywhere else closes it.
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <span className="relative inline-flex">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition active:scale-95 hover:bg-slate-50"
      >
        <Info size={15} aria-hidden="true" />
      </button>

      {open &&
        createPortal(
          <span
            ref={panelRef}
            role="dialog"
            aria-label={title}
            dir="rtl"
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: `min(${WIDTH}px, calc(100vw - ${GUTTER * 2}px))` }}
            className="fixed z-[90] block rounded-2xl border border-slate-200 bg-white p-4 text-right shadow-xl"
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
          </span>,
          document.body,
        )}
    </span>
  );
}
