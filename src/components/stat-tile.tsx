import React from "react";
import { AmpPill } from "@/components/amp-pill";

const TONES = {
  amber: { bg: "bg-amber-50", text: "text-amber-700" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-700" },
  sky: { bg: "bg-sky-50", text: "text-sky-700" },
  rose: { bg: "bg-rose-50", text: "text-rose-700" },
  slate: { bg: "bg-slate-50", text: "text-slate-900" },
} as const;

export type StatTone = keyof typeof TONES;

/**
 * The summary tile: a small grey label on top, one bold value, and the amps
 * capsule with its note under it pinned to the bottom. Every tile has the same
 * anatomy and fills its grid cell, so a row (or a 2x2 block inside
 * `auto-rows-fr`) lines up label with label, value with value, foot with foot.
 * `big` tiles are tinted to lead; the value is the same size on all of them.
 */
export function StatTile({ label, value, unit, tone = "slate", big = false, amps, ampTone, ampUnit = "A", hint, card = false }: { label: string; value: string; unit?: string; tone?: StatTone; big?: boolean; amps?: number | null; ampTone?: "sky" | "amber" | "emerald" | "violet"; ampUnit?: "A" | "Ah"; hint?: React.ReactNode; card?: boolean }) {
  const t = TONES[tone];
  // `card`: a standalone tile on the page background (white card), otherwise a tinted box inside a card.
  return (
    <div className={"flex h-full min-w-0 flex-col p-4 " + (card ? "energy-card" : `rounded-2xl ${big ? t.bg : "bg-slate-50"}`)}>
      <span className="truncate text-xs font-bold text-slate-500">{label}</span>
      <strong className={`mt-1.5 block whitespace-nowrap text-2xl font-black leading-8 ${t.text}`}>
        {unit && /^[A-Za-z]/.test(unit) ? (
          // Latin units (kW) stay after the number: "1.34 kW", not "kW 1.34".
          <bdi dir="ltr">{value}<small className="text-sm"> {unit}</small></bdi>
        ) : (
          <>
            <bdi dir="ltr">{value}</bdi>
            {unit && <small className="text-sm"> {unit}</small>}
          </>
        )}
      </strong>
      {(ampTone || hint) && (
        <span className="mt-auto flex flex-col items-start gap-1.5 pt-2.5">
          {ampTone && <AmpPill tone={ampTone} amps={amps} unit={ampUnit} />}
          {hint && <span className="block max-w-full truncate text-[11px] font-semibold leading-4 text-slate-400">{hint}</span>}
        </span>
      )}
    </div>
  );
}
