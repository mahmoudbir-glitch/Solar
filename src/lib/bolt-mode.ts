/**
 * The lightning bolt shown on the battery page and in the middle of the home
 * flow diagram follows what the battery is doing: it blinks while the battery
 * charges (yellow from the panels, violet from the grid) and stays still,
 * orange while it feeds the house, red near the reserve and grey at rest.
 */
export type BoltMode = "solar" | "grid" | "discharging" | "low" | "idle";

/** Below this the battery is treated as resting (same 50 W as the flow diagram). */
const IDLE_W = 50;

export function boltMode({ batteryW, solarW, soc, reservePct, live = true }: { batteryW: number; solarW: number; soc: number; reservePct: number; live?: boolean }): BoltMode {
  if (!live || !Number.isFinite(batteryW) || Math.abs(batteryW) < IDLE_W) return "idle";
  // Any real panel output while charging means the sun is filling it; otherwise the grid is.
  if (batteryW > 0) return Number.isFinite(solarW) && solarW >= IDLE_W ? "solar" : "grid";
  return Number.isFinite(soc) && soc <= reservePct + 5 ? "low" : "discharging";
}

export const BOLT_COLORS: Record<BoltMode, { top: string; bottom: string; edge: string }> = {
  solar: { top: "#fde047", bottom: "#eab308", edge: "#a16207" },
  grid: { top: "#c4b5fd", bottom: "#7c3aed", edge: "#5b21b6" },
  discharging: { top: "#fdba74", bottom: "#ea580c", edge: "#9a3412" },
  low: { top: "#fda4af", bottom: "#e11d48", edge: "#9f1239" },
  idle: { top: "#e2e8f0", bottom: "#94a3b8", edge: "#64748b" },
};

export const BOLT_LABELS: Record<BoltMode, string> = {
  solar: "تشحن من الألواح",
  grid: "تشحن من الشبكة",
  discharging: "تغذّي البيت",
  low: "قريبة من الاحتياطي",
  idle: "ثابتة",
};

export const boltBlinks = (mode: BoltMode) => mode === "solar" || mode === "grid";
