"use client";

import { useMemo, type ReactNode } from "react";
import type { LoadPoint } from "@/components/load-chart";
import { percentsOf } from "@/lib/energy";

const HOUR = 3_600_000;

type Part = { key: string; label: string; kwh: number; bar: string; dot: string; text: string };

/**
 * One line split into parts, the same look as "أين تذهب شمس هذا اليوم" on
 * the forecast. Each source keeps its colour across the app: sun amber,
 * battery emerald, home sky, grid violet.
 */
function SplitBar({ title, parts, footer }: { title: string; parts: Part[]; footer?: ReactNode }) {
  const total = parts.reduce((sum, part) => sum + part.kwh, 0);
  if (total < 0.05) return null;
  // The three percentages always add up to 100.
  const pcts = percentsOf(parts.map((part) => part.kwh));
  const shown = parts.map((part, i) => ({ ...part, pct: pcts[i] }));
  return (
    <div dir="rtl">
      <p className="text-[11px] font-black text-slate-500">{title}</p>
      <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-slate-100" aria-label={title}>
        {shown.map((part) => <div key={part.key} className={part.bar} style={{ width: (part.kwh / total) * 100 + "%" }} />)}
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-2">
        {shown.map((part) => (
          <div key={part.key} className="min-w-0">
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500"><span className={"h-2 w-2 shrink-0 rounded-full " + part.dot} />{part.label}</span>
            <strong className={"mt-0.5 block text-sm font-black " + part.text}><bdi dir="ltr">{part.kwh.toFixed(1)} kWh</bdi></strong>
            <span className="text-[10px] font-bold text-slate-400"><bdi dir="ltr">{part.pct}%</bdi></span>
          </div>
        ))}
      </div>
      {footer}
    </div>
  );
}

/**
 * Energy over the last 24 hours, reading by reading. Battery power is
 * positive while charging. The house takes the sun first, then the battery,
 * and the grid covers the rest; the battery charges from spare sun first,
 * and from the grid for the rest. Gaps over 15 minutes are skipped rather
 * than filled in.
 */
function totals(points: LoadPoint[], now: number) {
  const from = now - 24 * HOUR;
  const sorted = points.filter((p) => p.t >= from && p.t <= now).sort((a, b) => a.t - b.t);
  const sum = { homeSun: 0, homeBattery: 0, homeGrid: 0, chargeSun: 0, chargeGrid: 0 };
  for (let i = 1; i < sorted.length; i++) {
    const hours = (sorted[i].t - sorted[i - 1].t) / HOUR;
    if (hours <= 0 || hours > 0.25) continue;
    const p = sorted[i - 1];
    const load = Math.max(0, p.loadW);
    const solar = Math.max(0, p.solarW);
    const battery = p.batteryW ?? 0;
    const charge = Math.max(0, battery);
    const discharge = Math.max(0, -battery);

    const homeSun = Math.min(load, solar);
    const homeBattery = Math.min(load - homeSun, discharge);
    const homeGrid = load - homeSun - homeBattery;
    const chargeSun = Math.min(charge, Math.max(0, solar - homeSun));
    const chargeGrid = charge - chargeSun;

    sum.homeSun += homeSun * hours;
    sum.homeBattery += homeBattery * hours;
    sum.homeGrid += homeGrid * hours;
    sum.chargeSun += chargeSun * hours;
    sum.chargeGrid += chargeGrid * hours;
  }
  return {
    homeSun: sum.homeSun / 1000,
    homeBattery: sum.homeBattery / 1000,
    homeGrid: sum.homeGrid / 1000,
    chargeSun: sum.chargeSun / 1000,
    chargeGrid: sum.chargeGrid / 1000,
  };
}

const SUN = { bar: "bg-amber-400", dot: "bg-amber-400", text: "text-amber-700" };
const BATTERY = { bar: "bg-emerald-500", dot: "bg-emerald-500", text: "text-emerald-700" };
const HOME = { bar: "bg-sky-500", dot: "bg-sky-500", text: "text-sky-700" };
const GRID = { bar: "bg-violet-500", dot: "bg-violet-500", text: "text-violet-700" };

/** Where the house's electricity came from over the last 24 hours. */
export function HomeSourceSplit({ points, now }: { points: LoadPoint[]; now: number }) {
  const t = useMemo(() => totals(points, now), [points, now]);
  return (
    <SplitBar
      title="من أين جاءت كهرباء البيت"
      parts={[
        { key: "sun", label: "من الشمس", kwh: t.homeSun, ...SUN },
        { key: "battery", label: "من البطارية", kwh: t.homeBattery, ...BATTERY },
        { key: "grid", label: "من الشبكة", kwh: t.homeGrid, ...GRID },
      ]}
    />
  );
}

/** How the battery was charged and how much it gave the house over the last 24 hours. */
export function BatteryFlowSplit({ points, now }: { points: LoadPoint[]; now: number }) {
  const t = useMemo(() => totals(points, now), [points, now]);
  return (
    <SplitBar
      title="حركة البطارية"
      parts={[
        { key: "sun", label: "شحن من الشمس", kwh: t.chargeSun, ...SUN },
        { key: "grid", label: "شحن من الشبكة", kwh: t.chargeGrid, ...GRID },
        { key: "home", label: "أعطت البيت", kwh: t.homeBattery, ...HOME },
      ]}
    />
  );
}
