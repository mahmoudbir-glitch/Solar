"use client";

import { HomeHourRows } from "@/components/hour-rows";
import { useMemo } from "react";
import { StatTile } from "@/components/stat-tile";
import { AC_VOLTS } from "@/lib/energy";

export type LoadPoint = { t: number; loadW: number; solarW: number; soc?: number; batteryW?: number };

const HOUR = 3_600_000;

type Bucket = { start: number; homeW: number | null; solarW: number | null; samples: number };

/** Average power per clock hour for the last 24 hours (null = no readings that hour). */
function hourly(points: LoadPoint[], now: number): Bucket[] {
  const last = Math.floor(now / HOUR) * HOUR;
  const buckets: Bucket[] = Array.from({ length: 24 }, (_, i) => ({ start: last - (23 - i) * HOUR, homeW: null, solarW: null, samples: 0 }));
  const sums = buckets.map(() => ({ home: 0, solar: 0, n: 0 }));
  for (const p of points) {
    const index = 23 - Math.floor((last - Math.floor(p.t / HOUR) * HOUR) / HOUR);
    if (index < 0 || index > 23) continue;
    sums[index].home += Math.max(0, p.loadW);
    sums[index].solar += Math.max(0, p.solarW);
    sums[index].n += 1;
  }
  return buckets.map((b, i) => (sums[i].n ? { ...b, homeW: sums[i].home / sums[i].n, solarW: sums[i].solar / sums[i].n, samples: sums[i].n } : b));
}

const kw = (w: number) => (w / 1000).toFixed(w >= 10_000 ? 0 : 2);

/**
 * Last 24 hours: energy and busiest-hour tiles, then the house hour by hour,
 * one coloured line per hour split by where its power came from.
 */
export function LoadChart({ points, timeZone, now }: { points: LoadPoint[]; timeZone: string; now: number }) {
  const buckets = useMemo(() => hourly(points, now), [points, now]);

  // Energy actually recorded: integrate between consecutive readings (as the
  // daily totals do) and skip gaps over 15 minutes instead of inventing energy.
  const { homeKWh, solarKWh } = useMemo(() => {
    const from = now - 24 * HOUR;
    const sorted = points.filter((p) => p.t >= from && p.t <= now).sort((a, b) => a.t - b.t);
    let home = 0;
    let solar = 0;
    for (let i = 1; i < sorted.length; i++) {
      const hours = (sorted[i].t - sorted[i - 1].t) / HOUR;
      if (hours <= 0 || hours > 0.25) continue;
      home += ((Math.max(0, sorted[i].loadW) + Math.max(0, sorted[i - 1].loadW)) / 2) * hours;
      solar += ((Math.max(0, sorted[i].solarW) + Math.max(0, sorted[i - 1].solarW)) / 2) * hours;
    }
    return { homeKWh: home / 1000, solarKWh: solar / 1000 };
  }, [points, now]);

  const homes = buckets.filter((b) => b.homeW !== null).map((b) => b.homeW as number);
  const peakHomeW = homes.length ? Math.max(...homes) : null;
  const solars = buckets.filter((b) => b.solarW !== null).map((b) => b.solarW as number);
  const peakSolarW = solars.length ? Math.max(...solars) : null;

  return (
    <div className="space-y-3">
      <div className="grid auto-rows-fr grid-cols-2 gap-3" dir="rtl">
        <StatTile big tone="sky" label="استهلاك المنزل" value={homeKWh.toFixed(1)} unit="kWh" ampTone="sky" ampUnit="Ah" amps={(homeKWh * 1000) / AC_VOLTS} />
        <StatTile big tone="amber" label="الإنتاج الشمسي" value={solarKWh.toFixed(1)} unit="kWh" ampTone="amber" ampUnit="Ah" amps={(solarKWh * 1000) / AC_VOLTS} />
        {/* Hourly averages, unlike the instant "أعلى حمل اليوم" tile above, so named apart. */}
        <StatTile label="أعلى ساعة استهلاك" value={peakHomeW === null ? "—" : kw(peakHomeW)} unit="kW" ampTone="sky" amps={peakHomeW === null ? null : peakHomeW / AC_VOLTS} />
        <StatTile label="أعلى ساعة إنتاج" value={peakSolarW === null ? "—" : kw(peakSolarW)} unit="kW" ampTone="amber" amps={peakSolarW === null ? null : peakSolarW / AC_VOLTS} />
      </div>

      <HomeHourRows points={points} timeZone={timeZone} now={now} />
    </div>
  );
}
