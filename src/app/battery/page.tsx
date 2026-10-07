"use client";

import React, { useCallback, useEffect, useState } from "react";
import { BatteryCharging, BatteryFull, Clock, Gauge, Loader2, Thermometer, Zap } from "lucide-react";
import type { EnergySnapshot } from "@/lib/energy";
import { arabicDuration, batteryAmpHours, batteryAmps, batteryState, batteryStateLabel, batteryText } from "@/lib/energy";
import { AmpPill } from "@/components/amp-pill";
import { PageHeader } from "@/components/page-header";
import { SocChart } from "@/components/soc-chart";
import type { LoadPoint } from "@/components/load-chart";
import { startVisiblePolling } from "@/lib/visible-polling";

const REFRESH_MS = 15_000;
const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

type BatterySettings = { batteryCapacityWh: number; batteryMinReservePct: number; batteryChemistry?: string | null; batteryNominalVoltage?: number };
type History = { points: LoadPoint[]; timezone: string; batteryToday: { chargeKWh: number; dischargeKWh: number } | null; socToday: { min: number; max: number } | null };

/** تقدير الوقت المتبقي حتى الاكتمال أو حتى حدّ الاحتياطي، من السعة والقدرة الحالية. */
function estimate(soc: number, powerW: number, settings: BatterySettings | null) {
  if (!settings || Math.abs(powerW) < 50) return null;
  const capacity = settings.batteryCapacityWh;
  const charging = powerW > 0;
  const energyWh = charging ? ((100 - soc) / 100) * capacity : (Math.max(0, soc - settings.batteryMinReservePct) / 100) * capacity;
  if (!charging && energyWh <= 0) return { charging, label: "عند حد الاحتياطي" };
  const hours = energyWh / Math.abs(powerW);
  if (!Number.isFinite(hours)) return null;
  const minutes = Math.round(hours * 60);
  const label = hours > 48 ? "أكثر من 48 ساعة" : minutes < 1 ? "أقل من دقيقة" : arabicDuration(minutes);
  return { charging, label };
}

const METRIC_TONES = {
  amber: "bg-amber-50 text-amber-600",
  emerald: "bg-emerald-50 text-emerald-600",
  rose: "bg-rose-50 text-rose-500",
  sky: "bg-sky-50 text-sky-600",
  slate: "bg-slate-100 text-slate-500",
} as const;
/** A metric's number takes its icon's colour. */
const METRIC_VALUE_TONES = {
  amber: "text-amber-600",
  emerald: "text-emerald-700",
  rose: "text-rose-600",
  sky: "text-sky-700",
  slate: "text-slate-900",
} as const;

/** بطاقة قياس في الوسط: أيقونة ملوّنة، ثم اسم القياس، ثم القيمة، والملاحظة في الأسفل. كل البطاقات بنفس الارتفاع. */
function Metric({ icon: Icon, label, value, unit, hint, tone = "slate", valueClass = METRIC_VALUE_TONES[tone], pill }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; unit?: string; hint?: string; tone?: keyof typeof METRIC_TONES; valueClass?: string; pill?: React.ReactNode }) {
  return (
    <div className="energy-card flex h-full flex-col items-center px-2 py-4 text-center">
      <span className={"flex h-9 w-9 shrink-0 items-center justify-center rounded-xl " + METRIC_TONES[tone]}><Icon className="h-[18px] w-[18px]" /></span>
      <span className="mt-2 text-[11px] font-bold leading-tight text-slate-500">{label}</span>
      <div className={"mt-1 text-lg font-black leading-snug " + valueClass}>{unit ? <bdi dir="ltr">{value}<small className="text-sm"> {unit}</small></bdi> : <bdi>{value}</bdi>}</div>
      {(pill || hint) && (
        <div className="mt-auto flex flex-col items-center pt-2">
          {pill}
          {hint && <div className="mt-1 text-[10px] font-bold text-slate-400">{hint}</div>}
        </div>
      )}
    </div>
  );
}

export default function BatteryPage() {
  const [snapshot, setSnapshot] = useState<EnergySnapshot | null>(null);
  const [settings, setSettings] = useState<BatterySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<History | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/telemetry", { cache: "no-store" });
      if (!response.ok) throw new Error("telemetry_unavailable");
      const data = (await response.json()) as EnergySnapshot;
      if (data.source !== "live") throw new Error("not_live");
      setSnapshot(data);
    } catch {
      // نُبقي آخر قراءة صحيحة ظاهرة بدل استبدالها بأرقام تجريبية.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void fetch("/api/settings", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.batteryCapacityWh) setSettings({ batteryCapacityWh: d.batteryCapacityWh, batteryMinReservePct: d.batteryMinReservePct ?? 20, batteryChemistry: d.batteryChemistry, batteryNominalVoltage: d.batteryNominalVoltage }); }).catch(() => {});
    const loadHistory = () => void fetch("/api/telemetry/history", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setHistory(d as History); }).catch(() => {});
    loadHistory();
    const stopHistory = startVisiblePolling(loadHistory, 5 * 60_000);
    const stopLive = startVisiblePolling(() => void load(), REFRESH_MS);
    return () => {
      stopLive();
      stopHistory();
    };
  }, [load]);

  const soc = Math.min(100, Math.max(0, snapshot?.batterySoc ?? 0));
  const powerW = snapshot?.batteryPowerW ?? 0;
  const state = batteryState(powerW);
  const toneText = batteryText(soc);
  const eta = snapshot ? estimate(soc, powerW, settings) : null;

  return (
    <div className="desktop-grid w-full space-y-3 pb-4 text-right" dir="rtl">
      <PageHeader icon={BatteryFull} tone="emerald" eyebrow="Solar • البطارية" title="حالة البطارية" subtitle="الشحن والجهد والحرارة والوقت المتوقع." />

      {/* مؤشر دائري كبير لنسبة الشحن */}
      <section className="energy-card flex flex-col items-center p-6">
        {loading && !snapshot ? (
          <Loader2 className="h-10 w-10 animate-spin text-emerald-500" aria-label="جاري تحميل القراءة" />
        ) : (
          <>
            <div className="relative h-48 w-48">
              <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90" role="img" aria-label={"نسبة الشحن " + Math.round(soc) + "٪"}>
                <circle cx="64" cy="64" r={RADIUS} fill="none" stroke="currentColor" strokeWidth="10" className="text-slate-100" />
                <circle cx="64" cy="64" r={RADIUS} fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" className={toneText + " transition-all duration-700"} strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE * (1 - soc / 100)} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={"text-4xl font-black " + toneText}>{snapshot ? Math.round(soc) + "%" : "—"}</span>
                <span className="mt-1 text-xs font-bold text-slate-400">{snapshot ? batteryStateLabel(state) : "لا توجد قراءة"}</span>
              </div>
            </div>
            {snapshot && <p className="mt-3 text-sm font-bold text-slate-500">{Math.abs(powerW).toLocaleString("en-US")} واط</p>}
            {snapshot && <span className="mt-2"><AmpPill tone="emerald" amps={batteryAmps(snapshot)} muted={Math.abs(powerW) < 50} /></span>}
          </>
        )}
      </section>

      {/* بطاقات القياسات */}
      <div className="grid grid-cols-2 gap-3">
        <Metric icon={Zap} tone="amber" label="الجهد" value={snapshot?.batteryVoltage != null ? snapshot.batteryVoltage.toFixed(1) + " V" : "—"} hint={settings?.batteryNominalVoltage ? `الاسمي ${settings.batteryNominalVoltage} V` : undefined} />
        <Metric
          icon={Gauge}
          tone="emerald"
          label="القدرة والتيار"
          value={snapshot ? (Math.abs(powerW) / 1000).toFixed(2) : "—"}
          unit={snapshot ? "kW" : undefined}
          valueClass="text-emerald-700"
          pill={snapshot ? <AmpPill tone="emerald" amps={batteryAmps(snapshot)} muted={Math.abs(powerW) < 50} /> : undefined}
          hint={snapshot && state !== "idle" ? (state === "charging" ? "شحن" : "تفريغ") : undefined}
        />
        <Metric icon={Thermometer} tone="rose" label="حرارة البطارية" value={snapshot?.batteryTemperature != null ? snapshot.batteryTemperature.toFixed(1) + " °C" : "غير متاحة"} />
        <Metric icon={Clock} tone="sky" label={eta ? (eta.charging ? "اكتمال الشحن بعد" : "الوقت المتبقي") : "الوقت المتوقع"} value={eta ? eta.label : "—"} hint={eta ? "تقديري" : undefined} />
      </div>
      {eta && <p className="px-1 text-[11px] font-semibold text-slate-400">التقدير تقريبي: يُحسب من السعة المحفوظة في الإعدادات والقدرة الحالية، ويتغير مع تغيّر الحمل.</p>}
      {snapshot && snapshot.batteryTemperature == null && (
        <p className="rounded-2xl bg-amber-50 p-3 text-[11px] font-bold leading-5 text-amber-800">الحرارة والنسبة الدقيقة يرسلهما جهاز إدارة البطارية (BMS). تظهران بعد توصيل كابل الاتصال من منفذ CAN في البطارية إلى الإنفرتر.</p>
      )}

      {/* البطارية اليوم */}
      <section className="energy-card p-4">
        <h2 className="text-sm font-black text-slate-900">البطارية اليوم</h2>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="flex flex-col items-center rounded-2xl bg-emerald-50 px-1 py-3"><div className="text-[11px] font-bold text-slate-500">شحن</div><div className="mt-0.5 text-lg font-black leading-6 text-emerald-600"><bdi dir="ltr">{history?.batteryToday ? history.batteryToday.chargeKWh.toFixed(1) : "—"}<span className="text-[10px]"> kWh</span></bdi></div><div className="mt-auto pt-2"><AmpPill tone="emerald" unit="Ah" amps={history?.batteryToday ? batteryAmpHours(history.batteryToday.chargeKWh, settings?.batteryNominalVoltage) : null} /></div></div>
          <div className="flex flex-col items-center rounded-2xl bg-amber-50 px-1 py-3"><div className="text-[11px] font-bold text-slate-500">تفريغ</div><div className="mt-0.5 text-lg font-black leading-6 text-amber-600"><bdi dir="ltr">{history?.batteryToday ? history.batteryToday.dischargeKWh.toFixed(1) : "—"}<span className="text-[10px]"> kWh</span></bdi></div><div className="mt-auto pt-2"><AmpPill tone="amber" unit="Ah" amps={history?.batteryToday ? batteryAmpHours(history.batteryToday.dischargeKWh, settings?.batteryNominalVoltage) : null} /></div></div>
          <div className="flex flex-col items-center rounded-2xl bg-slate-50 px-1 py-3"><div className="text-[11px] font-bold text-slate-500">أدنى / أعلى</div><div className="mt-0.5 text-lg font-black leading-6 text-slate-800"><bdi dir="ltr">{history?.socToday ? `${Math.round(history.socToday.min)}–${Math.round(history.socToday.max)}%` : "—"}</bdi></div></div>
        </div>
      </section>

      {/* منحنى نسبة الشحن */}
      <section className="energy-card space-y-2 p-4">
        <h2 className="text-sm font-black text-slate-900">نسبة الشحن خلال آخر 24 ساعة</h2>
        {history && history.points.filter((p) => typeof p.soc === "number").length >= 2 ? (
          <SocChart points={history.points} timeZone={history.timezone || "Asia/Beirut"} now={Date.now()} reservePct={settings?.batteryMinReservePct ?? 20} />
        ) : (
          <p className="py-6 text-center text-xs font-semibold text-slate-400">يظهر المنحنى بعد تجمّع قراءات كافية (نحو ساعة من الاستخدام).</p>
        )}
      </section>

      {/* مواصفات البطارية من الإعدادات */}
      {settings && (
        <section className="energy-card desktop-wide p-4">
          <h2 className="text-sm font-black text-slate-900">مواصفات البطارية</h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-500">النوع</dt><dd className="text-left font-black text-emerald-700" dir="ltr">{settings.batteryChemistry || "—"}</dd>
            <dt className="text-slate-500">السعة</dt><dd className="text-left font-black text-emerald-700" dir="ltr">{(settings.batteryCapacityWh / 1000).toFixed(2)} kWh <AmpPill tone="emerald" unit="Ah" amps={batteryAmpHours(settings.batteryCapacityWh / 1000, settings.batteryNominalVoltage)} className="ml-1 align-middle" /></dd>
            <dt className="text-slate-500">الجهد الاسمي</dt><dd className="text-left font-black text-emerald-700" dir="ltr">{settings.batteryNominalVoltage ? `${settings.batteryNominalVoltage} V` : "—"}</dd>
            <dt className="text-slate-500">حد الاحتياطي</dt><dd className="text-left font-black text-emerald-700" dir="ltr">{settings.batteryMinReservePct}%</dd>
          </dl>
          <p className="mt-2 text-[11px] font-semibold text-slate-400">تُعدَّل من الإعدادات ← مواصفات العتاد.</p>
        </section>
      )}

      {!snapshot && !loading && (
        <div className="desktop-wide rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">لا توجد قراءة حية متاحة حاليًا.</div>
      )}
    </div>
  );
}
