"use client";

import { BatteryFlowSplit } from "@/components/energy-split";
import React, { useCallback, useEffect, useState } from "react";
import { BatteryFull, Loader2, Zap } from "lucide-react";
import type { EnergySnapshot } from "@/lib/energy";
import { arabicDuration, batteryAmpHours, batteryAmps, batteryState, batteryStateLabel, batteryText } from "@/lib/energy";
import { AmpPill } from "@/components/amp-pill";
import { PageHeader } from "@/components/page-header";
import { SocChart } from "@/components/soc-chart";
import type { LoadPoint } from "@/components/load-chart";
import { startVisiblePolling } from "@/lib/visible-polling";

const REFRESH_MS = 15_000;
type BatterySettings = { batteryCapacityWh: number; batteryMinReservePct: number; batteryChemistry?: string | null; batteryNominalVoltage?: number };
type History = { points: LoadPoint[]; timezone: string; batteryToday: { chargeKWh: number; dischargeKWh: number } | null };

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

/** Ten cells, filled from the right (RTL) up to the charge; the reserve is a dashed line. */
const CELLS = 10;
const BODY = { x: 30, width: 250, gap: 4 } as const;

/** What the battery is doing, as the colour and direction of the line running round it. */
type Flow = "charging" | "discharging" | "low" | "idle";
const FLOW_STROKE: Record<Flow, string> = {
  charging: "stroke-emerald-500",
  discharging: "stroke-amber-500",
  low: "stroke-rose-500",
  idle: "stroke-slate-300",
};

function BatteryGauge({ soc, reservePct, tone, charging, flow, powerW }: { soc: number; reservePct: number; tone: string; charging: boolean; flow: Flow; powerW: number }) {
  // The dashes march one step (one dash and its gap, about 18 px) per cycle, so they move steadily rather than
  // racing round: 1.2 s a step at low power, easing to 0.55 s a step at 3 kW and above.
  const stepSeconds = Math.max(0.55, Math.min(1.2, 1.2 - (Math.abs(powerW) / 1000) * 0.22));
  const cell = (BODY.width - BODY.gap * (CELLS - 1)) / CELLS;
  const right = BODY.x + BODY.width;
  const reserveX = right - (reservePct / 100) * BODY.width;
  return (
    <svg viewBox="0 0 300 120" className="h-auto w-full" role="img" aria-label={`البطارية مشحونة ${Math.round(soc)}٪، والاحتياطي ${reservePct}٪`}>
      {/* Terminal on the left, body outline */}
      <rect x="4" y="42" width="14" height="36" rx="4" className="fill-slate-300" />
      <rect x="20" y="10" width="270" height="100" rx="16" className="fill-white stroke-slate-200" strokeWidth="3" />
      {/* The line round the body: a ring of short dashes that runs clockwise while charging and the other way while
          discharging. Idle, the outline simply takes the state's colour and stays still. */}
      {flow === "idle" ? (
        <rect x="20" y="10" width="270" height="100" rx="16" fill="none" className={FLOW_STROKE.idle} strokeWidth="3" />
      ) : (
        <rect
          x="20" y="10" width="270" height="100" rx="16" fill="none" pathLength={100}
          className={"battery-flow " + (flow === "charging" ? "" : "battery-flow-out ") + FLOW_STROKE[flow]}
          strokeWidth="3.5" strokeLinecap="round" strokeDasharray="1.5 1"
          style={{ animationDuration: `${stepSeconds.toFixed(2)}s` }}
        />
      )}
      {Array.from({ length: CELLS }, (_, i) => {
        const x = right - (i + 1) * cell - i * BODY.gap;
        const fill = Math.min(1, Math.max(0, soc / 10 - i));
        const width = cell * fill;
        return (
          <g key={i}>
            <rect x={x} y="20" width={cell} height="80" rx="5" className="fill-slate-100" />
            {width > 0 && <rect x={x + cell - width} y="20" width={width} height="80" rx="5" className={"fill-current motion-safe:transition-all motion-safe:duration-700 " + tone} />}
          </g>
        );
      })}
      {/* Reserve limit */}
      <line x1={reserveX} x2={reserveX} y1="14" y2="106" className="stroke-rose-400" strokeWidth="2" strokeDasharray="5 4" />
      {charging && <path d="M159 30 L141 64 H154 L148 92 L169 54 H156 Z" className="fill-amber-400 stroke-white" strokeWidth="3" strokeLinejoin="round" />}
    </svg>
  );
}

/** One instrument reading: label on top, value, then a small note. */
function Reading({ label, value, unit, note, muted = false }: { label: string; value: string; unit?: string; note?: React.ReactNode; muted?: boolean }) {
  return (
    <div className="min-w-0 px-3 first:pr-0 last:pl-0">
      <div className="text-[11px] font-bold text-slate-500">{label}</div>
      <div className={"mt-1 whitespace-nowrap text-xl font-black leading-7 " + (muted ? "text-slate-300" : "text-slate-900")}>
        {unit ? <bdi dir="ltr">{value}<small className="text-xs font-bold text-slate-500"> {unit}</small></bdi> : <bdi>{value}</bdi>}
      </div>
      <div className="mt-1 min-h-[20px] text-[11px] font-semibold leading-4 text-slate-400">{note}</div>
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
  const amps = snapshot ? batteryAmps(snapshot, settings?.batteryNominalVoltage) : null;
  const reservePct = settings?.batteryMinReservePct ?? 20;
  const capacityKWh = (settings?.batteryCapacityWh ?? 0) / 1000;
  const storedKWh = (soc / 100) * capacityKWh;
  const usableKWh = (Math.max(0, soc - reservePct) / 100) * capacityKWh;
  // Where the reserve line sits under the gauge, as a share of its width (matches BatteryGauge's geometry).
  const reserveLeftPct = ((280 - (reservePct / 100) * 250) / 300) * 100;
  const flow: Flow = !snapshot || state === "idle" ? "idle" : state === "charging" ? "charging" : soc <= reservePct + 5 ? "low" : "discharging";
  const flowNote = { charging: "تشحن الآن", discharging: "تغذّي البيت الآن", low: "تفرغ وهي قريبة من الاحتياطي", idle: "لا شحن ولا تفريغ" }[flow];

  return (
    <div className="desktop-grid w-full space-y-3 pb-4 text-right" dir="rtl">
      <PageHeader icon={BatteryFull} tone="emerald" eyebrow="Solar • البطارية" title="حالة البطارية" subtitle="الشحن والجهد والحرارة والوقت المتوقع." />

      {/* البطارية الآن: النسبة والحالة، ثم الشكل بخطه المتحرك، ثم الطاقة المخزّنة */}
      <section className="energy-card p-4">
        {loading && !snapshot ? (
          <div className="flex justify-center py-10"><Loader2 className="h-10 w-10 animate-spin text-emerald-500" aria-label="جاري تحميل القراءة" /></div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className={"text-5xl font-black leading-none " + toneText}><bdi dir="ltr">{snapshot ? Math.round(soc) + "%" : "—"}</bdi></div>
                <div className="mt-2 text-xs font-bold text-slate-500">{!snapshot ? "لا توجد قراءة" : eta ? (eta.label === "عند حد الاحتياطي" ? eta.label : (eta.charging ? "تمتلئ بعد " : "تصل للاحتياطي بعد ") + eta.label) : flowNote}</div>
              </div>
              {snapshot && (
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className={"inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black ring-1 " + (flow === "charging" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : flow === "low" ? "bg-rose-50 text-rose-700 ring-rose-200" : flow === "discharging" ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-slate-50 text-slate-500 ring-slate-200")}>
                    {state === "charging" && <Zap className="h-3.5 w-3.5" />}{batteryStateLabel(state)}
                  </span>
                  <span className="text-sm font-black text-slate-700"><bdi dir="ltr">{(Math.abs(powerW) / 1000).toFixed(2)}<small className="text-xs text-slate-500"> kW</small></bdi></span>
                  <AmpPill tone="emerald" amps={amps} muted={Math.abs(powerW) < 50} />
                </div>
              )}
            </div>

            <div className="mt-3">
              <BatteryGauge soc={soc} reservePct={reservePct} tone={toneText} charging={state === "charging"} flow={flow} powerW={powerW} />
            </div>
            {/* Scale under the cells: they fill from the right, so 0% is on the right and 100% by the terminal. */}
            <div className="relative mt-1 h-4 text-[10px] font-bold text-slate-400">
              <span className="absolute right-[3%]">0%</span>
              <span className="absolute -translate-x-1/2 whitespace-nowrap text-rose-500" style={{ left: `${reserveLeftPct}%` }}>الاحتياطي <bdi dir="ltr">{reservePct}%</bdi></span>
              <span className="absolute left-[7%]">100%</span>
            </div>

            {settings && snapshot && (
              <dl className="mt-4 grid grid-cols-2 divide-x divide-x-reverse divide-slate-100 rounded-2xl bg-slate-50/70 py-3">
                <div className="px-3">
                  <dt className="text-[11px] font-bold text-slate-500">المخزّن الآن</dt>
                  <dd className="mt-1"><span className="text-lg font-black text-slate-900"><bdi dir="ltr">{storedKWh.toFixed(2)}<small className="text-xs text-slate-500"> kWh</small></bdi></span><span className="mt-1 block"><AmpPill tone="emerald" unit="Ah" amps={batteryAmpHours(storedKWh, settings.batteryNominalVoltage)} /></span></dd>
                </div>
                <div className="px-3">
                  <dt className="text-[11px] font-bold text-slate-500">المتاح قبل الاحتياطي</dt>
                  <dd className="mt-1"><span className={"text-lg font-black " + (usableKWh > 0 ? "text-slate-900" : "text-rose-600")}><bdi dir="ltr">{usableKWh.toFixed(2)}<small className="text-xs text-slate-500"> kWh</small></bdi></span><span className="mt-1 block"><AmpPill tone="emerald" unit="Ah" amps={batteryAmpHours(usableKWh, settings.batteryNominalVoltage)} /></span></dd>
                </div>
              </dl>
            )}
          </>
        )}
      </section>

      {/* لوحة القياسات */}
      <section className="energy-card p-4">
        <div className="grid grid-cols-3 divide-x divide-x-reverse divide-slate-100">
          <Reading label="الجهد" value={snapshot?.batteryVoltage != null ? snapshot.batteryVoltage.toFixed(1) : "—"} unit={snapshot?.batteryVoltage != null ? "V" : undefined} muted={snapshot?.batteryVoltage == null} note={settings?.batteryNominalVoltage ? `الاسمي ${settings.batteryNominalVoltage} V` : undefined} />
          <Reading label="التيار" value={amps != null ? amps.toFixed(1) : "—"} unit={amps != null ? "A" : undefined} muted={amps == null} note={snapshot && state !== "idle" ? (state === "charging" ? "داخل للبطارية" : "خارج منها") : "لا تيار الآن"} />
          {snapshot?.batteryTemperature != null
            ? <Reading label="الحرارة" value={snapshot.batteryTemperature.toFixed(1)} unit="°C" note={snapshot.batteryTemperature >= 45 ? "مرتفعة" : "طبيعية"} />
            : <Reading label="الحرارة" value="—" muted note="تحتاج BMS" />}
        </div>
      </section>

      {/* البطارية اليوم */}
      <section className="energy-card p-4">
        <h2 className="text-sm font-black text-slate-900">البطارية اليوم</h2>
        <div className="mt-3 grid grid-cols-2 divide-x divide-x-reverse divide-slate-100">
          <Reading label="شُحن فيها" value={history?.batteryToday ? history.batteryToday.chargeKWh.toFixed(1) : "—"} unit={history?.batteryToday ? "kWh" : undefined} muted={!history?.batteryToday} note={<AmpPill tone="emerald" unit="Ah" amps={history?.batteryToday ? batteryAmpHours(history.batteryToday.chargeKWh, settings?.batteryNominalVoltage) : null} />} />
          <Reading label="خرج منها" value={history?.batteryToday ? history.batteryToday.dischargeKWh.toFixed(1) : "—"} unit={history?.batteryToday ? "kWh" : undefined} muted={!history?.batteryToday} note={<AmpPill tone="amber" unit="Ah" amps={history?.batteryToday ? batteryAmpHours(history.batteryToday.dischargeKWh, settings?.batteryNominalVoltage) : null} />} />
        </div>
      </section>

      {/* منحنى نسبة الشحن */}
      <section className="energy-card space-y-2 p-4">
        <h2 className="text-sm font-black text-slate-900">نسبة الشحن خلال آخر 24 ساعة</h2>
        {history && history.points.filter((p) => typeof p.soc === "number").length >= 2 ? (
          <>
            <BatteryFlowSplit points={history.points} now={Date.now()} />
            <div className="border-t border-slate-100 pt-3">
              <SocChart points={history.points} timeZone={history.timezone || "Asia/Beirut"} now={Date.now()} reservePct={settings?.batteryMinReservePct ?? 20} />
            </div>
          </>
        ) : (
          <p className="py-6 text-center text-xs font-semibold text-slate-400">يظهر المنحنى بعد تجمّع قراءات كافية (نحو ساعة من الاستخدام).</p>
        )}
      </section>

      {/* مواصفات البطارية من الإعدادات */}
      {settings && (
        <section className="energy-card desktop-wide p-4">
          <h2 className="text-sm font-black text-slate-900">مواصفات البطارية</h2>
          <dl className="mt-3 grid grid-cols-2 gap-2">
            {[
              { label: "النوع", value: settings.batteryChemistry || "—" },
              { label: "السعة", value: `${(settings.batteryCapacityWh / 1000).toFixed(2)} kWh`, pill: <AmpPill tone="emerald" unit="Ah" amps={batteryAmpHours(settings.batteryCapacityWh / 1000, settings.batteryNominalVoltage)} /> },
              { label: "الجهد الاسمي", value: settings.batteryNominalVoltage ? `${settings.batteryNominalVoltage} V` : "—" },
              { label: "حد الاحتياطي", value: `${settings.batteryMinReservePct}%` },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl bg-slate-50 p-3">
                <dt className="text-[11px] font-bold text-slate-500">{item.label}</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-1.5 text-base font-black text-emerald-700"><bdi dir="ltr">{item.value}</bdi>{item.pill}</dd>
              </div>
            ))}
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
