"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useSharedSmartEnergy } from "@/components/smart-energy-provider";
import { weatherIcon } from "@/lib/smart-forecast";

function formatHour(time: string) {
  // Forecast times are already site-local ("2026-10-06T18:31"): read the clock straight from the string.
  return time.slice(11, 16);
}

/** One hour after a site-local "YYYY-MM-DDTHH:00" key, as "HH:00". */
function hourEnd(time: string) {
  const hour = (Number(time.slice(11, 13)) + 1) % 24;
  return `${String(hour).padStart(2, "0")}:00`;
}

type DayRow = {
  date: string;
  label: string;
  weatherCode: number;
  fullAt: string | null;
  sunsetPct: number;
  /** Level at the next sunrise; null for the last forecast day. */
  morningPct: number | null;
  /** Lowest level during the night after this day. */
  nightMinPct: number | null;
  /** When the battery reaches the reserve that night, if it does. */
  reserveAt: string | null;
};

/**
 * The coming days as one row each, answering the two questions that matter:
 * does the battery fill, and does it last the night after. The bar shows the
 * night's range: from the level at sunset down to the morning level.
 */
export function BatteryTimeline({ anchor }: { anchor?: string } = {}) {
  const { forecasts, reservePct, loading } = useSharedSmartEnergy();

  const rows = useMemo<DayRow[]>(() => {
    // Every simulated hour across the week, in order; each carries the level at its end.
    const hours = forecasts.flatMap((day) => day.hourly.filter((point) => typeof point.socPct === "number"));
    const now = Date.now();

    // Only today, tomorrow and the day after: further out the weather
    // forecast is too rough to plan the battery on.
    return forecasts
      .slice(0, 3)
      .map((day, index): DayRow | null => {
        // Tonight already has its own card at the top of the page.
        if (index === 0 && Number.isFinite(new Date(day.sunset).getTime()) && now > new Date(day.sunset).getTime()) return null;
        const next = forecasts[index + 1];
        let nightMinPct: number | null = null;
        let reserveAt: string | null = null;
        if (next) {
          const from = day.sunset.slice(0, 13);
          const to = next.sunrise.slice(0, 13);
          const night = hours.filter((point) => point.time.slice(0, 13) >= from && point.time.slice(0, 13) < to);
          for (const point of night) {
            const level = point.socPct!;
            nightMinPct = nightMinPct === null ? level : Math.min(nightMinPct, level);
            if (!reserveAt && level <= reservePct + 0.5) reserveAt = hourEnd(point.time);
          }
        }
        return {
          date: day.date,
          label: day.label,
          weatherCode: day.weatherCode,
          fullAt: day.fullChargeTime,
          sunsetPct: day.chargeAtSunsetPct,
          morningPct: next ? next.chargeAtSunrisePct : null,
          nightMinPct: nightMinPct === null ? null : Math.round(nightMinPct),
          reserveAt,
        };
      })
      .filter((row): row is DayRow => row !== null);
  }, [forecasts, reservePct]);

  // Folded by default to keep the page short; opened when arriving from the
  // home card's night link (#night) so that link still lands on the answer.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (anchor && typeof window !== "undefined" && window.location.hash === `#${anchor}`) setOpen(true);
  }, [anchor]);

  if (loading || rows.length === 0) return null;

  const withNight = rows.filter((row) => row.morningPct !== null);
  const short = withNight.filter((row) => row.reserveAt).length;

  return (
    <details
      id={anchor}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="energy-card group scroll-mt-40 p-4"
      dir="rtl"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <h2 className="text-lg font-black text-slate-900">🔋 البطارية خلال الأيام</h2>
          {/* The answer in one line, so the folded card is still useful. */}
          <p className={"mt-0.5 text-[11px] font-black " + (short ? "text-rose-700" : "text-emerald-700")}>
            {withNight.length === 0
              ? "متى تمتلئ وكم تبقى عند الغروب"
              : short === 0
                ? `✓ تكفي حتى الصباح في كل الأيام (${withNight.length})`
                : `⚠ تصل للاحتياطي ليلًا في ${short} من ${withNight.length} أيام`}
          </p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-500 ring-1 ring-slate-200/70">
          <ChevronDown size={18} className="transition-transform group-open:rotate-180" aria-hidden="true" />
        </span>
      </summary>

      <p className="mt-3 text-[11px] font-bold leading-5 text-slate-500">لكل يوم: متى تمتلئ، كم تبقى عند الغروب، وهل تكفي حتى الصباح.</p>

      <ul className="mt-2 divide-y divide-slate-100">
        {rows.map((row) => {
          const lasts = row.morningPct !== null && !row.reserveAt;
          const low = row.morningPct ?? row.sunsetPct;
          return (
            <li key={row.date} className="py-3 first:pt-1 last:pb-0">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-sm font-black text-slate-900">
                  <span aria-hidden="true">{weatherIcon(row.weatherCode)}</span>
                  <span className="truncate">{row.label}</span>
                </span>
                {row.morningPct === null ? (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-500">آخر يوم في التوقع</span>
                ) : lasts ? (
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700">✓ تكفي حتى الصباح</span>
                ) : (
                  <span className="shrink-0 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-black text-rose-700">
                    ⚠ تصل للاحتياطي نحو <bdi dir="ltr">{row.reserveAt}</bdi>
                  </span>
                )}
              </div>

              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-emerald-50/70 px-1 py-1.5">
                  <span className="block text-[10px] font-bold text-slate-500">تمتلئ</span>
                  <strong className="block text-sm font-black text-emerald-700">{row.fullAt ? <bdi dir="ltr">{formatHour(row.fullAt)}</bdi> : <span className="text-xs text-slate-500">لا تمتلئ</span>}</strong>
                </div>
                <div className="rounded-xl bg-orange-50/70 px-1 py-1.5">
                  <span className="block text-[10px] font-bold text-slate-500">عند الغروب</span>
                  <strong className="block text-sm font-black text-slate-900"><bdi dir="ltr">{row.sunsetPct}%</bdi></strong>
                </div>
                <div className={"rounded-xl px-1 py-1.5 " + (row.morningPct === null ? "bg-slate-50" : lasts ? "bg-indigo-50/70" : "bg-rose-50")}>
                  <span className="block text-[10px] font-bold text-slate-500">الصباح التالي</span>
                  <strong className={"block text-sm font-black " + (row.morningPct === null ? "text-slate-400" : lasts ? "text-indigo-700" : "text-rose-700")}>
                    {row.morningPct === null ? "—" : <bdi dir="ltr">{row.morningPct}%</bdi>}
                  </strong>
                </div>
              </div>

              {/* The night on a 0–100% track: from the sunset level down to the morning level, with the reserve marked. */}
              {row.morningPct !== null && (
                <div dir="ltr" className="relative mt-2.5 h-2 rounded-full bg-slate-100" aria-hidden="true">
                  <div
                    className={"absolute inset-y-0 rounded-full " + (lasts ? "bg-emerald-400" : "bg-rose-400")}
                    style={{ left: `${Math.min(low, row.sunsetPct)}%`, width: `${Math.max(1.5, Math.abs(row.sunsetPct - low))}%` }}
                  />
                  <div className="absolute -top-1 h-4 w-0.5 rounded bg-rose-500" style={{ left: `${reservePct}%` }} title="الاحتياطي" />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold text-slate-500">
        <span className="inline-block h-3 w-0.5 rounded bg-rose-500" aria-hidden="true" />
        الخط الأحمر: حد الاحتياطي <bdi dir="ltr">{Math.round(reservePct)}%</bdi> · الشريط: نزول البطارية من الغروب إلى الصباح
      </p>
    </details>
  );
}
