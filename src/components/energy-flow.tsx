'use client';

import React, { useId, useState } from 'react';
import { BatteryCharging } from 'lucide-react';
import { GridTowerIcon, HouseIcon, InverterIcon, SolarPanelIcon } from '@/components/node-icons';
import { acAmpHours, acAmps, batteryText, homeText, solarText } from '@/lib/energy';
import { AmpPill } from '@/components/amp-pill';

interface EnergyFlowProps {
  solarKw: number;
  homeKw: number;
  gridKw: number;
  batteryKw: number;
  batteryPercentage: number;
  gridConnected?: boolean | null;
  /** Voltage the inverter measures on its grid input. */
  gridVoltage?: number;
  /** Inverter operating mode as reported (e.g. "Off-Grid Mode", "Mains Mode"). */
  inverterMode?: string;
  todayProductionKWh?: number;
  todayHomeUsageKWh?: number;
  todayGridSavings?: number;
  savingsCurrency?: string;
  isLive?: boolean;
  /** Battery current in amps (measured when available). */
  batteryAmps?: number | null;
}

const FLOW_THRESHOLD = 0.05;

export const EnergyFlow: React.FC<EnergyFlowProps> = ({
  solarKw,
  homeKw,
  gridKw,
  batteryKw,
  batteryPercentage,
  gridConnected = null,
  gridVoltage,
  inverterMode,
  todayProductionKWh,
  todayHomeUsageKWh,
  todayGridSavings,
  savingsCurrency = '$',
  isLive = false,
  batteryAmps = null,
}) => {
  const [activeNode, setActiveNode] = useState<'solar' | 'battery' | 'home' | 'grid' | 'inverter' | null>(null);
  const flowId = useId().replace(/:/g, '');
  const arrowId = `${flowId}-arrow-flow`;
  const glowId = `${flowId}-energy-glow`;
  const solarGlowStrength = Math.min(0.42, 0.12 + Math.abs(solarKw) * 0.035);
  const homeGlowStrength = Math.min(0.38, 0.10 + Math.abs(homeKw) * 0.03);
  const batteryGlowStrength = Math.min(0.40, 0.10 + Math.abs(batteryKw) * 0.035);
  const gridGlowStrength = Math.min(0.36, 0.10 + Math.abs(gridKw) * 0.03);
  const solarPulseDuration = Math.max(0.8, 2.2 - Math.min(Math.abs(solarKw), 8) * 0.16);
  const homePulseDuration = Math.max(0.85, 2.1 - Math.min(Math.abs(homeKw), 8) * 0.14);
  const batteryPulseDuration = Math.max(0.8, 2.2 - Math.min(Math.abs(batteryKw), 8) * 0.16);
  const gridPulseDuration = Math.max(0.85, 2.2 - Math.min(Math.abs(gridKw), 8) * 0.15);

  const measuredPowers = [solarKw, homeKw, gridKw, batteryKw];
  const hasNonZeroLiveReading = measuredPowers.every(Number.isFinite) && measuredPowers.some((value) => Math.abs(value) > FLOW_THRESHOLD);
  const liveFlowActive = isLive && hasNonZeroLiveReading;
  const solarToneClass = solarText(solarKw);
  const homeToneClass = homeText(homeKw);
  const batteryToneClass = batteryText(batteryPercentage);
  // No reading yet: a dash, not "0%" (an empty battery).
  const batterySocText = Number.isFinite(batteryPercentage) ? batteryPercentage.toFixed(0) + '%' : '—';

  const solarActive = liveFlowActive && solarKw > FLOW_THRESHOLD;
  const homeActive = liveFlowActive && homeKw > FLOW_THRESHOLD;
  const batteryCharging = liveFlowActive && batteryKw > FLOW_THRESHOLD;
  const batteryDischarging = liveFlowActive && batteryKw < -FLOW_THRESHOLD;
  const gridImporting = liveFlowActive && gridConnected !== false && gridKw > FLOW_THRESHOLD;
  const gridExporting = liveFlowActive && gridConnected !== false && gridKw < -FLOW_THRESHOLD;
  // In off-grid (battery) mode this inverter still reports ~230 V on "Grid
  // Voltage" even with the mains cut (its own screen shows 0 V), so that
  // number cannot prove the grid is there: say it is unused, show no voltage.
  const inverterOffGrid = /off.?grid|battery/i.test(inverterMode ?? "") && !gridImporting && !gridExporting;
  const gridAmps = gridVoltage !== undefined && Number.isFinite(gridVoltage) && gridVoltage > 0
    ? Math.abs(gridKw * 1000) / gridVoltage
    : acAmps(gridKw * 1000);


  // <bdi dir="ltr"> keeps "1.23 kW" in that order inside the RTL layout.
  const formatKw = (value: number) => <bdi dir="ltr">{Math.abs(value).toFixed(2) + ' kW'}</bdi>;
  const formatKwh = (value?: number) => value === undefined ? '—' : <bdi dir="ltr">{value.toFixed(1) + ' kWh'}</bdi>;
  const formatSavings = (value?: number) => value === undefined ? '—' : savingsCurrency + value.toFixed(2);

  const operatingMode = !isLive
    ? { label: 'بانتظار البيانات الحية', className: 'border-slate-200 bg-slate-50 text-slate-600' }
    : gridImporting && !solarActive && batteryDischarging
      ? { label: 'البطارية أولًا', className: 'border-violet-200 bg-violet-50 text-violet-700' }
      : gridImporting
        ? { label: 'الشبكة تغطي الحمل', className: 'border-sky-200 bg-sky-50 text-sky-700' }
        : solarActive && gridExporting
          ? { label: 'الشمس أولًا • تصدير الفائض', className: 'border-amber-200 bg-amber-50 text-amber-700' }
          : solarActive
            ? { label: 'الشمس أولًا', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' }
            : batteryDischarging
              ? { label: 'البطارية تغطي الحمل', className: 'border-violet-200 bg-violet-50 text-violet-700' }
              : { label: 'الوضع الحالي غير محدد', className: 'border-slate-200 bg-slate-50 text-slate-600' };

  // Every flow passes through the inverter (the hub in the middle), so each
  // node has its own spoke to the hub. A spoke's colour is its node's colour,
  // its direction follows the sign of that node's own power, and its width and
  // speed grow with the power it carries. Spokes stop just outside the hub and the icons so the arrowheads stay visible.
  type Spoke = { key: string; path: string; color: string; active: boolean; towardHub: boolean; kw: number };
  const reverse = (d: string) => {
    const n = d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    return `M ${n[6]} ${n[7]} C ${n[4]} ${n[5]}, ${n[2]} ${n[3]}, ${n[0]} ${n[1]}`;
  };
  // Layout (400x530 drawing): hub at (200,265); the four icons sit on a plus
  // shape, 120 units from the hub, so every spoke is the same straight length.
  const spokes: Spoke[] = [
    { key: "solar", path: "M 200 166 C 200 184, 200 201, 200 219", color: "#f59c00", active: solarActive, towardHub: true, kw: solarKw },
    { key: "grid", path: "M 113 265 C 127 265, 140 265, 154 265", color: "#8548f2", active: gridImporting || gridExporting, towardHub: !gridExporting, kw: gridKw },
    { key: "home", path: "M 287 265 C 273 265, 260 265, 246 265", color: "#2077f0", active: homeActive, towardHub: false, kw: homeKw },
    { key: "battery", path: "M 200 364 C 200 346, 200 329, 200 311", color: "#10ab5a", active: batteryCharging || batteryDischarging, towardHub: batteryDischarging, kw: batteryKw },
  ];
  // Power entering the inverter: sun + grid import + battery discharge.
  const throughputKw = Math.max(0, solarKw) + Math.max(0, gridKw) + Math.max(0, -batteryKw);
  const hubTurnSeconds = Math.round(Math.max(3, 14 - Math.min(throughputKw, 6) * 1.8) * 10) / 10;
  const spokeWidth = (kw: number) => 1.6 + Math.min(Math.abs(kw), 6) * 0.22;
  const spokeDuration = (kw: number) => Math.max(0.7, 2.4 - Math.min(Math.abs(kw), 6) * 0.28);

  return (
    <section className="relative mx-auto w-full max-w-lg overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white shadow-[0_18px_55px_rgba(82,55,38,0.09)]" aria-label="مخطط تدفق الطاقة">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(245,156,0,0.10),transparent_30%),radial-gradient(circle_at_14%_50%,rgba(133,72,242,0.08),transparent_28%),radial-gradient(circle_at_86%_50%,rgba(32,119,240,0.08),transparent_28%),radial-gradient(circle_at_50%_82%,rgba(16,171,90,0.09),transparent_30%)]" />

      <div className="relative px-4 pt-4 sm:px-6 sm:pt-5">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-extrabold text-emerald-700">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            تدفق الطاقة الآن
          </span>
        </div>
      </div>

      <div className="relative mx-auto mt-1 aspect-[400/530] w-full max-w-lg">
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 400 530" fill="none" aria-hidden="true">
          <defs>
            <filter id={glowId}><feGaussianBlur stdDeviation="2" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            {[["solar", "#f59c00"], ["grid", "#8548f2"], ["home", "#2077f0"], ["battery", "#10ab5a"]].map(([key, color]) => (
              <marker key={key} id={`${arrowId}-${key}-head`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto">
                <path d="M 1 1 L 9.5 5 L 1 9 L 3.2 5 z" fill={color} strokeLinejoin="round" />
              </marker>
            ))}
          </defs>

          {/* Thin geometric spokes. Idle: a quiet dotted line in the node's own
              colour (still visible). Active: a fine line with dashes running in
              the flow direction, two travelling sparks and a small chevron; the
              faster and slightly thicker, the more power it carries. */}
          {spokes.map((spoke) => {
            const d = spoke.towardHub ? spoke.path : reverse(spoke.path);
            const n = spoke.path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
            const ends: Array<[number, number]> = [[n[0], n[1]], [n[6], n[7]]];
            const w = spokeWidth(spoke.kw);
            const dur = spokeDuration(spoke.kw);
            return (
              <g key={spoke.key}>
                <path
                  id={`${arrowId}-${spoke.key}`}
                  d={d}
                  stroke={spoke.color}
                  strokeWidth={spoke.active ? w : 2}
                  strokeLinecap="round"
                  strokeDasharray={spoke.active ? undefined : "0.1 5"}
                  opacity={spoke.active ? 0.45 : 0.8}
                />
                {/* connector studs where the spoke meets the icon and the hub */}
                {ends.map(([x, y], i) => (
                  <circle key={i} cx={x} cy={y} r="2.3" fill="white" stroke={spoke.color} strokeWidth="1.3" opacity={spoke.active ? 1 : 0.8} />
                ))}
                {spoke.active && (
                  <path d={d} stroke={spoke.color} strokeWidth={w} strokeLinecap="round" strokeDasharray="9 7" filter={`url(#${glowId})`} markerEnd={`url(#${arrowId}-${spoke.key}-head)`}>
                    <animate attributeName="stroke-dashoffset" from="16" to="0" dur={`${dur / 2}s`} repeatCount="indefinite" />
                  </path>
                )}
                {spoke.active && [0, 1 / 3, 2 / 3].map((offset) => (
                  <circle key={offset} r={2.3 + Math.min(Math.abs(spoke.kw), 6) * 0.14} fill="white" stroke={spoke.color} strokeWidth="1.4" filter={`url(#${glowId})`}>
                    <animateMotion dur={`${dur}s`} begin={`${offset * dur}s`} repeatCount="indefinite" rotate="auto">
                      <mpath href={`#${arrowId}-${spoke.key}`} />
                    </animateMotion>
                  </circle>
                ))}
              </g>
            );
          })}

          {/* Inverter hub: a soft breathing glow and a dashed ring that turns
              faster the more power passes through; still and grey when idle. */}
          {liveFlowActive && (
            <circle cx="200" cy="265" r="36" fill="#a2a9ff" opacity="0.35">
              <animate attributeName="r" values="34;40;34" dur="2.6s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.35;0.08;0.35" dur="2.6s" repeatCount="indefinite" />
            </circle>
          )}
          <circle cx="200" cy="265" r="36" fill="white" stroke={liveFlowActive ? "#c5cbff" : "#dbe1f0"} strokeWidth="1.5" />
          <g>
            <circle cx="200" cy="265" r="42" fill="none" stroke={liveFlowActive ? "#5f5ff2" : "#c2cbe1"} strokeWidth="2" strokeDasharray="2 8" strokeLinecap="round" opacity={liveFlowActive ? 0.8 : 0.5} />
            {liveFlowActive && <animateTransform attributeName="transform" type="rotate" from="0 200 265" to="360 200 265" dur={`${hubTurnSeconds}s`} repeatCount="indefinite" />}
          </g>
        </svg>

        <button type="button" onClick={() => setActiveNode("solar")} aria-label="عرض تفاصيل الطاقة الشمسية" className="absolute left-1/2 top-[23.58%] z-10 -translate-x-1/2 -translate-y-1/2 transition-transform active:scale-95">
          <div
            className={"relative flex h-16 w-16 items-center justify-center rounded-full border-2 " + (solarActive ? "border-amber-200 bg-gradient-to-br from-amber-300 to-amber-500" : "border-slate-200 bg-slate-100")}
            style={solarActive ? { boxShadow: `0 10px 28px rgba(245,156,0,${solarGlowStrength}), 0 0 ${Math.round(18 + Math.abs(solarKw) * 3)}px rgba(245,156,0,${solarGlowStrength * 0.55})`, animation: `energy-node-pulse ${solarPulseDuration}s ease-in-out infinite` } : undefined}
          >
            <span className={solarActive ? "absolute inset-1 rounded-full border border-white/60 animate-pulse" : "hidden"} />
            <SolarPanelIcon active={solarActive} />
          </div>
          <div className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 w-[7.5rem] -translate-x-1/2 text-center">
            <div className="text-xs font-black text-slate-700">الطاقة الشمسية</div>
            <div className={"text-sm font-black " + solarToneClass}>{formatKw(solarKw)}</div>
            <div className="mt-1"><AmpPill tone="amber" amps={isLive ? acAmps(solarKw * 1000) : null} muted={!solarActive} /></div>
          </div>
        </button>

        <button type="button" onClick={() => setActiveNode("grid")} aria-label="عرض تفاصيل الشبكة" className="absolute left-[18%] top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 transition-transform active:scale-95">
          <div
            className={gridConnected === true && !inverterOffGrid ? "relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-violet-200 bg-gradient-to-br from-violet-400 to-violet-600" : "relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-slate-200 bg-slate-100"}
            style={gridConnected === true && (gridImporting || gridExporting) ? { boxShadow: `0 10px 24px rgba(133,72,242,${gridGlowStrength}), 0 0 ${Math.round(16 + Math.abs(gridKw) * 2.5)}px rgba(133,72,242,${gridGlowStrength * 0.5})`, animation: `energy-node-pulse ${gridPulseDuration}s ease-in-out infinite` } : undefined}
          >
            <GridTowerIcon active={gridConnected === true && !inverterOffGrid} />
          </div>
          <div className="pointer-events-none absolute left-1/2 top-full mt-1.5 w-[7.5rem] -translate-x-1/2 text-center">
            <div className="text-xs font-black text-slate-700">الشبكة</div>
            {/* Grid state first, then its power in kW, then the current. */}
            <div className={isLive && gridConnected === true && !inverterOffGrid ? "text-[11px] font-bold text-violet-500" : "text-[11px] font-bold text-slate-400"}>{gridConnected == null || !isLive ? "غير معروفة" : !gridConnected ? "مقطوعة" : gridImporting ? "تسحب منها" : gridExporting ? "تصدير" : inverterOffGrid ? "غير مستخدمة" : "جهد متوفر"}</div>
            <div className={gridImporting || gridExporting ? "text-sm font-black text-violet-600" : "text-sm font-black text-slate-500"}>{formatKw(gridKw)}</div>
            <div className="mt-1"><AmpPill tone="violet" amps={isLive ? gridAmps : null} muted={!gridImporting && !gridExporting} /></div>
          </div>
        </button>

        <button type="button" onClick={() => setActiveNode("home")} aria-label="عرض تفاصيل المنزل" className="absolute left-[82%] top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 transition-transform active:scale-95">
          <div
            className="relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-sky-200 bg-gradient-to-br from-sky-400 to-sky-600"
            style={homeActive ? { boxShadow: `0 10px 24px rgba(32,119,240,${homeGlowStrength}), 0 0 ${Math.round(16 + Math.abs(homeKw) * 2.5)}px rgba(32,119,240,${homeGlowStrength * 0.5})`, animation: `energy-node-pulse ${homePulseDuration}s ease-in-out infinite` } : undefined}
          >
            <HouseIcon />
          </div>
          <div className="pointer-events-none absolute left-1/2 top-full mt-1.5 w-[7.5rem] -translate-x-1/2 text-center">
            <div className="text-xs font-black text-slate-700">المنزل</div>
            <div className={"text-sm font-black " + homeToneClass}>{formatKw(homeKw)}</div>
            <div className="mt-1"><AmpPill tone="sky" amps={isLive ? acAmps(homeKw * 1000) : null} /></div>
          </div>
        </button>

        <button type="button" onClick={() => setActiveNode("battery")} aria-label="عرض تفاصيل البطارية" className="absolute left-1/2 top-[76.42%] z-10 -translate-x-1/2 -translate-y-1/2 transition-transform active:scale-95">
          <div
            className="relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-emerald-200 bg-gradient-to-br from-emerald-400 to-emerald-600"
            style={batteryCharging || batteryDischarging ? { boxShadow: `0 10px 28px rgba(16,171,90,${batteryGlowStrength}), 0 0 ${Math.round(18 + Math.abs(batteryKw) * 3)}px rgba(16,171,90,${batteryGlowStrength * 0.55})`, animation: `energy-node-pulse ${batteryPulseDuration}s ease-in-out infinite` } : undefined}
          >
            <div className="relative flex h-11 w-11 items-center justify-center rounded-full border-[3px] border-white/70 bg-white">
              <BatteryCharging className="absolute h-4 w-4 -translate-y-2.5 text-emerald-500" strokeWidth={2.3} />
              <span className={"mt-2 text-xs font-black " + batteryToneClass}>{batterySocText}</span>
            </div>
          </div>
          <div className="pointer-events-none absolute left-1/2 top-full mt-1.5 w-[7.5rem] -translate-x-1/2 text-center">
            <div className="text-xs font-black text-slate-700">البطارية {isLive && <span className="font-bold text-slate-400">· {batteryCharging ? "تشحن" : batteryDischarging ? "تفرغ" : "ثابتة"}</span>}</div>
            <div className={"text-sm font-black " + batteryToneClass}>{formatKw(batteryKw)}</div>
            <div className="mt-1"><AmpPill tone="emerald" amps={isLive ? batteryAmps : null} muted={!batteryCharging && !batteryDischarging} /></div>
          </div>
        </button>

        <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
          <button type="button" onClick={() => setActiveNode("inverter")} aria-label="عرض تفاصيل الإنفرتر" className={"relative flex h-14 w-14 items-center justify-center rounded-full border-2 transition-transform active:scale-95 " + (liveFlowActive ? "border-indigo-200 bg-gradient-to-br from-indigo-400 to-indigo-600 shadow-[0_8px_24px_rgba(77,71,224,0.35)]" : "border-slate-200 bg-slate-100")}>
            <InverterIcon active={liveFlowActive} />
          </button>
        </div>
      </div>

<style jsx>{`
  @keyframes energy-node-pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.055); }
  }
`}</style>

      <div className="relative mt-2 px-4 sm:px-6">
        {activeNode ? (
          <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur" role="status">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-black text-slate-900">
                {activeNode === "solar" && "تفاصيل الطاقة الشمسية"}
                {activeNode === "battery" && "تفاصيل البطارية"}
                {activeNode === "home" && "تفاصيل المنزل"}
                {activeNode === "grid" && "تفاصيل الشبكة"}
                {activeNode === "inverter" && "الإنفرتر"}
              </div>
              <button type="button" onClick={() => setActiveNode(null)} className="rounded-lg px-2 py-1 text-xs font-black text-slate-500 hover:bg-slate-100">إغلاق</button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              {activeNode === "solar" && (
                <>
                  <div className="rounded-xl bg-slate-50 p-3"><div className="font-bold text-slate-500">الإنتاج الآن</div><div className={"mt-1 font-black " + solarToneClass}>{formatKw(solarKw)}</div><div className="mt-1.5"><AmpPill tone="amber" amps={isLive ? acAmps(solarKw * 1000) : null} muted={!solarActive} /></div></div>
                  <div className="rounded-xl bg-slate-50 p-3"><div className="font-bold text-slate-500">الحالة</div><div className="mt-1 font-black text-slate-800">{solarActive ? "يولّد طاقة" : "لا يوجد توليد مؤكد"}</div></div>
                </>
              )}
              {activeNode === "battery" && (
                <>
                  <div className="rounded-xl bg-slate-50 p-3"><div className="font-bold text-slate-500">حالة الشحن</div><div className={"mt-1 font-black " + batteryToneClass}>{batterySocText}</div></div>
                  <div className="rounded-xl bg-slate-50 p-3"><div className="font-bold text-slate-500">القدرة</div><div className="mt-1 font-black text-slate-800">{formatKw(batteryKw)}</div><div className="mt-1.5"><AmpPill tone="emerald" amps={isLive ? batteryAmps : null} /></div></div>
                </>
              )}
              {activeNode === "home" && (
                <>
                  <div className="rounded-xl bg-slate-50 p-3"><div className="font-bold text-slate-500">الاستهلاك الآن</div><div className={"mt-1 font-black " + homeToneClass}>{formatKw(homeKw)}</div><div className="mt-1.5"><AmpPill tone="sky" amps={isLive ? acAmps(homeKw * 1000) : null} /></div></div>
                  <div className="rounded-xl bg-slate-50 p-3"><div className="font-bold text-slate-500">الحمل</div><div className="mt-1 font-black text-slate-800">{homeActive ? "نشط" : "لا توجد قراءة حية مؤكدة"}</div></div>
                </>
              )}
              {activeNode === "inverter" && (
                <>
                  <div className="rounded-xl bg-amber-50 p-3"><div className="font-bold text-slate-500">الطاقة المارّة الآن</div><div className="mt-1 font-black text-amber-700">{formatKw(throughputKw)}</div><div className="mt-1.5"><AmpPill tone="amber" amps={isLive ? acAmps(throughputKw * 1000) : null} /></div></div>
                  <div className="rounded-xl bg-slate-50 p-3"><div className="font-bold text-slate-500">دوره</div><div className="mt-1 font-black text-slate-800">يوزّع الطاقة بين الشمس والبطارية والشبكة والمنزل</div></div>
                </>
              )}
              {activeNode === "grid" && (
                <>
                  <div className="rounded-xl bg-violet-50 p-3"><div className="font-bold text-slate-500">الحالة</div><div className={"mt-1 font-black " + (gridConnected === true && !inverterOffGrid ? "text-violet-700" : "text-slate-600")}>{gridConnected == null ? "غير معروفة" : !gridConnected ? "مقطوعة" : inverterOffGrid ? "غير مستخدمة (منفصل)" : "متصلة"}</div></div>
                  <div className="rounded-xl bg-slate-50 p-3"><div className="font-bold text-slate-500">التدفق</div><div className="mt-1 font-black text-slate-800">{gridExporting ? "تصدير" : gridImporting ? "سحب" : "متوازن / لا يوجد تدفق"}</div></div>
                </>
              )}
            </div>
            <p className="mt-3 text-[11px] font-semibold text-slate-500">اضغط على أي أيقونة أخرى لعرض تفاصيلها. الأرقام من آخر قراءة للإنفرتر.</p>
          </div>
        ) : null}
      </div>

      {!liveFlowActive && <div className="relative mx-4 mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-center text-xs font-bold text-amber-800 sm:mx-6">⚠️ لا توجد قراءة حية متاحة حاليًا. تحقّق من اتصال الإنفرتر وإرسال بيانات القياس.</div>}

      <div className="relative border-t border-slate-100 bg-slate-50/70 px-3 py-4 sm:px-5">
        <div className="grid grid-cols-3 divide-x divide-x-reverse divide-slate-200 text-center">
          <div className="px-2"><div className="text-[11px] font-bold text-slate-500">إنتاج اليوم</div><div className="mt-1 text-base font-black text-amber-600 sm:text-lg">{formatKwh(todayProductionKWh)}</div><div className="mt-1.5"><AmpPill tone="amber" unit="Ah" amps={acAmpHours(todayProductionKWh)} /></div></div>
          <div className="px-2"><div className="text-[11px] font-bold text-slate-500">استهلاك اليوم</div><div className="mt-1 text-base font-black text-sky-700 sm:text-lg">{formatKwh(todayHomeUsageKWh)}</div><div className="mt-1.5"><AmpPill tone="sky" unit="Ah" amps={acAmpHours(todayHomeUsageKWh)} /></div></div>
          <div className="px-2"><div className="text-[11px] font-bold text-slate-500">وفر اليوم</div><div className="mt-1 text-base font-black text-emerald-600 sm:text-lg">{formatSavings(todayGridSavings)}</div></div>
        </div>
        {todayProductionKWh === undefined && todayHomeUsageKWh === undefined && <p className="mt-2 text-center text-[10px] font-semibold text-slate-400">تُحسب أرقام اليوم تلقائياً مع تجمّع القراءات.</p>}
      </div>
    </section>
  );
};
