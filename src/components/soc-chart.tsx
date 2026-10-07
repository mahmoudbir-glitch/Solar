"use client";

import { SocHourRows } from "@/components/hour-rows";
import { useMemo } from "react";
import type { LoadPoint } from "@/components/load-chart";
import { StatTile, type StatTone } from "@/components/stat-tile";

const HOUR = 3_600_000;

type Bucket = { start: number; soc: number | null; min: number; max: number; powerW: number | null };

/** One bucket per clock hour for the last 24 hours: SOC at the end of the hour, its range and average battery power. */
function hourly(points: LoadPoint[], now: number): Bucket[] {
  const last = Math.floor(now / HOUR) * HOUR;
  const buckets: Bucket[] = Array.from({ length: 24 }, (_, i) => ({ start: last - (23 - i) * HOUR, soc: null, min: 100, max: 0, powerW: null }));
  const power = buckets.map(() => ({ sum: 0, n: 0, lastT: -Infinity }));
  for (const p of points) {
    if (typeof p.soc !== "number") continue;
    const index = 23 - Math.floor((last - Math.floor(p.t / HOUR) * HOUR) / HOUR);
    if (index < 0 || index > 23) continue;
    const b = buckets[index];
    if (p.t >= power[index].lastT) {
      b.soc = p.soc;
      power[index].lastT = p.t;
    }
    b.min = Math.min(b.min, p.soc);
    b.max = Math.max(b.max, p.soc);
    if (typeof p.batteryW === "number") {
      power[index].sum += p.batteryW;
      power[index].n += 1;
    }
  }
  return buckets.map((b, i) => ({ ...b, powerW: power[i].n ? power[i].sum / power[i].n : null }));
}

/**
 * Battery level over the last 24 hours as a row of battery cells — one column
 * per hour, filled to the level at the end of that hour. Cells turn amber near
 * the reserve and rose below it; hours with no readings show a faint dash.
 */
export function SocChart({ points, timeZone, now, reservePct }: { points: LoadPoint[]; timeZone: string; now: number; reservePct: number }) {
  const buckets = useMemo(() => hourly(points, now), [points, now]);

  const known = buckets.filter((b) => b.soc !== null);
  const latest = known.at(-1)?.soc ?? null;
  const low = known.length ? Math.min(...known.map((b) => b.min)) : null;
  const high = known.length ? Math.max(...known.map((b) => b.max)) : null;

  const toneFor = (soc: number | null): StatTone => (soc === null ? "slate" : soc < reservePct ? "rose" : soc < reservePct + 10 ? "amber" : "emerald");
  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v)}%`);
  const change = known.length >= 2 ? (known.at(-1)!.soc as number) - (known[0].soc as number) : null;

  return (
    <div className="space-y-3">
      <div className="grid auto-rows-fr grid-cols-2 gap-3" dir="rtl">
        <StatTile big tone={toneFor(latest)} label="الشحن الآن" value={pct(latest)} />
        <StatTile big tone={toneFor(low)} label="أدنى نسبة" value={pct(low)} />
        <StatTile label="أعلى نسبة" value={pct(high)} />
        <StatTile label="التغيّر خلال 24 ساعة" value={change === null ? "—" : `${change > 0 ? "+" : ""}${Math.round(change)}%`} />
      </div>

      <SocHourRows points={points} timeZone={timeZone} now={now} reservePct={reservePct} />
    </div>
  );
}
