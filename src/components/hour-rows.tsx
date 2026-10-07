"use client";

import { useMemo, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { LoadPoint } from "@/components/load-chart";

const HOUR = 3_600_000;

type Bucket = { start: number; loadW: number; solarW: number; batteryW: number; soc: number | null; n: number };

/** Last 24 clock hours, newest first: average power and the battery level at the end of each hour. */
function hourly(points: LoadPoint[], now: number): Bucket[] {
  const last = Math.floor(now / HOUR) * HOUR;
  const sums = Array.from({ length: 24 }, (_, i) => ({ start: last - i * HOUR, load: 0, solar: 0, battery: 0, soc: null as number | null, socT: -Infinity, n: 0 }));
  for (const p of points) {
    const index = Math.floor((last - Math.floor(p.t / HOUR) * HOUR) / HOUR);
    if (index < 0 || index > 23) continue;
    const s = sums[index];
    s.load += Math.max(0, p.loadW);
    s.solar += Math.max(0, p.solarW);
    s.battery += p.batteryW ?? 0;
    s.n += 1;
    if (typeof p.soc === "number" && p.t >= s.socT) {
      s.soc = p.soc;
      s.socT = p.t;
    }
  }
  return sums.map((s) => ({
    start: s.start,
    loadW: s.n ? s.load / s.n : 0,
    solarW: s.n ? s.solar / s.n : 0,
    batteryW: s.n ? s.battery / s.n : 0,
    soc: s.soc,
    n: s.n,
  }));
}

function useHourLabel(timeZone: string) {
  return useMemo(() => {
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    return (t: number) => fmt.format(t);
  }, [timeZone]);
}

const kw = (w: number) => (w / 1000).toFixed(2);

function Legend({ items }: { items: { label: ReactNode; dot: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-bold text-slate-500" dir="rtl">
      {items.map((item, i) => (
        <span key={i} className="inline-flex items-center gap-1.5"><span className={"h-2.5 w-2.5 rounded-full " + item.dot} />{item.label}</span>
      ))}
    </div>
  );
}

/** Hour lines folded away by default; tapping the bar opens them. */
function HourFold({ children }: { children: ReactNode }) {
  return (
    <details className="group rounded-2xl bg-slate-50 ring-1 ring-slate-200/70" dir="rtl">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-xs font-black text-slate-700 [&::-webkit-details-marker]:hidden">
        تفاصيل كل ساعة
        <ChevronDown size={16} className="text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-3 px-3 pb-3">{children}</div>
    </details>
  );
}

/**
 * The house hour by hour, one line per hour: what it used, split by where it
 * came from (sun, battery, grid), plus the spare sun on the end. The house
 * takes the sun first, then the battery, and the grid covers the rest.
 */
export function HomeHourRows({ points, timeZone, now }: { points: LoadPoint[]; timeZone: string; now: number }) {
  const rows = useMemo(() => hourly(points, now), [points, now]);
  const label = useHourLabel(timeZone);
  const split = rows.map((b) => {
    const sun = Math.min(b.loadW, b.solarW);
    const battery = Math.min(b.loadW - sun, Math.max(0, -b.batteryW));
    const grid = b.loadW - sun - battery;
    const spare = Math.max(0, b.solarW - sun);
    return { ...b, sun, battery, grid, spare };
  });
  const maxW = Math.max(1, ...split.map((r) => r.loadW + r.spare));

  return (
    <HourFold>
      <div className="space-y-1.5">
        {split.map((r) => (
          <div key={r.start} className="flex items-center gap-2">
            <span className="w-10 shrink-0 text-[11px] font-bold text-slate-500"><bdi dir="ltr">{label(r.start)}</bdi></span>
            <div className="flex h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
              {r.n > 0 && (
                <>
                  <div className="bg-amber-400" style={{ width: (r.sun / maxW) * 100 + "%" }} />
                  <div className="bg-emerald-500" style={{ width: (r.battery / maxW) * 100 + "%" }} />
                  <div className="bg-violet-500" style={{ width: (r.grid / maxW) * 100 + "%" }} />
                  <div className="bg-amber-200" style={{ width: (r.spare / maxW) * 100 + "%" }} />
                </>
              )}
            </div>
            <span className="w-14 shrink-0 text-left text-[11px] font-black text-sky-700">
              {r.n > 0 ? <bdi dir="ltr">{kw(r.loadW)} kW</bdi> : <span className="font-bold text-slate-300">—</span>}
            </span>
          </div>
        ))}
      </div>
      <Legend
        items={[
          { label: "من الشمس", dot: "bg-amber-400" },
          { label: "من البطارية", dot: "bg-emerald-500" },
          { label: "من الشبكة", dot: "bg-violet-500" },
          { label: "فائض شمسي", dot: "bg-amber-200" },
        ]}
      />
      <p className="text-[11px] font-semibold text-slate-400">كل سطر = ساعة، الأحدث فوق. الرقم = متوسط استهلاك البيت بتلك الساعة.</p>
    </HourFold>
  );
}

/**
 * The battery hour by hour, one line per hour filled to the level at the end
 * of it: green when fine, amber near the reserve, rose below it. The arrow
 * says whether it was charging or discharging that hour.
 */
export function SocHourRows({ points, timeZone, now, reservePct }: { points: LoadPoint[]; timeZone: string; now: number; reservePct: number }) {
  const rows = useMemo(() => hourly(points, now), [points, now]);
  const label = useHourLabel(timeZone);
  const tone = (soc: number) =>
    soc < reservePct ? { bar: "bg-rose-500", text: "text-rose-700" } : soc < reservePct + 10 ? { bar: "bg-amber-400", text: "text-amber-700" } : { bar: "bg-emerald-500", text: "text-emerald-700" };

  return (
    <HourFold>
      <div className="space-y-1.5">
        {rows.map((r) => {
          const t = r.soc === null ? null : tone(r.soc);
          const moving = r.n > 0 && Math.abs(r.batteryW) >= 30;
          return (
            <div key={r.start} className="flex items-center gap-2">
              <span className="w-10 shrink-0 text-[11px] font-bold text-slate-500"><bdi dir="ltr">{label(r.start)}</bdi></span>
              <div className="relative h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                {r.soc !== null && t && <div className={"absolute inset-y-0 right-0 rounded-full " + t.bar} style={{ width: Math.max(0, Math.min(100, r.soc)) + "%" }} />}
                <div className="absolute inset-y-0 w-0.5 bg-rose-500/70" style={{ right: reservePct + "%" }} aria-hidden="true" />
              </div>
              <span className={"flex w-14 shrink-0 items-center justify-end gap-1 text-[11px] font-black " + (t ? t.text : "text-slate-300")}>
                {moving && <span className={r.batteryW > 0 ? "text-emerald-600" : "text-slate-400"} title={r.batteryW > 0 ? "شحن" : "تفريغ"}>{r.batteryW > 0 ? "↑" : "↓"}</span>}
                {r.soc === null ? "—" : <bdi dir="ltr">{Math.round(r.soc)}%</bdi>}
              </span>
            </div>
          );
        })}
      </div>
      <Legend
        items={[
          { label: "مستوى جيد", dot: "bg-emerald-500" },
          { label: "قريب من الاحتياطي", dot: "bg-amber-400" },
          { label: "تحت الاحتياطي", dot: "bg-rose-500" },
          { label: <>خط أحمر = حد الاحتياطي <bdi dir="ltr">{reservePct}%</bdi></>, dot: "bg-rose-500/70" },
        ]}
      />
      <p className="text-[11px] font-semibold text-slate-400">كل سطر = ساعة، الأحدث فوق، معبّأ حتى نسبة الشحن بآخرها. ↑ شحن · ↓ تفريغ.</p>
    </HourFold>
  );
}
