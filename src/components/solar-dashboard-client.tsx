"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Cpu, Moon } from "lucide-react";
import { EnergyFlow } from "@/components/energy-flow";
import type { EnergySnapshot } from "@/lib/energy";
import { chargerPriorityLabel, inverterModeLabel, outputPriorityLabel, batteryAmps, AC_VOLTS } from "@/lib/energy";
import { startVisiblePolling } from "@/lib/visible-polling";

const REFRESH_MS = 15_000;

/** الرئيسية = «الآن»: مخطط التدفق وأرقام اليوم، والحالة في الشريط العلوي الموحّد. */
export default function SolarDashboardClient() {
  const [snapshot, setSnapshot] = useState<EnergySnapshot | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [battery, setBattery] = useState<{ capacityWh: number; reservePct: number; nominal?: number } | null>(null);

  useEffect(() => {
    void fetch("/api/settings", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (data?.batteryCapacityWh) setBattery({ capacityWh: data.batteryCapacityWh, reservePct: data.batteryMinReservePct ?? 20, nominal: data.batteryNominalVoltage }); })
      .catch(() => {});
  }, []);

  const loadTelemetry = useCallback(async () => {
    try {
      const response = await fetch("/api/telemetry", { cache: "no-store" });
      if (!response.ok) throw new Error("telemetry_unavailable");
      const data = (await response.json()) as EnergySnapshot;
      if (data.source !== "live") throw new Error("telemetry_not_live");
      setSnapshot(data);
      setIsLive(!data.stale);
    } catch {
      // نُبقي آخر قراءة صحيحة؛ حالة الاتصال يعرضها الشريط العلوي.
      setIsLive(false);
    }
  }, []);

  useEffect(() => {
    void loadTelemetry();
    return startVisiblePolling(() => void loadTelemetry(), REFRESH_MS);
  }, [loadTelemetry]);

  // كم ساعة تكفي البطارية حتى حد الاحتياطي بالحمل الحالي (تقدير بسيط).
  const nightText = (() => {
    if (!snapshot || !battery) return "افتح التفاصيل لتقدير كفاية البطارية حتى الصباح.";
    const load = Math.max(snapshot.homePowerW, -snapshot.batteryPowerW, 0);
    if (snapshot.solarPowerW >= load && snapshot.solarPowerW > 50) return "الشمس تغطي الحمل الآن. اضغط لتقدير الليلة القادمة.";
    if (load < 30) return "الحمل شبه متوقف الآن، فالبطارية تكفي بسهولة.";
    const usableWh = (Math.max(0, snapshot.batterySoc - battery.reservePct) / 100) * battery.capacityWh;
    const hours = usableWh / load;
    if (hours <= 0) return "البطارية عند حد الاحتياطي الآن.";
    const shown = hours >= 24 ? "أكثر من 24 ساعة" : `نحو ${hours >= 10 ? Math.round(hours) : Math.round(hours * 10) / 10} ساعة`;
    return `بالحمل الحالي (${Math.round(load)} واط ≈ ${(load / AC_VOLTS).toFixed(1)} أمبير) تكفي ${shown} حتى حد الاحتياطي ${battery.reservePct}%.`;
  })();

  return (
    <div className="desktop-grid w-full space-y-3 text-right" dir="rtl">
      <EnergyFlow
        solarKw={(snapshot?.solarPowerW ?? 0) / 1000}
        homeKw={(snapshot?.homePowerW ?? 0) / 1000}
        gridKw={(snapshot?.gridPowerW ?? 0) / 1000}
        batteryKw={(snapshot?.batteryPowerW ?? 0) / 1000}
        batteryPercentage={snapshot?.batterySoc ?? Number.NaN}
        gridConnected={snapshot?.gridConnected ?? null}
        gridVoltage={snapshot?.gridVoltage}
        inverterMode={snapshot?.operatingMode}
        todayProductionKWh={snapshot?.todayProductionKWh}
        todayHomeUsageKWh={snapshot?.todayHomeUsageKWh}
        todayGridSavings={snapshot?.todayGridSavings}
        isLive={isLive}
        batteryAmps={batteryAmps(snapshot, battery?.nominal)}
        savingsCurrency={snapshot?.currency ? `${snapshot.currency} ` : undefined}
      />

      {/* On a computer these cards sit beside the flow diagram. */}
      <div className="space-y-3 lg:space-y-4">
      {/* الليلة: جواب مباشر من القراءة الحالية، والتفاصيل في قسم الليل بصفحة الطاقة */}
      <Link href="/energy#night" className="energy-card flex items-center gap-3 p-4 transition hover:border-indigo-200 hover:shadow-md">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500"><Moon className="h-5 w-5" aria-hidden="true" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-black text-slate-900">الليلة: هل تكفي البطارية؟</span>
          <span className="block text-xs font-semibold leading-5 text-slate-500">{nightText}</span>
        </span>
        <ChevronLeft className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
      </Link>

      {/* حالة الإنفرتر كما يرسلها بنفسه */}
      {snapshot && (snapshot.operatingMode || snapshot.inverterTemperature !== undefined) && (
        <section className="energy-card p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 ring-1 ring-sky-100"><Cpu className="h-5 w-5" aria-hidden="true" /></span>
            <div className="min-w-0">
              <h2 className="text-sm font-black text-slate-900">حالة الإنفرتر</h2>
              <p className="truncate text-[11px] font-bold text-slate-500">{inverterModeLabel(snapshot.operatingMode)}</p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl bg-slate-50 p-3">
              <span className="text-[11px] font-bold text-slate-500">الحمل من قدرته</span>
              <strong className="mt-0.5 block text-lg font-black text-sky-700"><bdi dir="ltr">{snapshot.loadPercent !== undefined ? `${Math.round(snapshot.loadPercent)}%` : "—"}</bdi></strong>
              {snapshot.loadPercent !== undefined && (
                <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-slate-200"><span className="block h-full rounded-full bg-sky-500" style={{ width: `${Math.min(100, Math.max(2, snapshot.loadPercent))}%` }} /></span>
              )}
            </div>
            <div className={"rounded-2xl p-3 " + ((snapshot.inverterTemperature ?? 0) >= 60 ? "bg-rose-50" : "bg-slate-50")}>
              <span className="text-[11px] font-bold text-slate-500">الحرارة</span>
              <strong className={"mt-0.5 block text-lg font-black " + ((snapshot.inverterTemperature ?? 0) >= 60 ? "text-rose-600" : "text-amber-600")}><bdi dir="ltr">{snapshot.inverterTemperature !== undefined ? `${Math.round(snapshot.inverterTemperature)} °C` : "—"}</bdi></strong>
            </div>
          </div>

          <dl className="mt-3 divide-y divide-slate-100 text-[13px]">
            {[
              ["أولوية المصدر", outputPriorityLabel(snapshot.outputPriority)],
              ["شحن البطارية", chargerPriorityLabel(snapshot.chargerPriority)],
              ["جهد مدخل الشبكة", /off.?grid|battery/i.test(snapshot.operatingMode ?? "") ? "غير مُقاس (منفصل)" : snapshot.gridVoltage !== undefined ? `${Math.round(snapshot.gridVoltage)} V` : "—"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-3 py-2">
                <dt className="shrink-0 font-bold text-slate-500">{label}</dt>
                <dd className="text-left font-black text-indigo-700"><bdi>{value}</bdi></dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      </div>
    </div>
  );
}
