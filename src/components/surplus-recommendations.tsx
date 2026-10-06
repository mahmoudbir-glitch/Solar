"use client";

import { useSharedSmartEnergy } from "@/components/smart-energy-provider";
import { AmpPill } from "@/components/amp-pill";
import { acAmpHours } from "@/lib/energy";

function formatHour(iso: string) {
  return new Intl.DateTimeFormat("ar-LB-u-nu-latn", {
    timeZone: "Asia/Beirut",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function addHour(iso: string) {
  return new Date(new Date(iso).getTime() + 60 * 60 * 1000).toISOString();
}

export function SurplusRecommendations() {
  const { forecasts, loading } = useSharedSmartEnergy();
  type Window = { start: string; end: string; kwh: number };
  const bestWindow = (dayIndex: number): Window | undefined => {
    const windows: Window[] = [];
    let current: Window | null = null;
    for (const point of forecasts[dayIndex]?.hourly ?? []) {
      if (point.surplusKWh >= 0.3) {
        if (!current) current = { start: point.time, end: point.time, kwh: 0 };
        current.end = point.time;
        current.kwh += point.surplusKWh;
      } else if (current) {
        windows.push(current);
        current = null;
      }
    }
    if (current) windows.push(current);
    return windows.sort((a, b) => b.kwh - a.kwh)[0];
  };

  // Today's remaining hours first; once today has no surplus left (evening,
  // or the battery still absorbs everything), look ahead to tomorrow.
  const todayBest = bestWindow(0);
  const tomorrowBest = todayBest ? undefined : bestWindow(1);
  const best = todayBest ?? tomorrowBest;
  const dayWord = todayBest ? "اليوم" : "غدًا";
  const todayLeftKWh = (forecasts[0]?.hourly ?? []).reduce((sum, point) => sum + point.surplusKWh, 0);

  // Hour by hour for the day the window belongs to: only hours still ahead
  // (they carry a modelled battery level) and with some sun.
  const detailHours = (forecasts[todayBest ? 0 : 1]?.hourly ?? []).filter(
    (point) => typeof point.socPct === "number" && point.solarKWh >= 0.05,
  );
  const maxSolar = Math.max(0.1, ...detailHours.map((point) => point.solarKWh));

  // Typical household loads with a rough energy cost, so each tip says
  // whether today's surplus actually covers it.
  const surplus = best?.kwh ?? 0;
  const loads = [
    { id: 1, title: "الغسالة", icon: "🧺", kwh: 0.8 },
    { id: 2, title: "مضخة المياه", icon: "💧", kwh: 0.75 },
    { id: 4, title: "المكيف", icon: "❄️", kwh: 1.2 },
    { id: 5, title: "سخان الماء", icon: "♨️", kwh: 2 },
  ];
  const recommendations = loads
    .filter((load) => load.kwh <= surplus)
    .map((load) => ({ id: load.id, kwh: load.kwh, title: load.title, icon: load.icon }));

  return (
    <section dir="rtl" className="energy-card overflow-hidden p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-xl ring-1 ring-amber-200/70" aria-hidden="true">⚡</span>
          <div className="min-w-0">
            <h2 className="text-lg font-black tracking-tight text-slate-950">أفضل وقت لاستخدام الشمس</h2>
            <p className="text-xs font-semibold text-slate-500">ساعات الفائض وما يمكن تشغيله فيها.</p>
          </div>
        </div>
      </div>

      {loading && (
        <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-base font-bold text-slate-500">
          جاري تحليل ساعات الفائض…
        </div>
      )}

      {!loading && best && (
        <>
          <div className="mt-4 rounded-3xl border border-amber-100 bg-gradient-to-br from-amber-50 via-white to-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <span className="inline-flex items-center gap-2 text-xs font-extrabold text-slate-500">
                  ☀️ النافذة الأفضل
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-black text-amber-800">{dayWord}</span>
                </span>
                <strong className="mt-2 block text-2xl font-black tracking-tight text-amber-700 sm:text-3xl">
                  {formatHour(best.start)} — {formatHour(addHour(best.end))}
                </strong>
              </div>
              <div className="rounded-2xl bg-white/90 px-4 py-3 text-right shadow-sm ring-1 ring-amber-100">
                <span className="block text-xs font-bold text-slate-500">قابل للاستخدام</span>
                <strong className="mt-1 block text-lg font-black text-slate-900">
                  نحو <bdi dir="ltr">{Math.round(best.kwh * 10) / 10} kWh</bdi>
                </strong>
                <span className="mt-1.5 block"><AmpPill tone="amber" unit="Ah" amps={acAmpHours(best.kwh)} /></span>
              </div>
            </div>
            {!todayBest && (
              <p className="mt-3 rounded-xl bg-white/80 px-3 py-2 text-xs font-bold leading-5 text-slate-500">
                لا فائض متبقٍ اليوم{todayLeftKWh < 0.3 ? ": ما تبقّى من الشمس يذهب للمنزل وشحن البطارية" : ""}. هذه نافذة الغد.
              </p>
            )}
          </div>

          {detailHours.length > 0 && (
            <details className="group mt-3 rounded-2xl border border-amber-100 bg-white">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-black text-amber-800 [&::-webkit-details-marker]:hidden">
                تفصيل الساعات
                <span className="text-xs text-amber-600 transition-transform group-open:rotate-180" aria-hidden="true">▾</span>
              </summary>
              <div className="border-t border-amber-100 px-3 pb-3">
                <div className="grid grid-cols-[4.5rem_1fr_3rem_3rem] items-center gap-x-2 py-2 text-[10px] font-black text-slate-400">
                  <span>الساعة</span>
                  <span>الشمس · <span className="text-amber-600">الفائض</span></span>
                  <span className="text-center">فائض</span>
                  <span className="text-center">🔋</span>
                </div>
                {detailHours.map((point) => {
                  const inWindow = point.time >= best.start && point.time <= best.end;
                  return (
                    <div key={point.time} className={"grid grid-cols-[4.5rem_1fr_3rem_3rem] items-center gap-x-2 rounded-lg py-1.5 text-[11px] font-bold " + (inWindow ? "bg-amber-50" : "")}>
                      <bdi dir="ltr" className="text-right text-slate-600">{formatHour(point.time)}</bdi>
                      <div className="relative h-2.5 overflow-hidden rounded-full bg-slate-100" title={`الشمس ${Math.round(point.solarKWh * 10) / 10} kWh`}>
                        <div className="absolute inset-y-0 right-0 rounded-full bg-amber-200" style={{ width: `${(point.solarKWh / maxSolar) * 100}%` }} />
                        <div className="absolute inset-y-0 right-0 rounded-full bg-amber-500" style={{ width: `${(point.surplusKWh / maxSolar) * 100}%` }} />
                      </div>
                      <bdi dir="ltr" className={"text-center " + (point.surplusKWh >= 0.05 ? "font-black text-amber-700" : "text-slate-400")}>{point.surplusKWh >= 0.05 ? (Math.round(point.surplusKWh * 10) / 10).toFixed(1) : "—"}</bdi>
                      <bdi dir="ltr" className="text-center text-emerald-700">{Math.round(point.socPct!)}%</bdi>
                    </div>
                  );
                })}
                <p className="mt-2 text-[10px] font-semibold leading-4 text-slate-500">الأرقام بالـ kWh لكل ساعة. الفائض هو ما يبقى بعد البيت وشحن البطارية، و🔋 مستوى البطارية في آخر الساعة. الصفوف المظللة هي النافذة الأفضل.</p>
              </div>
            </details>
          )}

          {/* What the surplus can run: one compact tile per appliance, no long text. */}
          {recommendations.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-black text-slate-500">💡 ما يمكن تشغيله بالفائض <span className="font-semibold text-slate-400">(لكل دورة أو ساعة)</span></h3>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {recommendations.map((item) => (
                  <div key={item.id} className="flex items-center gap-2.5 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-lg shadow-sm" aria-hidden="true">{item.icon}</span>
                    <div className="min-w-0">
                      <strong className="block truncate text-xs font-black text-slate-900">{item.title}</strong>
                      <span className="mt-0.5 flex items-center gap-1 text-[10px] font-bold text-slate-500">
                        <bdi dir="ltr">{item.kwh} kWh</bdi>
                        <AmpPill tone="emerald" unit="Ah" amps={acAmpHours(item.kwh)} className="!min-w-0 !px-1.5" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {!loading && !best && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm font-semibold text-slate-600">
          <span className="text-lg">☁️</span>
          <span className="leading-6">لا يُتوقع فائض اليوم ولا غدًا: كل إنتاج الألواح يذهب لاستهلاك المنزل وشحن البطارية. هذا طبيعي في الأيام الغائمة أو عندما يكون الاستهلاك مرتفعًا.</span>
        </div>
      )}
    </section>
  );
}
