"use client";

import React, { useMemo, useState } from "react";
import type { LoadPoint } from "@/components/load-chart";
import { StatTile, type StatTone } from "@/components/stat-tile";
import { AmpPill } from "@/components/amp-pill";
import { batteryAmps } from "@/lib/energy";

const HOUR = 3_600_000;
const W = 640;
const H = 200;
const PAD = { top: 10, right: 6, bottom: 26, left: 36 };
const OK = "#10ab5a"; // emerald: the app's battery colour
const LOW = "#f59c00"; // amber: close to the reserve
const CRITICAL = "#ee2d5f"; // rose: below the reserve
const TRACK = "#eaeef8";

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
  const [active, setActive] = useState<number | null>(null);
  const buckets = useMemo(() => hourly(points, now), [points, now]);
  const hourFmt = useMemo(() => new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hourCycle: "h23" }), [timeZone]);
  const labelFmt = useMemo(() => new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }), [timeZone]);

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const base = PAD.top + plotH;
  const slot = plotW / 24;
  const cellW = Math.max(6, Math.min(16, slot - 7));
  const y = (soc: number) => PAD.top + (1 - soc / 100) * plotH;
  const colorFor = (soc: number) => (soc < reservePct ? CRITICAL : soc < reservePct + 10 ? LOW : OK);

  const known = buckets.filter((b) => b.soc !== null);
  const latest = known.at(-1)?.soc ?? null;
  const low = known.length ? Math.min(...known.map((b) => b.min)) : null;
  const high = known.length ? Math.max(...known.map((b) => b.max)) : null;
  const missing = 24 - known.length;
  const shown = active !== null ? buckets[active] : null;

  const toneFor = (soc: number | null): StatTone => (soc === null ? "slate" : soc < reservePct ? "rose" : soc < reservePct + 10 ? "amber" : "emerald");
  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v)}%`);
  const change = known.length >= 2 ? (known.at(-1)!.soc as number) - (known[0].soc as number) : null;

  return (
    <div className="space-y-3">
      <div className="space-y-3" dir="rtl">
        <div className="grid grid-cols-2 gap-3">
          <StatTile big tone={toneFor(latest)} label="الشحن الآن" value={pct(latest)} />
          <StatTile big tone={toneFor(low)} label="أدنى نسبة" value={pct(low)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <StatTile label="أعلى نسبة" value={pct(high)} />
          <StatTile label="التغيّر خلال 24 ساعة" value={change === null ? "—" : `${change > 0 ? "+" : ""}${Math.round(change)}%`} />
        </div>
      </div>

      <div className="relative" dir="ltr">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full touch-none select-none" role="img" aria-label="نسبة شحن البطارية لكل ساعة خلال آخر 24 ساعة" onPointerLeave={() => setActive(null)}>
          {[0, 50, 100].map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="#eaeef8" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="#96a1c0">{v}%</text>
            </g>
          ))}

          {buckets.map((b, i) => {
            const x0 = PAD.left + i * slot;
            const cx = x0 + (slot - cellW) / 2;
            const hour = Number(hourFmt.format(b.start));
            const r = Math.min(4, cellW / 2);
            return (
              <g key={b.start}>
                {active === i && <rect x={x0 + 1} y={PAD.top - 2} width={slot - 2} height={plotH + 4} rx={5} fill="#f4f6fc" stroke="#dbe1f0" />}
                {b.soc === null ? (
                  <line x1={x0 + slot / 2 - 3} x2={x0 + slot / 2 + 3} y1={base - 2} y2={base - 2} stroke="#c2cbe1" strokeWidth={2} strokeLinecap="round" />
                ) : (
                  <>
                    {/* the empty cell */}
                    <rect x={cx} y={PAD.top} width={cellW} height={plotH} rx={r} fill={TRACK} />
                    {/* the charge inside it */}
                    {b.soc > 0 && (
                      <rect x={cx} y={y(b.soc)} width={cellW} height={Math.max(r * 2, base - y(b.soc))} rx={r} fill={colorFor(b.soc)} />
                    )}
                  </>
                )}
                {hour % 6 === 0 && (
                  <text x={x0 + slot / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="#96a1c0">{String(hour).padStart(2, "0")}:00</text>
                )}
                <rect x={x0} y={PAD.top} width={slot} height={plotH + PAD.bottom} fill="transparent" onPointerEnter={() => setActive(i)} onPointerDown={() => setActive(i)} />
              </g>
            );
          })}

          {/* reserve line drawn over the cells so it stays visible */}
          <line x1={PAD.left} x2={W - PAD.right} y1={y(reservePct)} y2={y(reservePct)} stroke={LOW} strokeDasharray="5 4" strokeWidth={1.25} pointerEvents="none" />
          <line x1={PAD.left} x2={W - PAD.right} y1={base} y2={base} stroke="#dbe1f0" strokeWidth={1} />
        </svg>

        {shown && active !== null && (
          <div
            className="pointer-events-none absolute top-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 shadow-md"
            style={{ left: `${Math.min(66, Math.max(2, ((PAD.left + active * slot) / W) * 100 - 14))}%` }}
            dir="rtl"
          >
            <div className="text-slate-400">{labelFmt.format(shown.start)} – {labelFmt.format(shown.start + HOUR)}</div>
            {shown.soc === null ? (
              <div>لا توجد قراءات</div>
            ) : (
              <>
                <div>آخر نسبة: <span style={{ color: colorFor(shown.soc) }}>{shown.soc}%</span></div>
                {shown.max - shown.min >= 1 && <div className="text-slate-500">المدى: {shown.min}% – {shown.max}%</div>}
                {shown.powerW !== null && Math.abs(shown.powerW) >= 30 && (
                  <div className={shown.powerW > 0 ? "text-emerald-600" : "text-amber-600"}>
                    {shown.powerW > 0 ? "شحن" : "تفريغ"} ≈ {Math.round(Math.abs(shown.powerW)).toLocaleString("en-US")} واط <AmpPill tone="emerald" amps={batteryAmps({ batteryPowerW: shown.powerW })} className="mr-1 align-middle" />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-bold text-slate-500" dir="rtl">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: OK }} />مستوى جيد</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: LOW }} />قريب من الاحتياطي</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed" style={{ borderColor: LOW }} />حد الاحتياطي <bdi dir="ltr">{reservePct}%</bdi></span>
      </div>

      <p className="text-[11px] font-semibold text-slate-400">
        كل عمود = ساعة، معبّأ حتى نسبة الشحن في آخرها. {missing > 0 ? `الشرطة الرمادية = ساعة بلا قراءات (${missing} من 24).` : "اضغط على أي ساعة لعرض تفاصيلها."}
      </p>
    </div>
  );
}
