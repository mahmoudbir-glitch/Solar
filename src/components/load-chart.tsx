"use client";

import React, { useMemo, useState } from "react";
import { StatTile } from "@/components/stat-tile";
import { AC_VOLTS } from "@/lib/energy";
import { AmpPill } from "@/components/amp-pill";

export type LoadPoint = { t: number; loadW: number; solarW: number; soc?: number; batteryW?: number };

const HOUR = 3_600_000;
const W = 640;
const H = 200;
const PAD = { top: 10, right: 6, bottom: 26, left: 46 };
const SOLAR = "#d99a2b"; // amber: the app's solar colour
const HOME = "#c8795a"; // sky: the app's home colour

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

function niceMax(w: number) {
  const kw = Math.max(0.5, w / 1000);
  const step = kw <= 1 ? 0.25 : kw <= 3 ? 0.5 : kw <= 6 ? 1 : 2;
  return Math.ceil(kw / step) * step * 1000;
}

const kw = (w: number) => (w / 1000).toFixed(w >= 10_000 ? 0 : 2);

/**
 * Last 24 hours as one column pair per hour: solar production (amber) beside
 * home consumption (sky). Hours without readings show a faint dash instead of
 * a broken line, and tapping a column shows that hour's numbers.
 */
export function LoadChart({ points, timeZone, now }: { points: LoadPoint[]; timeZone: string; now: number }) {
  const [active, setActive] = useState<number | null>(null);
  const buckets = useMemo(() => hourly(points, now), [points, now]);
  const maxW = niceMax(Math.max(1, ...buckets.map((b) => Math.max(b.homeW ?? 0, b.solarW ?? 0))));
  const hourFmt = useMemo(() => new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hourCycle: "h23" }), [timeZone]);
  const labelFmt = useMemo(() => new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }), [timeZone]);

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / 24;
  // Same cell as the battery chart: one wide rounded cell per hour. Both series
  // use the full cell width; the taller one sits behind, the shorter in front.
  const cellW = Math.max(6, Math.min(16, slot - 7));
  const cellR = Math.min(4, cellW / 2);
  const y = (w: number) => PAD.top + plotH - (w / maxW) * plotH;
  const yTicks = [0, maxW / 2, maxW];

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
  const missing = buckets.filter((b) => b.homeW === null).length;

  const bar = (x: number, w: number, color: string, key: string, front: boolean) => {
    const h = Math.max(0, (w / maxW) * plotH);
    if (h < 0.5) return null;
    const hh = Math.max(h, cellR * 2);
    return (
      <rect key={key} x={x} y={PAD.top + plotH - hh} width={cellW} height={hh} rx={cellR} fill={color}
        stroke={front ? "#ffffff" : "none"} strokeWidth={front ? 1.5 : 0} paintOrder="stroke" />
    );
  };

  const shown = active !== null ? buckets[active] : null;
  const homes = buckets.filter((b) => b.homeW !== null).map((b) => b.homeW as number);
  const peakHomeW = homes.length ? Math.max(...homes) : null;
  const solars = buckets.filter((b) => b.solarW !== null).map((b) => b.solarW as number);
  const peakSolarW = solars.length ? Math.max(...solars) : null;

  return (
    <div className="space-y-3">
      <div className="space-y-3" dir="rtl">
        <div className="grid grid-cols-2 gap-3">
          <StatTile big tone="sky" label="استهلاك المنزل" value={homeKWh.toFixed(1)} unit="kWh" ampTone="sky" ampUnit="Ah" amps={(homeKWh * 1000) / AC_VOLTS} />
          <StatTile big tone="amber" label="الإنتاج الشمسي" value={solarKWh.toFixed(1)} unit="kWh" ampTone="amber" ampUnit="Ah" amps={(solarKWh * 1000) / AC_VOLTS} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <StatTile label="ذروة المنزل" value={peakHomeW === null ? "—" : kw(peakHomeW)} unit="kW" ampTone="sky" amps={peakHomeW === null ? null : peakHomeW / AC_VOLTS} />
          <StatTile label="ذروة الإنتاج" value={peakSolarW === null ? "—" : kw(peakSolarW)} unit="kW" ampTone="amber" amps={peakSolarW === null ? null : peakSolarW / AC_VOLTS} />
        </div>
      </div>

      <div className="relative" dir="ltr">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full touch-none select-none"
          role="img"
          aria-label="استهلاك المنزل والإنتاج الشمسي لكل ساعة خلال آخر 24 ساعة"
          onPointerLeave={() => setActive(null)}
        >
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="#f7f1e8" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="#b5a393">{v === 0 ? "0" : `${+(v / 1000).toFixed(1)} kW`}</text>
            </g>
          ))}

          {buckets.map((b, i) => {
            const x0 = PAD.left + i * slot;
            const center = x0 + slot / 2;
            const hour = Number(hourFmt.format(b.start));
            const isActive = active === i;
            return (
              <g key={b.start}>
                {isActive && <rect x={x0 + 1} y={PAD.top - 2} width={slot - 2} height={plotH + 4} rx={5} fill="#fdfbf7" stroke="#ecdfd0" />}
                {b.homeW === null ? (
                  <line x1={center - 3} x2={center + 3} y1={PAD.top + plotH - 2} y2={PAD.top + plotH - 2} stroke="#dccbb7" strokeWidth={2} strokeLinecap="round" />
                ) : (
                  <>
                    <rect x={center - cellW / 2} y={PAD.top} width={cellW} height={plotH} rx={cellR} fill="#f7f1e8" />
                    {(b.solarW ?? 0) >= b.homeW ? (
                      <>
                        {bar(center - cellW / 2, b.solarW ?? 0, SOLAR, "s", false)}
                        {bar(center - cellW / 2, b.homeW, HOME, "h", true)}
                      </>
                    ) : (
                      <>
                        {bar(center - cellW / 2, b.homeW, HOME, "h", false)}
                        {bar(center - cellW / 2, b.solarW ?? 0, SOLAR, "s", true)}
                      </>
                    )}
                  </>
                )}
                {hour % 6 === 0 && (
                  <text x={center} y={H - 8} textAnchor="middle" fontSize={11} fill="#b5a393">{String(hour).padStart(2, "0")}:00</text>
                )}
                {/* Hit target bigger than the bars */}
                <rect
                  x={x0}
                  y={PAD.top}
                  width={slot}
                  height={plotH + PAD.bottom}
                  fill="transparent"
                  onPointerEnter={() => setActive(i)}
                  onPointerDown={() => setActive(i)}
                />
              </g>
            );
          })}
          <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} stroke="#ecdfd0" strokeWidth={1} />
        </svg>

        {shown && active !== null && (
          <div
            className="pointer-events-none absolute top-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 shadow-md"
            style={{ left: `${Math.min(68, Math.max(2, ((PAD.left + active * slot) / W) * 100 - 14))}%` }}
            dir="rtl"
          >
            <div className="text-slate-400">{labelFmt.format(shown.start)} – {labelFmt.format(shown.start + HOUR)}</div>
            {shown.homeW === null ? (
              <div>لا توجد قراءات</div>
            ) : (
              <>
                <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: HOME }} />المنزل: {kw(shown.homeW)} kW <AmpPill tone="sky" amps={shown.homeW / AC_VOLTS} className="mr-1" /></div>
                <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: SOLAR }} />الشمس: {kw(shown.solarW ?? 0)} kW <AmpPill tone="amber" amps={(shown.solarW ?? 0) / AC_VOLTS} className="mr-1" /></div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-bold text-slate-500" dir="rtl">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: HOME }} />استهلاك المنزل</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: SOLAR }} />الإنتاج الشمسي</span>
      </div>

      <p className="text-[11px] font-semibold text-slate-400">
        متوسط القدرة لكل ساعة (kW)، العمود الأقصر بالأمام. {missing > 0 ? `الشرطة الرمادية = ساعة بلا قراءات (${missing} من 24).` : "اضغط على أي ساعة لعرض أرقامها."}
      </p>
    </div>
  );
}
