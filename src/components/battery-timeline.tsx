"use client";

import { useMemo } from "react";
import { useSharedSmartEnergy } from "@/components/smart-energy-provider";
import type { HourlySolarPoint } from "@/lib/smart-forecast";

/** "2026-10-06T18:31" → hour key "2026-10-06T18" and minute 31 (site-local strings, no Date parsing). */
function splitTime(time: string) {
  return { hourKey: time.slice(0, 13), minute: Number(time.slice(14, 16)) || 0 };
}

/**
 * The modelled battery level over the coming days on one line: shaded bands
 * are the nights, a green dot marks when the battery should be full, and the
 * dashed line is the reserve the owner saved.
 */
export function BatteryTimeline() {
  const { forecasts, snapshot, reservePct, loading } = useSharedSmartEnergy();

  const model = useMemo(() => {
    // Only hours the forecast actually simulated carry a level (today's past
    // hours do not), so the line starts now.
    const points: HourlySolarPoint[] = forecasts.flatMap((day) => day.hourly.filter((point) => typeof point.socPct === "number"));
    if (points.length < 6) return null;
    const total = points.length;
    const indexByHour = new Map(points.map((point, index) => [point.time.slice(0, 13), index]));

    /** Position on the line (0 = now, total = end of the last day) of a site-local time, or null when outside it. */
    const xOf = (time?: string | null) => {
      if (!time) return null;
      const { hourKey, minute } = splitTime(time);
      const index = indexByHour.get(hourKey);
      return index === undefined ? null : Math.min(total, index + minute / 60);
    };

    const startSoc = typeof snapshot?.batterySoc === "number" ? snapshot.batterySoc : points[0].socPct!;
    const line = [{ x: 0, soc: startSoc }, ...points.map((point, index) => ({ x: index + 1, soc: point.socPct! }))];

    // Night bands: before today's sunrise if we are still in last night, then
    // each sunset to the next sunrise, and the last sunset to the end.
    const nights: { from: number; to: number }[] = [];
    const firstSunrise = xOf(forecasts[0]?.sunrise);
    if (firstSunrise !== null && firstSunrise > 0) nights.push({ from: 0, to: firstSunrise });
    forecasts.forEach((day, index) => {
      const from = xOf(day.sunset) ?? (day.sunset && day.sunset.slice(0, 13) < points[0].time.slice(0, 13) && index === 0 ? 0 : null);
      if (from === null) return;
      const nextSunrise = xOf(forecasts[index + 1]?.sunrise);
      nights.push({ from, to: nextSunrise ?? total });
    });

    const fulls = forecasts
      .map((day) => xOf(day.fullChargeTime))
      .filter((x): x is number => x !== null);

    // A day label sits over the middle of its hours, when there is room for it.
    const days = forecasts
      .map((day) => {
        const indexes = points.map((point, index) => (point.time.startsWith(day.date) ? index : -1)).filter((index) => index >= 0);
        if (indexes.length < 5) return null;
        return { label: day.label, x: (indexes[0] + indexes[indexes.length - 1] + 1) / 2 };
      })
      .filter((day): day is { label: string; x: number } => day !== null);

    return { total, line, nights, fulls, days };
  }, [forecasts, snapshot]);

  if (loading || !model) return null;

  const { total, line, nights, fulls, days } = model;
  const pct = (x: number) => `${(x / total) * 100}%`;
  const y = (soc: number) => 100 - Math.max(0, Math.min(100, soc));
  const path = line.map((point, index) => `${index ? "L" : "M"}${point.x} ${y(point.soc)}`).join(" ");

  return (
    <section className="energy-card p-4 sm:p-5" dir="rtl">
      <h2 className="text-lg font-black text-slate-900">🔋 البطارية خلال الأيام</h2>
      <p className="mt-1 text-[11px] font-bold leading-5 text-slate-500">
        <span className="ml-1 inline-block h-2 w-2 rounded-full bg-emerald-500 align-middle" />النقطة الخضراء: تمتلئ · المناطق المظللة: الليل · الخط المتقطع: الاحتياطي
      </p>

      <div dir="ltr" className="relative mt-3">
        {/* Day names over their hours. */}
        <div className="relative h-5">
          {days.map((day) => (
            <span key={day.label} className="absolute -translate-x-1/2 whitespace-nowrap text-[11px] font-black text-slate-500" style={{ left: pct(day.x) }}>
              {day.label}
            </span>
          ))}
        </div>

        <div className="relative mt-1 h-36 overflow-visible rounded-xl bg-slate-50/60 ring-1 ring-slate-200/60">
          <svg viewBox={`0 0 ${total} 100`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-label="مستوى البطارية المتوقع خلال الأيام القادمة" role="img">
            {nights.map((night, index) => (
              <rect key={index} x={night.from} y={0} width={Math.max(0, night.to - night.from)} height={100} className="fill-slate-300/40" />
            ))}
            {[50].map((level) => (
              <line key={level} x1={0} x2={total} y1={y(level)} y2={y(level)} className="stroke-slate-200" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
            <line x1={0} x2={total} y1={y(reservePct)} y2={y(reservePct)} className="stroke-rose-300" strokeWidth={1.5} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
            <path d={`${path} L${total} 100 L0 100 Z`} className="fill-emerald-500/15" />
            <path d={path} fill="none" className="stroke-emerald-600" strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>

          {fulls.map((x, index) => (
            <span
              key={index}
              className="absolute top-0 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-emerald-500 shadow"
              style={{ left: pct(x) }}
              aria-hidden="true"
            />
          ))}

          <span className="absolute right-1.5 top-1 text-[10px] font-bold text-slate-400">100%</span>
          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">50%</span>
          <span className="absolute bottom-1 left-1.5 text-[10px] font-black text-emerald-700">الآن {Math.round(line[0].soc)}%</span>
        </div>
      </div>
    </section>
  );
}
