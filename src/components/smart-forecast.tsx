"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MoonStar, RefreshCw, SunMedium } from "lucide-react";
import { useSharedSmartEnergy } from "@/components/smart-energy-provider";
import { calculateAutonomy, weatherIcon, weatherLabel } from "@/lib/smart-forecast";
import { InfoTip } from "@/components/info-tip";
import { BatteryTimeline } from "@/components/battery-timeline";
import { AmpPill } from "@/components/amp-pill";
import { acAmpHours } from "@/lib/energy";

function formatHour(iso?: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ar-LB-u-nu-latn", {
    timeZone: "Asia/Beirut",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("ar-LB-u-nu-latn", {
    timeZone: "Asia/Beirut",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(iso + "T12:00:00"));
}

const confidenceTone = {
  "عالية": "bg-emerald-50 text-emerald-700 ring-emerald-200/70",
  "متوسطة": "bg-amber-50 text-amber-700 ring-amber-200/70",
  "منخفضة": "bg-rose-50 text-rose-700 ring-rose-200/70",
} as const;

/** The night we are in now, in one compact card: does it last, and what is left at sunrise. */
function TonightCard({
  until,
  startSoc,
  hours,
  loadW,
  averageNightLoadW,
  sampleCount,
  capacityWh,
  reservePct,
}: {
  until: string;
  startSoc: number;
  hours: number;
  loadW: number;
  averageNightLoadW: number | null;
  sampleCount: number;
  capacityWh: number;
  reservePct: number;
}) {
  const effectiveLoadW = averageNightLoadW ?? loadW;
  const result = calculateAutonomy(startSoc, capacityWh, effectiveLoadW, hours, reservePct);
  // Needs a real spread of night readings, not three taken a minute apart.
  const hasEnoughSamples = sampleCount >= 8;
  const tone = !hasEnoughSamples ? "slate" : result.sufficient ? "emerald" : result.probability >= 90 ? "amber" : "rose";
  const toneClass = {
    slate: "from-slate-50 text-slate-700",
    emerald: "from-emerald-50 text-emerald-700",
    amber: "from-amber-50 text-amber-700",
    rose: "from-rose-50 text-rose-700",
  }[tone];
  const verdict = !hasEnoughSamples
    ? "تقدير أولي"
    : result.sufficient
      ? "تكفي حتى الصباح"
      : result.probability >= 90
        ? "تكفي تقريبًا، على الحافة"
        : "قد لا تكفي حتى الصباح";

  return (
    <section id="night" className={"energy-card scroll-mt-40 overflow-hidden bg-gradient-to-b to-white p-4 ring-2 ring-amber-300/70 " + toneClass}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-black text-slate-500">
          <MoonStar size={15} aria-hidden="true" /> الليلة الجارية · حتى الشروق <bdi dir="ltr">{formatHour(until)}</bdi>
        </p>
        <InfoTip label="كيف نحسب كفاية الليل" title="كفاية الليل">
          من نسبة البطارية الآن وسعتها ومتوسط استهلاك بيتك بالليل (<bdi dir="ltr">{Math.round(effectiveLoadW)} W</bdi>، من {sampleCount} قراءة) حتى الشروق، مع إبقاء حد الاحتياطي <bdi dir="ltr">{reservePct}%</bdi>.
        </InfoTip>
      </div>
      <h2 className="mt-1.5 text-xl font-black">{tone === "emerald" ? "✓ " : tone === "slate" ? "" : "⚠ "}{verdict}</h2>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-white/80 px-1 py-2 ring-1 ring-slate-200/60">
          <span className="block text-[10px] font-bold text-slate-500">الآن</span>
          <strong className="block text-lg font-black text-slate-900"><bdi dir="ltr">{Math.round(startSoc)}%</bdi></strong>
        </div>
        <div className="rounded-xl bg-white/80 px-1 py-2 ring-1 ring-slate-200/60">
          <span className="block text-[10px] font-bold text-slate-500">عند الشروق</span>
          <strong className="block text-lg font-black text-indigo-700">{hasEnoughSamples ? <bdi dir="ltr">{result.expectedSocAtSunrise}%</bdi> : "—"}</strong>
        </div>
        <div className="rounded-xl bg-white/80 px-1 py-2 ring-1 ring-slate-200/60">
          <span className="block text-[10px] font-bold text-slate-500">تغطية</span>
          <strong className="block text-lg font-black">{hasEnoughSamples ? <bdi dir="ltr">{result.probability}%</bdi> : "—"}</strong>
        </div>
      </div>
      {!hasEnoughSamples && <p className="mt-2 text-[11px] font-bold text-slate-500">تظهر النسب بعد تجمّع قراءات ليلية كافية.</p>}
    </section>
  );
}

/**
 * Energy forecast, top to bottom: tonight (only at night), the chosen day's
 * sun and where it goes, then (below, from the page) when to use the surplus
 * and the battery day by day.
 */
export function SmartForecast({ afterDay }: { afterDay?: React.ReactNode } = {}) {
  const { forecasts, weather, snapshot, loading, isRefreshing, error, nightLoadStats, calibration, batteryCapacityWh, reservePct, refresh } = useSharedSmartEnergy();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // After today's sunset there is nothing left to show for today, so open on
  // tomorrow (once; the owner can still pick today).
  const autoSelected = useRef(false);
  useEffect(() => {
    if (autoSelected.current || forecasts.length < 2) return;
    autoSelected.current = true;
    const sunset = new Date(forecasts[0].sunset).getTime();
    if (Number.isFinite(sunset) && Date.now() > sunset) setSelectedIndex(1);
  }, [forecasts]);

  const selected = forecasts[selectedIndex];
  const todayAfterSunset = selectedIndex === 0 && (selected?.sunset ? Date.now() > new Date(selected.sunset).getTime() : false);
  const current = weather?.current;

  // Arriving from the home card ("/energy#night"): the section only exists
  // after the forecast loads, so scroll once it is rendered.
  useEffect(() => {
    if (!forecasts.length || typeof window === "undefined" || window.location.hash !== "#night") return;
    requestAnimationFrame(() => document.getElementById("night")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [forecasts.length]);

  // The night in progress (after sunset, or after midnight before sunrise).
  // In daytime the coming night is a row of the battery-by-day card.
  const tonight = useMemo(() => {
    const today = forecasts[0];
    const tomorrow = forecasts[1];
    if (!today || !tomorrow) return null;
    const now = Date.now();
    const todaySunrise = new Date(today.sunrise).getTime();
    if (Number.isFinite(todaySunrise) && now < todaySunrise) {
      return { until: today.sunrise, startSoc: snapshot?.batterySoc ?? today.chargeAtSunrisePct, hours: Math.max(0.5, (todaySunrise - now) / 3600000) };
    }
    const todaySunset = new Date(today.sunset).getTime();
    if (Number.isFinite(todaySunset) && now < todaySunset) return null;
    return {
      until: tomorrow.sunrise,
      startSoc: snapshot?.batterySoc ?? today.chargeAtSunsetPct,
      hours: Math.max(0.5, (new Date(tomorrow.sunrise).getTime() - now) / 3600000),
    };
  }, [forecasts, snapshot]);

  const handleRefresh = async () => {
    const ok = await refresh();
    setToast(ok ? "تم تحديث التوقعات ☀️" : "تعذر التحديث، تم الاحتفاظ بآخر بيانات ناجحة");
  };

  const split = selected
    ? [
        { key: "home", label: "للبيت", pct: selected.homePct, kwh: selected.homeKWh, bar: "bg-sky-500", dot: "bg-sky-500", text: "text-sky-700" },
        { key: "battery", label: "للبطارية", pct: selected.batteryPct, kwh: selected.batteryKWh, bar: "bg-emerald-500", dot: "bg-emerald-500", text: "text-emerald-700" },
        { key: "surplus", label: "فائض", pct: selected.surplusPct, kwh: selected.surplusKWh, bar: "bg-amber-400", dot: "bg-amber-400", text: "text-amber-700" },
      ]
    : [];

  return (
    <section dir="rtl" className="desktop-grid relative space-y-3">
      {toast && (
        <div role="status" aria-live="polite" className="fixed left-1/2 top-4 z-[80] -translate-x-1/2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 shadow-xl">
          {toast}
        </div>
      )}

      {/* 1 · Title, refresh, and the two facts that frame every number below. */}
      <header className="energy-card p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-200/70"><SunMedium className="h-5 w-5" aria-hidden="true" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black text-amber-600">Solar • الطاقة</p>
            <h1 className="text-xl font-black tracking-tight text-slate-950">توقعات الطاقة</h1>
          </div>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={loading || isRefreshing}
            aria-label="تحديث التوقعات"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-700 disabled:opacity-60"
          >
            {loading || isRefreshing ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
          </button>
        </div>

        {(current || calibration) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {current && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1 text-xs font-black text-slate-700 ring-1 ring-slate-200/70" title="توقع جوي من Open-Meteo، وليس قياساً من الإنفرتر">
                {weatherIcon(current.weather_code ?? 0)} الآن: {weatherLabel(current.weather_code ?? 0)} · <bdi dir="ltr">{Math.round(current.temperature_2m ?? 0)}°</bdi>
              </span>
            )}
            {/* The forecast is scaled to what these panels really delivered on recent days. */}
            {calibration && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-3 py-1 text-xs font-black text-slate-700 ring-1 ring-slate-200/70">
                {calibration.status === "calibrated"
                  ? <>🎯 معايَر على ألواحك · <bdi dir="ltr">{Math.round(calibration.factor * 100)}%</bdi></>
                  : calibration.status === "suspect"
                    ? <>⚠️ المعايرة متوقفة</>
                    : <>⏳ يتعلّم من ألواحك</>}
                <InfoTip label="معايرة التوقع" title="معايرة التوقع">
                  {calibration.status === "calibrated"
                    ? <>في آخر {calibration.days} أيام أعطت ألواحك <bdi dir="ltr">{Math.round(calibration.factor * 100)}%</bdi> من التقدير النظري، فعُدّل التوقع على ذلك.</>
                    : calibration.status === "suspect"
                      ? <>أعطت ألواحك في آخر {calibration.days} أيام <bdi dir="ltr">{Math.round(calibration.ratio * 100)}%</bdi> فقط من التقدير النظري، وهذا أقل من أي منظومة سليمة. غالباً لم تجد الشمس مكاناً تذهب إليه أو أن قدرة الألواح في الإعدادات غير دقيقة، لذلك لم نعدّل التوقع.</>
                      : <>يبدأ تعديل التوقع على إنتاج ألواحك الفعلي بعد حوالي أسبوع من القراءات.</>}
                </InfoTip>
              </span>
            )}
          </div>
        )}

        {error && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800">{error}.</p>}
      </header>

      {/* 2 · At night the first question is whether the battery lasts until morning. */}
      {tonight && (
        <TonightCard
          until={tonight.until}
          startSoc={tonight.startSoc}
          hours={tonight.hours}
          loadW={snapshot?.homePowerW ?? 0}
          averageNightLoadW={nightLoadStats.averageW}
          sampleCount={nightLoadStats.sampleCount}
          capacityWh={batteryCapacityWh}
          reservePct={reservePct}
        />
      )}

      {/* 3 · The days, and the chosen day's sun: how much, and where it goes. */}
      {forecasts.length > 0 && (
        <section className="energy-card space-y-4 p-4">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 pt-0.5 [scrollbar-width:none]">
            {forecasts.map((day, index) => (
              <button
                key={day.date}
                type="button"
                onClick={() => setSelectedIndex(index)}
                aria-pressed={selectedIndex === index}
                className={
                  "shrink-0 basis-[calc((100%-1.5rem)/4)] rounded-2xl border px-1 py-2.5 text-center transition " +
                  (selectedIndex === index ? "border-amber-400 bg-amber-50 text-amber-800 shadow-sm" : "border-slate-200 bg-white text-slate-600")
                }
              >
                <span className="block truncate text-xs font-black">{day.label}</span>
                <span className="mt-1 block text-xl leading-none">{weatherIcon(day.weatherCode)}</span>
                <span className={"mt-1.5 block whitespace-nowrap text-sm font-black " + (selectedIndex === index ? "text-amber-700" : "text-slate-700")}>
                  <bdi dir="ltr">{Math.round(day.productionKWh)}<small className="text-[10px] font-bold"> kWh</small></bdi>
                </span>
              </button>
            ))}
          </div>

          {selected && (
            <div className="border-t border-slate-100 pt-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-500">{selected.label} · {formatDate(selected.date)}</p>
                  <h2 className="mt-0.5 text-lg font-black text-slate-950">{weatherIcon(selected.weatherCode)} {weatherLabel(selected.weatherCode)}</h2>
                  <p className="mt-0.5 text-[11px] font-bold text-slate-500">
                    🌅 <bdi dir="ltr">{formatHour(selected.sunrise)}</bdi> · 🌇 <bdi dir="ltr">{formatHour(selected.sunset)}</bdi> · <bdi dir="ltr">{Math.round(selected.tempMin)}°–{Math.round(selected.tempMax)}°</bdi>
                  </p>
                </div>
                <div className="shrink-0 text-left">
                  <strong className="block text-3xl font-black leading-none text-amber-700"><bdi dir="ltr">{selected.productionKWh}<small className="text-sm"> kWh</small></bdi></strong>
                  <span className="mt-1.5 block"><AmpPill tone="amber" unit="Ah" amps={acAmpHours(selected.productionKWh)} /></span>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className={"rounded-full px-2.5 py-1 text-[11px] font-black ring-1 " + confidenceTone[selected.confidence]}>ثقة التوقع: {selected.confidence}</span>
                {/* The chosen day's battery in one line; every day side by side is in the battery card below. */}
                {!todayAfterSunset && (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700 ring-1 ring-emerald-200/70">
                    🔋 {selected.fullChargeTime ? <>تمتلئ <bdi dir="ltr">{formatHour(selected.fullChargeTime)}</bdi></> : "لا تمتلئ"} · الغروب <bdi dir="ltr">{selected.chargeAtSunsetPct}%</bdi>
                  </span>
                )}
              </div>

              {/* Where the sun goes. Today only splits the hours still ahead. */}
              {selected.splitKWh > 0 ? (
                <div className="mt-4">
                  <p className="text-[11px] font-black text-slate-500">{selectedIndex === 0 ? "أين يذهب ما تبقّى من شمس اليوم" : "أين تذهب شمس هذا اليوم"}</p>
                  <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-slate-100" aria-label="توزيع إنتاج الطاقة الشمسية">
                    {split.map((part) => <div key={part.key} className={part.bar} style={{ width: part.pct + "%" }} />)}
                  </div>
                  <div className="mt-2.5 grid grid-cols-3 gap-2">
                    {split.map((part) => (
                      <div key={part.key} className="min-w-0">
                        <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500"><span className={"h-2 w-2 shrink-0 rounded-full " + part.dot} />{part.label}</span>
                        <strong className={"mt-0.5 block text-sm font-black " + part.text}><bdi dir="ltr">{part.kwh} kWh</bdi></strong>
                        <span className="text-[10px] font-bold text-slate-400"><bdi dir="ltr">{part.pct}%</bdi></span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-4 rounded-2xl bg-slate-50 p-3 text-xs font-bold leading-5 text-slate-600">{selectedIndex === 0 ? "انتهت شمس اليوم. اختر الغد من الأعلى لترى توزيعه." : "لا يُتوقع إنتاج شمسي يُذكر في هذا اليوم."}</p>
              )}
            </div>
          )}
        </section>
      )}

      {/* 4 · The battery day by day, then 5 · when to use the sun. */}
      {selected && (
        <>
          <BatteryTimeline anchor={tonight ? undefined : "night"} />
          {afterDay}
        </>
      )}
    </section>
  );
}
