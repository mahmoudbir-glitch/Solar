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
 * The summary tile used on the energy page: a tinted rounded box with a small
 * grey label and a bold value. `big` tiles (text-2xl) lead; plain slate tiles
 * (text-lg) carry the secondary numbers.
 */
export function StatTile({ label, value, unit, tone = "slate", big = false, amps, ampTone, ampUnit = "A", hint, card = false, center = false }: { label: string; value: string; unit?: string; tone?: StatTone; big?: boolean; amps?: number | null; ampTone?: "sky" | "amber" | "emerald" | "violet"; ampUnit?: "A" | "Ah"; hint?: React.ReactNode; card?: boolean; center?: boolean }) {
  const t = TONES[tone];
  // `card`: a standalone tile on the page background (white card), otherwise a tinted box inside a card.
  // `center`: compact, centred tile that fills its grid cell, so a row of tiles keeps one height.
  const layout = center ? "flex h-full flex-col items-center px-2 py-3.5 text-center" : "";
  return (
    <div className={(card ? `energy-card h-full ${center ? "" : "p-4"}` : `rounded-2xl ${center ? "" : "p-4"} ${t.bg}`) + " " + layout}>
      <span className="text-xs font-bold text-slate-500">{label}</span>
      <strong className={`mt-1 block whitespace-nowrap font-black ${big ? "text-2xl" : "text-lg"} ${t.text}`}>
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
      {ampTone && <span className="mt-1.5 block"><AmpPill tone={ampTone} amps={amps} unit={ampUnit} /></span>}
      {hint && <span className="mt-1.5 block text-[11px] font-semibold leading-4 text-slate-400">{hint}</span>}
    </div>
  );
}
