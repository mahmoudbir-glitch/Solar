"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BatteryCharging, CheckCircle2, ChevronDown, Moon, Sparkles, Sun } from "lucide-react";
import type { EnergySnapshot } from "@/lib/energy";
import { acAmps } from "@/lib/energy";
import { AmpPill } from "@/components/amp-pill";
import { analyzeEnergy, trendContext, TREND_WINDOW_MS, type IntelligentEnergyContext, type IntelligentEnergySettings, type TrendPoint } from "@/lib/intelligent-energy";
import { sunTimes } from "@/lib/solar-core";

const DEFAULT_SETTINGS: IntelligentEnergySettings = { batteryCapacityWh: 4800, batteryMinReservePct: 10, inverterRatedPowerKw: null };
const DEFAULT_LOCATION = { latitude: 33.8938, longitude: 35.5018 };
const HISTORY_KEY = "solar_intelligent_energy_history_v2";
const MAX_HISTORY_SAMPLES = 120;
/** Around sunrise and sunset production moves on its own; a fall then is not a fault. */
const SUN_LOW_MS = 90 * 60_000;
/** How long after sunset (and before sunrise) the panels can still see usable light. */
const TWILIGHT_MS = 45 * 60_000;

type TrendSample = { timestamp: string; batterySoc: number; homePowerW: number; solarPowerW: number };
type SolarLocation = { latitude: number; longitude: number };
/** A point of /api/telemetry/history (ten-minute averages). */
export type HistoryPoint = { t: number; loadW: number; solarW: number; soc?: number };

/** Readings this device saw in the last hour, kept so the trend survives a page change. */
function readLocalSamples(now: number): TrendSample[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]") as TrendSample[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => {
      const time = new Date(item.timestamp).getTime();
      return Number.isFinite(time) && now - time >= 0 && now - time <= TREND_WINDOW_MS && Number.isFinite(item.batterySoc) && Number.isFinite(item.homePowerW) && Number.isFinite(item.solarPowerW);
    }).slice(-MAX_HISTORY_SAMPLES);
  } catch { return []; }
}

/**
 * The last hour as trend points: the stored readings the server already has
 * (so the trend is there the moment the app opens, on any device), plus what
 * this device saw since, plus the reading on screen.
 */
function collectTrendPoints(snapshot: EnergySnapshot | null, history: HistoryPoint[] | undefined): TrendPoint[] {
  if (typeof window === "undefined" || !snapshot || snapshot.source !== "live" || snapshot.stale) return [];
  const timestamp = new Date(snapshot.timestamp).getTime();
  if (!Number.isFinite(timestamp)) return [];
  const current: TrendSample = { timestamp: snapshot.timestamp, batterySoc: Math.min(100, Math.max(0, snapshot.batterySoc)), homePowerW: Math.max(0, snapshot.homePowerW), solarPowerW: Math.max(0, snapshot.solarPowerW) };

  const samples = readLocalSamples(timestamp);
  const last = samples[samples.length - 1];
  if (!last || timestamp - new Date(last.timestamp).getTime() >= 60_000) {
    samples.push(current);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(samples.slice(-MAX_HISTORY_SAMPLES))); } catch { /* private mode or full quota */ }
  }

  const stored = (history ?? [])
    .filter((point) => typeof point.soc === "number" && point.t < timestamp)
    .map((point) => ({ t: point.t, homePowerW: point.loadW, solarPowerW: point.solarW, batterySoc: point.soc as number }));
  const local = samples.map((item) => ({ t: new Date(item.timestamp).getTime(), homePowerW: item.homePowerW, solarPowerW: item.solarPowerW, batterySoc: item.batterySoc }));
  // The reading on screen is usually also the newest stored sample: count it once.
  const byTime = new Map<number, TrendPoint>();
  for (const point of [...stored, ...local, { t: timestamp, homePowerW: current.homePowerW, solarPowerW: current.solarPowerW, batterySoc: current.batterySoc }]) byTime.set(point.t, point);
  return [...byTime.values()].sort((a, b) => a.t - b.t);
}

export function IntelligentEnergyCard({ snapshot, history }: { snapshot: EnergySnapshot | null; history?: HistoryPoint[] }) {
  const [settings, setSettings] = useState<IntelligentEnergySettings>(DEFAULT_SETTINGS);
  const [solarLocation, setSolarLocation] = useState<SolarLocation>(DEFAULT_LOCATION);
  const [trend, setTrend] = useState<IntelligentEnergyContext>({});
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/settings", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: Record<string, unknown> | null) => {
        if (!active || !data) return;
        const capacity = typeof data.batteryCapacityWh === "number" && Number.isFinite(data.batteryCapacityWh) && data.batteryCapacityWh > 0 ? data.batteryCapacityWh : DEFAULT_SETTINGS.batteryCapacityWh;
        const reserve = typeof data.batteryMinReservePct === "number" && Number.isFinite(data.batteryMinReservePct) && data.batteryMinReservePct >= 0 && data.batteryMinReservePct < 100 ? data.batteryMinReservePct : DEFAULT_SETTINGS.batteryMinReservePct;
        const rated = typeof data.inverterRatedPowerKw === "number" && Number.isFinite(data.inverterRatedPowerKw) && data.inverterRatedPowerKw > 0 ? data.inverterRatedPowerKw : null;
        const latitude = typeof data.latitude === "number" && Number.isFinite(data.latitude) && data.latitude >= -90 && data.latitude <= 90 ? data.latitude : DEFAULT_LOCATION.latitude;
        const longitude = typeof data.longitude === "number" && Number.isFinite(data.longitude) && data.longitude >= -180 && data.longitude <= 180 ? data.longitude : DEFAULT_LOCATION.longitude;
        setSettings({ batteryCapacityWh: capacity, batteryMinReservePct: reserve, inverterRatedPowerKw: rated });
        setSolarLocation({ latitude, longitude });
      }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const points = collectTrendPoints(snapshot, history);
    setTrend(points.length ? trendContext(points, points[points.length - 1].t) : {});
  }, [snapshot, history]);

  // Night and the hours around sunrise and sunset, from the site's own position.
  const sun = useMemo(() => {
    if (!snapshot) return { isNight: false, sunLow: false };
    const instant = new Date(snapshot.timestamp);
    if (!Number.isFinite(instant.getTime())) return { isNight: false, sunLow: false };
    const { sunrise, sunset } = sunTimes(instant, solarLocation.latitude, solarLocation.longitude);
    // Twilight: for a while after sunset (and before sunrise) the sky is still
    // light and the panels really do give a few hundred watts, more so facing
    // west over an open horizon. That is low sun, not night: the reading is
    // real production and nothing to warn about.
    const t = instant.getTime();
    const isNight = t < sunrise.getTime() - TWILIGHT_MS || t > sunset.getTime() + TWILIGHT_MS;
    const sunLow = !isNight && (t - sunrise.getTime() < SUN_LOW_MS || sunset.getTime() - t < SUN_LOW_MS);
    return { isNight, sunLow };
  }, [snapshot, solarLocation]);

  const insight = useMemo(
    () => (snapshot ? analyzeEnergy(snapshot, settings, { ...trend, isNight: sun.isNight, sunLow: sun.sunLow }) : null),
    [snapshot, settings, trend, sun],
  );

  if (!insight) return null;

  const homeW = Math.max(0, snapshot?.homePowerW ?? 0);
  const homeKw = homeW / 1000;
  const homeAmps = acAmps(homeW);

  const tone = {
    green: { bg: "bg-emerald-50", border: "border-emerald-300", ring: "ring-1 ring-emerald-200/70", shadow: "shadow-[0_8px_24px_rgba(16,185,129,0.12)]", icon: "text-emerald-600", title: "text-emerald-900", dot: "bg-emerald-500" },
    amber: { bg: "bg-amber-50", border: "border-amber-300", ring: "ring-1 ring-amber-200/70", shadow: "shadow-[0_8px_24px_rgba(245,158,11,0.14)]", icon: "text-amber-600", title: "text-amber-900", dot: "bg-amber-500" },
    red: { bg: "bg-rose-50", border: "border-rose-300", ring: "ring-1 ring-rose-200/70", shadow: "shadow-[0_8px_24px_rgba(244,63,94,0.16)]", icon: "text-rose-600", title: "text-rose-900", dot: "bg-rose-500" },
    blue: { bg: "bg-sky-50", border: "border-sky-300", ring: "ring-1 ring-sky-200/70", shadow: "shadow-[0_8px_24px_rgba(14,165,233,0.10)]", icon: "text-sky-600", title: "text-sky-900", dot: "bg-sky-500" },
  }[insight.tone];
  const Icon = insight.tone === "green" ? CheckCircle2 : insight.tone === "red" ? AlertTriangle : insight.tone === "amber" ? BatteryCharging : sun.isNight ? Moon : Sun;

  return (
    <section className={`overflow-hidden rounded-2xl border ${tone.border} ${tone.bg} ${tone.ring} ${tone.shadow} transition-colors duration-500`} dir="rtl" aria-label="مراقبة Solar الذكي">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex w-full items-center gap-3 p-3.5 text-right transition hover:bg-white/40 active:bg-white/60">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/80 ${tone.icon}`}><Sparkles size={17} /></div>
        <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className={`whitespace-nowrap text-xs font-black ${tone.title}`}>مراقبة Solar الذكي</span>{insight.alert && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-700">تنبيه</span>}<Icon size={15} className={"hidden min-[360px]:block " + tone.icon} aria-hidden="true" /></div><div className={`mt-1 text-sm font-black ${tone.title}`}>{insight.title}</div></div>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/70 ${tone.icon} transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden="true"><ChevronDown size={17} /></span>
      </button>
      {open && <div className="border-t border-white/70 px-3.5 pb-3.5 pt-1">
        <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-white/70 px-3 py-2 ring-1 ring-inset ring-white/80">
          <span className="text-[10px] font-bold text-slate-500">الاستهلاك</span>
          <div className="flex items-center gap-2"><span className="text-xs font-black text-slate-800"><bdi dir="ltr">{homeKw.toFixed(2)} kW</bdi></span><AmpPill tone="sky" amps={homeAmps} /></div>
        </div>
        <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">{insight.summary}</p>
        {insight.alert && <p className="mt-2 text-xs font-black leading-5 text-slate-800">الإجراء: {insight.action}</p>}
        {insight.recommendation && <p className="mt-1.5 text-xs font-semibold leading-5 text-slate-600">{insight.recommendation}</p>}
        {/* Why the card says so: the figures and trends behind the verdict. */}
        {insight.details.length > 0 && (
          <ul className="mt-2.5 space-y-1.5 border-t border-white/70 pt-2.5">
            {insight.details.map((detail) => (
              <li key={detail} className="flex items-start gap-2 text-[11px] font-semibold leading-5 text-slate-600">
                <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />
                <span className="min-w-0">{detail}</span>
              </li>
            ))}
          </ul>
        )}
      </div>}
    </section>
  );
}
