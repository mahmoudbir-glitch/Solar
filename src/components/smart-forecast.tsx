"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, MoonStar, RefreshCw, SunMedium } from "lucide-react";
import { useSharedSmartEnergy } from "@/components/smart-energy-provider";
import { calculateAutonomy, weatherIcon, weatherLabel, type LoadStability } from "@/lib/smart-forecast";
import { InfoTip } from "@/components/info-tip";
import { AmpPill } from "@/components/amp-pill";
import { acAmpHours, acAmps } from "@/lib/energy";

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

function NightCard({
  title,
  startSoc,
  hours,
  loadW,
  averageNightLoadW,
  confidence,
  sampleCount,
  capacityWh,
  reservePct,
}: {
  title: string;
  startSoc: number;
  hours: number;
  loadW: number;
  averageNightLoadW: number | null;
  confidence: LoadStability;
  sampleCount: number;
  capacityWh: number;
  reservePct: number;
}) {
  const effectiveLoadW = averageNightLoadW ?? loadW;
  const result = calculateAutonomy(startSoc, capacityWh, effectiveLoadW, hours, reservePct);
  // Needs a real spread of night readings, not three taken a minute apart.
  const hasEnoughSamples = sampleCount >= 8;
  const confidenceClass = hasEnoughSamples
    ? result.sufficient
      ? "rounded-full bg-emerald-50 p-3 text-emerald-600"
      : "rounded-full bg-indigo-50 p-3 text-indigo-500"
    : "rounded-full bg-slate-100 p-3 text-slate-500";

  return (
    <div className="energy-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-500">{title}</p>
          <h3 className="mt-1 text-lg font-black text-slate-900">
            {hasEnoughSamples
              ? result.sufficient
                ? "تكفي حتى الصباح"
                : result.probability >= 90
                  ? "تكفي تقريبًا — على الحافة"
                  : "قد لا تكفي حتى الصباح"
              : "تقدير أولي — البيانات التاريخية غير كافية"}
          </h3>
        </div>
        <div className={confidenceClass}>
          <MoonStar size={21} />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className={"rounded-xl p-3 " + (result.sufficient ? "bg-emerald-50" : result.probability >= 90 ? "bg-amber-50" : "bg-rose-50")}>
          <span className="text-xs font-bold text-slate-500">تغطية الليل</span>
          <strong className={"mt-1 block font-black " + (hasEnoughSamples ? "text-2xl " + (result.sufficient ? "text-emerald-700" : result.probability >= 90 ? "text-amber-700" : "text-rose-700") : "text-sm text-slate-500")}>{hasEnoughSamples ? `${result.probability}%` : "غير كافٍ للتقدير بعد"}</strong>
        </div>
        <div className="rounded-xl bg-indigo-50 p-3">
          <span className="text-xs font-bold text-slate-500">المتوقع عند الشروق</span>
          <strong className={"mt-1 block font-black " + (hasEnoughSamples ? "text-2xl text-indigo-700" : "text-sm text-slate-500")}>{hasEnoughSamples ? `${result.expectedSocAtSunrise}%` : "غير كافٍ للتقدير بعد"}</strong>
        </div>
      </div>
      <div className="mt-3 space-y-2 text-sm font-semibold text-slate-500">
        <p>تغطية تقديرية {result.hoursCovered} ساعة عند متوسط استهلاك ليلي {Math.round(effectiveLoadW).toLocaleString("en-US")} واط <AmpPill tone="sky" amps={acAmps(effectiveLoadW)} className="mr-1 align-middle" /></p>
        <div className="flex flex-wrap items-center gap-2">
          <span className={confidence === "عالية" ? "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700" : confidence === "متوسطة" ? "rounded-full bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-700" : confidence === "منخفضة" ? "rounded-full bg-rose-50 px-2.5 py-1 text-xs font-black text-rose-700" : "rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600"}>ثقة استقرار الاستهلاك: {confidence}</span>
          <span className="text-xs">عينات ليلية: {sampleCount}</span>
        </div>
        {!hasEnoughSamples && <p className="text-xs font-bold text-slate-600">تظهر النسبة بعد تجمّع قراءات ليلية كافية.</p>}
        {averageNightLoadW === null && <p className="text-xs text-slate-500">لا توجد بيانات تاريخية ليلية كافية بعد؛ استُخدمت القراءة الحالية مؤقتًا.</p>}
      </div>
    </div>
  );
}

export function SmartForecast({ afterDay }: { afterDay?: React.ReactNode } = {}) {
  const { forecasts, weather, snapshot, loading, isRefreshing, error, nightLoadStats, calibration, batteryCapacityWh, reservePct, refresh } = useSharedSmartEnergy();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selected = forecasts[selectedIndex];
  const todayAfterSunset = selectedIndex === 0 && (selected?.sunset ? Date.now() > new Date(selected.sunset).getTime() : false);
  const current = weather?.current;

  // Arriving from the home card ("/energy#night"): the section only exists
  // after the forecast loads, so scroll once it is rendered.
  useEffect(() => {
    if (!forecasts.length || typeof window === "undefined" || window.location.hash !== "#night") return;
    requestAnimationFrame(() => document.getElementById("night")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [forecasts.length]);

  const currentNight = useMemo(() => {
    if (!forecasts.length) return null;
    const now = Date.now();
    const today = forecasts[0];
    const tomorrow = forecasts[1];
    if (!today || !tomorrow) return null;

    // After midnight and before today's sunrise we are still inside last night.
    const todaySunrise = new Date(today.sunrise).getTime();
    if (Number.isFinite(todaySunrise) && now < todaySunrise) {
      return { inProgress: true, startSoc: snapshot?.batterySoc ?? today.chargeAtSunrisePct, hours: Math.max(0.5, (todaySunrise - now) / 3600000) };
    }
    const todaySunset = new Date(today.sunset).getTime();
    if (Number.isFinite(todaySunset) && now < todaySunset) {
      return {
        inProgress: false,
        startSoc: today.chargeAtSunsetPct,
        hours: Math.max(0.5, (new Date(tomorrow.sunrise).getTime() - todaySunset) / 3600000),
      };
    }
    return {
      inProgress: true,
      startSoc: snapshot?.batterySoc ?? today.chargeAtSunsetPct,
      hours: Math.max(0.5, (new Date(tomorrow.sunrise).getTime() - now) / 3600000),
    };
  }, [forecasts, snapshot]);

  const tomorrowNight = useMemo(() => {
    const tomorrow = forecasts[1];
    const after = forecasts[2];
    if (!tomorrow || !after) return null;
    return {
      startSoc: tomorrow.chargeAtSunsetPct,
      hours: Math.max(0.5, (new Date(after.sunrise).getTime() - new Date(tomorrow.sunset).getTime()) / 3600000),
    };
  }, [forecasts]);

  const handleRefresh = async () => {
    const ok = await refresh();
    setToast(ok ? "تم تحديث التوقعات ☀️" : "تعذر التحديث، تم الاحتفاظ بآخر بيانات ناجحة");
  };

  const loadW = snapshot?.homePowerW ?? 0;

  return (
    <section dir="rtl" className="desktop-grid relative space-y-4">
      {toast && (
        <div role="status" aria-live="polite" className="fixed left-1/2 top-4 z-[80] -translate-x-1/2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 shadow-xl">
          {toast}
        </div>
      )}

      <header className="energy-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-200/70"><SunMedium className="h-5 w-5" aria-hidden="true" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black text-amber-600">Solar • الطاقة</p>
            <h1 className="mt-0.5 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">توقعات الطاقة</h1>
            <p className="mt-1 text-xs font-semibold text-slate-500">الأيام القادمة، البطارية والليل.</p>
          </div>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={loading || isRefreshing}
            className="flex h-11 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 text-sm font-black text-amber-700 disabled:opacity-60"
          >
            {loading || isRefreshing ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />}
            تحديث
          </button>
        </div>

        {current && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1.5 ring-1 ring-slate-200/70" title="توقع جوي من Open-Meteo، وليس قياساً من الإنفرتر">
            <span className="text-base leading-none">{weatherIcon(current.weather_code ?? 0)}</span>
            <span className="text-xs font-black text-slate-700">الآن: {weatherLabel(current.weather_code ?? 0)} · <bdi dir="ltr">{Math.round(current.temperature_2m ?? 0)}°</bdi></span>
          </div>
        )}

        {/* The forecast is scaled to what these panels really delivered on recent days. */}
        {calibration && (
          <p className="mt-2 text-[11px] font-bold leading-5 text-slate-500" title={`مقارنة ${calibration.hours} ساعة شمس: أنتجت الألواح ${calibration.measuredKWh} kWh مقابل ${calibration.expectedKWh} kWh في التقدير النظري`}>
            {calibration.status === "calibrated"
              ? <>🎯 التوقع معايَر على إنتاج ألواحك الفعلي في آخر {calibration.days} أيام: تعطي ألواحك <bdi dir="ltr">{Math.round(calibration.factor * 100)}%</bdi> من التقدير النظري.</>
              : calibration.status === "suspect"
                ? <>⚠️ ألواحك أعطت في آخر {calibration.days} أيام <bdi dir="ltr">{Math.round(calibration.ratio * 100)}%</bdi> فقط من التقدير النظري، وهذا أقل من أي منظومة سليمة. غالباً لم تجد الشمس مكاناً تذهب إليه (البطارية لا تقبل شحناً أسرع)، أو أن قدرة الألواح في الإعدادات غير دقيقة. لذلك لم نعدّل التوقع.</>
                : <>⏳ التوقع يتعلّم من إنتاج ألواحك الفعلي، ويبدأ بتعديل التوقع بعد حوالي أسبوع من القراءات.</>}
          </p>
        )}

        {error && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800">{error}.</p>}
      </header>

      {/* The day buttons sit on top of the day they open, in one card. */}
      {forecasts.length > 0 && (
        <section className="energy-card space-y-4 p-4 sm:p-5">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 pt-0.5 [scrollbar-width:none]">
        {forecasts.map((day, index) => (
          <button
            key={day.date}
            type="button"
            onClick={() => setSelectedIndex(index)}
            aria-pressed={selectedIndex === index}
            className={
              "shrink-0 basis-[calc((100%-1.5rem)/4)] rounded-2xl border px-1 py-2.5 text-center transition " +
              (selectedIndex === index
                ? "border-amber-400 bg-amber-50 text-amber-800 shadow-sm"
                : "border-slate-200 bg-white text-slate-600")
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
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-500">{selected.label} • {formatDate(selected.date)}</p>
                <h2 className="mt-0.5 text-xl font-black text-slate-950">{weatherIcon(selected.weatherCode)} {weatherLabel(selected.weatherCode)}</h2>
              </div>
              <span className="shrink-0 rounded-full bg-slate-50 px-3 py-1.5 text-xs font-black text-slate-600 ring-1 ring-slate-200/70">
                <bdi dir="ltr">{Math.round(selected.tempMin)}°</bdi> – <bdi dir="ltr">{Math.round(selected.tempMax)}°</bdi>
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-amber-50 p-4">
                <span className="text-xs font-bold text-slate-500">إنتاج الألواح المتوقع</span>
                <strong className="mt-1 block text-2xl font-black text-amber-700"><bdi dir="ltr">{selected.productionKWh}<small className="text-sm"> kWh</small></bdi></strong>
                <span className="mt-1.5 block"><AmpPill tone="amber" unit="Ah" amps={acAmpHours(selected.productionKWh)} /></span>
              </div>
              {/* Tile colour follows the confidence: green high, amber medium, rose low. */}
              <div className={`rounded-2xl p-4 ${selected.confidence === "عالية" ? "bg-emerald-50" : selected.confidence === "متوسطة" ? "bg-amber-50" : "bg-rose-50"}`}>
                <span className="text-xs font-bold text-slate-500">ثقة التوقع الجوي</span>
                <strong className={`mt-1 block text-2xl font-black ${selected.confidence === "عالية" ? "text-emerald-700" : selected.confidence === "متوسطة" ? "text-amber-700" : "text-rose-700"}`}>{selected.confidence}</strong>
              </div>
            </div>
            {/* The selected day's battery in one line: level at sunrise/now → sunset, and when it fills. */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-emerald-50/70 px-4 py-3">
              <span className="text-xs font-bold text-slate-500">🔋 البطارية</span>
              <span className="text-sm font-black text-slate-900">
                <span className="text-slate-400">{selectedIndex === 0 && Date.now() > new Date(selected.sunrise).getTime() ? "الآن" : "الشروق"}</span> <bdi dir="ltr">{selected.chargeAtSunrisePct}%</bdi>
                {/* After today's sunset the "sunset" value would only repeat the current level. */}
                {!todayAfterSunset && <>
                <span className="mx-2 text-slate-300">←</span>
                <span className="text-slate-400">الغروب</span> <bdi dir="ltr" className="text-emerald-700">{selected.chargeAtSunsetPct}%</bdi>
                </>}
              </span>
              <span className="w-full text-[11px] font-bold text-slate-500">{todayAfterSunset ? "غابت الشمس. اختر يوم الغد لترى شحن البطارية." : selected.fullChargeTime ? <>تمتلئ نحو <bdi dir="ltr" className="font-black text-emerald-700">{formatHour(selected.fullChargeTime)}</bdi></> : "لا يُتوقع أن تمتلئ هذا اليوم"}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-indigo-50/70 p-4">
                <span className="text-xs font-bold text-slate-500">🌅 الشروق</span>
                <strong className="mt-1 block text-lg font-black text-slate-900">{formatHour(selected.sunrise)}</strong>
              </div>
              <div className="rounded-2xl bg-orange-50/70 p-4">
                <span className="text-xs font-bold text-slate-500">🌇 الغروب</span>
                <strong className="mt-1 block text-lg font-black text-slate-900">{formatHour(selected.sunset)}</strong>
              </div>
            </div>
          </div>
          )}
        </section>
      )}


      {selected && (
        <>
          <section id="night" className="energy-card scroll-mt-40 p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-black text-slate-900">🌙 كفاية الليل</h2>
              <InfoTip label="كيف نحسب كفاية الليل" title="كفاية الليل">
                تقدير تقريبي يعتمد على نسبة البطارية، سعة البطارية، الاستهلاك الحالي والوقت المتوقع حتى الشروق، مع إبقاء حد الاحتياطي المحفوظ في الإعدادات.
              </InfoTip>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {currentNight && <NightCard title={currentNight.inProgress ? "الليلة الحالية" : "الليلة القادمة"} startSoc={currentNight.startSoc} hours={currentNight.hours} loadW={loadW} averageNightLoadW={nightLoadStats.averageW} confidence={nightLoadStats.confidence} sampleCount={nightLoadStats.sampleCount} capacityWh={batteryCapacityWh} reservePct={reservePct} />}
              {tomorrowNight && <NightCard title="ليلة الغد" startSoc={tomorrowNight.startSoc} hours={tomorrowNight.hours} loadW={loadW} averageNightLoadW={nightLoadStats.averageW} confidence={nightLoadStats.confidence} sampleCount={nightLoadStats.sampleCount} capacityWh={batteryCapacityWh} reservePct={reservePct} />}
            </div>
          </section>

          {afterDay}

          <details className="energy-card group p-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
              <h2 className="text-lg font-black text-slate-900">توزيع الطاقة الشمسية اليومية</h2>
              <ChevronDown size={20} className="text-slate-400 transition-transform group-open:rotate-180" />
            </summary>
            {/* Today only splits the hours still ahead, so the text and total say so. */}
            <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">{selectedIndex === 0 ? "ما تبقّى من إنتاج اليوم المتوقع: كم يذهب للمنزل مباشرة، وكم لشحن البطارية، وكم يبقى فائضاً." : "إنتاج اليوم المتوقع: كم يذهب للمنزل مباشرة، وكم لشحن البطارية، وكم يبقى فائضاً."}</p>
            {selected.splitKWh > 0 ? (
              <>
                <div className="mt-4 flex h-5 overflow-hidden rounded-full bg-slate-100" aria-label="توزيع إنتاج الطاقة الشمسية">
                  <div className="bg-sky-500" style={{ width: selected.homePct + "%" }} title={"المنزل " + selected.homePct + "%"} />
                  <div className="bg-emerald-500" style={{ width: selected.batteryPct + "%" }} title={"البطارية " + selected.batteryPct + "%"} />
                  <div className="bg-amber-400" style={{ width: selected.surplusPct + "%" }} title={"الفائض " + selected.surplusPct + "%"} />
                </div>
                <p className="mt-2 text-xs font-bold text-slate-500">{selectedIndex === 0 ? "المتبقي من إنتاج اليوم" : "إجمالي الإنتاج الشمسي المتوقع"}: <bdi dir="ltr">{selected.splitKWh} kWh</bdi></p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {[
                    ["استهلاك المنزل نهارًا", selected.homePct, selected.homeKWh, "text-sky-700", "bg-sky-50", "sky"],
                    ["شحن البطارية", selected.batteryPct, selected.batteryKWh, "text-emerald-700", "bg-emerald-50", "emerald"],
                    ["فائض بلا استخدام", selected.surplusPct, selected.surplusKWh, "text-amber-700", "bg-amber-50", "amber"],
                  ].map(([label, pct, kwh, textColor, bg, ampTone]) => (
                    <div key={String(label)} className={String(bg) + " rounded-2xl p-3"}>
                      <span className="block text-xs font-bold text-slate-500">{label}</span>
                      <strong className={"mt-1 block text-xl font-black " + String(textColor)}>{String(pct)}%</strong>
                      <span className="text-xs font-bold text-slate-500"><bdi dir="ltr">{String(kwh)} kWh</bdi></span>
                      <span className="mt-1.5 block"><AmpPill tone={ampTone as "sky" | "emerald" | "amber"} unit="Ah" amps={acAmpHours(Number(kwh))} /></span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm font-bold leading-6 text-slate-600">{selectedIndex === 0 ? "انتهى إنتاج الشمس لهذا اليوم. اختر يوم الغد من الأعلى لترى توزيعه." : "لا يُتوقع إنتاج شمسي يُذكر في هذا اليوم."}</p>
            )}
          </details>

        </>
      )}

    </section>
  );
}
