import { prisma } from "@/lib/prisma";
import { calculateLoadStability, estimateSolarKWh, type LoadStabilityResult } from "@/lib/smart-forecast";
import { calibrationFactor, type Calibration, type HourReadings } from "@/lib/solar-core";

/**
 * Learns from the owner's own readings:
 * - how the panels really perform against the weather estimate (calibration),
 * - the house's typical load at night (from stored readings, so it does not
 *   depend on the app having been open in a browser at night).
 */

const LOOKBACK_DAYS = 14;
const CACHE_MS = 3 * 60 * 60_000;

export type LearnedProfile = { calibration: Calibration; night: LoadStabilityResult };

let cache: { at: number; value: LearnedProfile } | null = null;

type Settings = { latitude: number; longitude: number; timezone: string; panelPowerW: number; panelTilt: number | null; panelAzimuth: number | null };

async function loadSettings(): Promise<Settings> {
  const row = await prisma.energySettings.findUnique({ where: { id: "default" } }).catch(() => null);
  return {
    latitude: row?.latitude ?? 33.5911,
    longitude: row?.longitude ?? 35.4061,
    timezone: row?.timezone || "Asia/Beirut",
    panelPowerW: row?.panelPowerW ?? 6000,
    panelTilt: row?.panelTilt ?? null,
    panelAzimuth: row?.panelAzimuth ?? null,
  };
}

/** Local clock hour key ("2026-10-02T11:00"), the same format Open-Meteo uses. */
function hourKey(date: Date, timeZone: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:00`;
}

/** Stored readings averaged per local clock hour. */
export async function hourlyReadings(timeZone: string, days: number) {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await prisma.$queryRaw<Array<{ hour: string; pv: number; load: number; soc_max: number; battery: number; n: bigint }>>`
    SELECT to_char(date_trunc('hour', ("timestamp" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}), 'YYYY-MM-DD"T"HH24:00') AS hour,
           avg("pvPowerW")::float8 AS pv,
           avg("loadPowerW")::float8 AS load,
           max("batterySoc")::float8 AS soc_max,
           avg("batteryPowerW")::float8 AS battery,
           count(*) AS n
    FROM "TelemetryLog"
    WHERE "timestamp" >= ${since}
    GROUP BY 1
    ORDER BY 1`;
  return rows.map((row) => ({ hour: row.hour, pvW: row.pv, loadW: row.load, socMax: row.soc_max, batteryW: row.battery, samples: Number(row.n) }));
}

/** Average night load (19:00–06:00 local) from stored readings, one sample per hour. */
export function nightLoadFrom(rows: Array<{ hour: string; loadW: number; samples: number }>): LoadStabilityResult {
  const night = rows.filter((row) => {
    const h = Number(row.hour.slice(11, 13));
    return (h >= 19 || h < 6) && row.samples >= 3 && Number.isFinite(row.loadW);
  });
  return calculateLoadStability(night.map((row) => Math.max(0, row.loadW)));
}

async function expectedByHour(settings: Settings): Promise<Map<string, number>> {
  const useTilted = settings.panelTilt !== null && settings.panelAzimuth !== null;
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", settings.latitude.toFixed(4));
  url.searchParams.set("longitude", settings.longitude.toFixed(4));
  url.searchParams.set("timezone", settings.timezone);
  url.searchParams.set("past_days", String(LOOKBACK_DAYS));
  url.searchParams.set("forecast_days", "1");
  url.searchParams.set("hourly", "shortwave_radiation" + (useTilted ? ",global_tilted_irradiance" : ""));
  if (useTilted) {
    url.searchParams.set("tilt", String(Math.min(90, Math.max(0, settings.panelTilt!))));
    url.searchParams.set("azimuth", String((((settings.panelAzimuth! % 360) + 360) % 360) - 180));
  }
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`open_meteo_${response.status}`);
  const data = (await response.json()) as { hourly?: { time?: string[]; shortwave_radiation?: number[]; global_tilted_irradiance?: number[] } };
  const times = data.hourly?.time ?? [];
  const panelKw = settings.panelPowerW / 1000;
  const map = new Map<string, number>();
  times.forEach((time, i) => {
    // Same alignment as the forecast: a value is the mean of the hour BEFORE
    // its timestamp, so the hour starting at `time` takes the next entry.
    const j = i + 1;
    const irradiance = (useTilted ? data.hourly?.global_tilted_irradiance?.[j] : undefined) ?? data.hourly?.shortwave_radiation?.[j];
    if (typeof irradiance === "number") map.set(time, estimateSolarKWh(irradiance, panelKw));
  });
  return map;
}

export async function getLearnedProfile(): Promise<LearnedProfile> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const settings = await loadSettings();
  const rows = await hourlyReadings(settings.timezone, LOOKBACK_DAYS);
  const night = nightLoadFrom(rows.filter((row) => row.hour >= hourKey(new Date(Date.now() - 7 * 86_400_000), settings.timezone)));
  let calibration: Calibration = { factor: 1, ratio: 0, status: "learning", hours: 0, days: 0, measuredKWh: 0, expectedKWh: 0 };
  try {
    const expected = await expectedByHour(settings);
    calibration = calibrationFactor(rows as HourReadings[], expected, hourKey(new Date(), settings.timezone));
    // Hour by hour, so an odd factor can be explained from the logs.
    const daylight = rows.filter((row) => (expected.get(row.hour) ?? 0) >= 0.3).slice(-40);
    console.info("[calibration] hours " + daylight.map((row) => `${row.hour.slice(5)} pv=${Math.round(row.pvW)} exp=${Math.round((expected.get(row.hour) ?? 0) * 1000)} soc=${Math.round(row.socMax)} bat=${Math.round(row.batteryW)} load=${Math.round(row.loadW)} n=${row.samples}`).join(" | "));
  } catch (error) {
    // Weather service down: keep the plain estimate rather than failing the page.
    console.error("[calibration] weather_unavailable", error);
    return { calibration, night };
  }
  const value = { calibration, night };
  cache = { at: Date.now(), value };
  console.info(`[calibration] factor=${calibration.factor} ratio=${calibration.ratio} status=${calibration.status} hours=${calibration.hours} days=${calibration.days} measured=${calibration.measuredKWh} expected=${calibration.expectedKWh} nightW=${night.averageW ?? "-"} nightHours=${night.sampleCount}`);
  return value;
}
