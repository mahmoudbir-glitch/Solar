/**
 * One meaning per color across the battery figures:
 * green = good, amber = watch it, rose = a problem.
 */
export type Tone = "emerald" | "amber" | "rose";

export const toneText: Record<Tone, string> = {
  emerald: "text-emerald-700",
  amber: "text-amber-700",
  rose: "text-rose-700",
};

export const toneTile: Record<Tone, string> = {
  emerald: "bg-emerald-50/70",
  amber: "bg-amber-50/70",
  rose: "bg-rose-50",
};

export const tonePill: Record<Tone, string> = {
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200/70",
  amber: "bg-amber-50 text-amber-700 ring-amber-200/70",
  rose: "bg-rose-50 text-rose-700 ring-rose-200/70",
};

/** How charged the battery is at sunset, the charge it starts the night on. */
export function sunsetTone(pct: number, full = pct >= 100): Tone {
  if (full || pct >= 90) return "emerald";
  return pct >= 50 ? "amber" : "rose";
}
