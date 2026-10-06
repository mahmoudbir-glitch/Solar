"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EnergySnapshot } from "@/lib/energy";
import { calculateLoadStability, estimateSolarKWh, weatherConfidence, type DayForecast, type HourlySolarPoint, type LoadStabilityResult } from "@/lib/smart-forecast";
import { startVisiblePolling } from "@/lib/visible-polling";
import type { Calibration } from "@/lib/solar-core";

/** Learned from the owner's own stored readings (see /api/forecast/calibration). */
type LearnedProfile = { calibration: Calibration; night: LoadStabilityResult };

type WeatherResponse = {
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    precipitation_probability?: number[];
    precipitation?: number[];
    cloud_cover?: number[];
    weather_code?: number[];
    shortwave_radiation?: number[];
    global_tilted_irradiance?: number[];
    direct_radiation?: number[];
    diffuse_radiation?: number[];
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    sunrise?: string[];
    sunset?: string[];
  };
  current?: {
    temperature_2m?: number;
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    precipitation?: number;
    weather_code?: number;
    cloud_cover?: number;
    wind_speed_10m?: number;
    is_day?: number;
  };
};

const DEFAULT_LAT = 33.8938;
const DEFAULT_LON = 35.5018;
const DEFAULT_TIMEZONE = "Asia/Beirut";
const SAFETY_RESERVE = 10;
const LOAD_HISTORY_KEY = "solar_home_load_history_v1";
const LOAD_HISTORY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
type LoadSample = { timestamp: string; homePowerW: number };

function beirutHour(timestamp: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: DEFAULT_TIMEZONE, hour: "2-digit", hour12: false }).formatToParts(new Date(timestamp));
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  return hour === 24 ? 0 : hour;
}

function updateNightLoadHistory(snapshot: EnergySnapshot | null): LoadStabilityResult {
  if (typeof window === "undefined" || !snapshot || snapshot.source !== "live" || !Number.isFinite(snapshot.homePowerW)) {
    return { averageW: null, coefficientOfVariation: null, confidence: "غير كافية", sampleCount: 0 };
  }
  const now = Date.now();
  let samples: LoadSample[] = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(LOAD_HISTORY_KEY) || "[]") as LoadSample[];
    samples = Array.isArray(parsed) ? parsed.filter((item) => Number.isFinite(new Date(item.timestamp).getTime()) && Number.isFinite(item.homePowerW)) : [];
  } catch {
    samples = [];
  }
  samples = samples.filter((item) => now - new Date(item.timestamp).getTime() <= LOAD_HISTORY_MAX_AGE_MS);
  const last = samples[samples.length - 1];
  if (!last || new Date(snapshot.timestamp).getTime() - new Date(last.timestamp).getTime() >= 60_000) {
    samples.push({ timestamp: snapshot.timestamp, homePowerW: Math.max(0, snapshot.homePowerW) });
  }
  try {
    localStorage.setItem(LOAD_HISTORY_KEY, JSON.stringify(samples.slice(-700)));
  } catch {
    // Private mode or a full quota must not stop the forecast.
  }
  const nightSamples = samples.filter((item) => {
    const hour = beirutHour(item.timestamp);
    return hour >= 18 || hour < 7;
  });
  return calculateLoadStability(nightSamples.map((item) => item.homePowerW));
}

function readNumber(key: string, fallback: number) {
  if (typeof window === "undefined") return fallback;
  const value = Number(localStorage.getItem(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function dayLabel(index: number, date: string) {
  if (index === 0) return "اليوم";
  if (index === 1) return "غداً";
  if (index === 2) return "بعد غد";
  return new Intl.DateTimeFormat("ar-LB-u-nu-latn", {
    timeZone: DEFAULT_TIMEZONE,
    weekday: "long",
  }).format(new Date(date + "T12:00:00"));
}

type SiteConfig = {
  panelCapacityKw: number;
  batteryCapacityWh: number;
  latitude: number;
  longitude: number;
  timezone: string;
  panelTilt: number | null;
  panelAzimuth: number | null;
  /** Battery reserve the owner saved (%), the floor for every discharge estimate. */
  reservePct: number;
};

/** Open-Meteo hourly key ("2026-10-01T14:00") for the current hour in the site's time zone. */
function currentHourKey(timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:00`;
}

/**
 * The forecast has to use what the owner saved in Settings. It used to read
 * localStorage keys that nothing writes, so it silently ran on 6 kW / 4.8 kWh
 * / Beirut whatever was configured. Falls back to those defaults only if the
 * settings request fails.
 */
async function loadSiteConfig(): Promise<SiteConfig> {
  const fallback: SiteConfig = {
    panelCapacityKw: readNumber("solar_panel_capacity", 6),
    batteryCapacityWh: readNumber("solar_battery_capacity", 4800),
    latitude: readNumber("solar_latitude", DEFAULT_LAT),
    longitude: readNumber("solar_longitude", DEFAULT_LON),
    timezone: DEFAULT_TIMEZONE,
    panelTilt: null,
    panelAzimuth: null,
    reservePct: SAFETY_RESERVE,
  };
  try {
    const response = await fetch("/api/settings", { cache: "no-store" });
    if (!response.ok) return fallback;
    const data = (await response.json()) as Record<string, unknown>;
    const num = (value: unknown, alt: number) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : alt);
    const opt = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
    return {
      panelCapacityKw: (() => { const w = num(data.panelPowerW, fallback.panelCapacityKw * 1000); return (w > 100_000 ? w / 1000 : w) / 1000; })(),
      batteryCapacityWh: num(data.batteryCapacityWh, fallback.batteryCapacityWh),
      latitude: typeof data.latitude === "number" && Number.isFinite(data.latitude) ? data.latitude : fallback.latitude,
      longitude: typeof data.longitude === "number" && Number.isFinite(data.longitude) ? data.longitude : fallback.longitude,
      timezone: typeof data.timezone === "string" && data.timezone ? data.timezone : fallback.timezone,
      panelTilt: opt(data.panelTilt),
      panelAzimuth: opt(data.panelAzimuth),
      reservePct:
        typeof data.batteryMinReservePct === "number" && data.batteryMinReservePct >= 0 && data.batteryMinReservePct < 100
          ? data.batteryMinReservePct
          : SAFETY_RESERVE,
    };
  } catch {
    return fallback;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function useSmartEnergy() {
  const [snapshot, setSnapshot] = useState<EnergySnapshot | null>(null);
  const snapshotRef = useRef<EnergySnapshot | null>(null);
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [forecasts, setForecasts] = useState<DayForecast[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batteryCapacityWh, setBatteryCapacityWh] = useState(4800);
  const [reservePct, setReservePct] = useState(SAFETY_RESERVE);
  const [nightLoadStats, setNightLoadStats] = useState<LoadStabilityResult>({ averageW: null, coefficientOfVariation: null, confidence: "غير كافية", sampleCount: 0 });
  const [calibration, setCalibration] = useState<Calibration | null>(null);

  const load = useCallback(async (mode: "initial" | "refresh" = "refresh"): Promise<boolean> => {
    if (mode === "initial") setLoading(true);
    else setIsRefreshing(true);

    try {
      const site = await loadSiteConfig();
      const { panelCapacityKw, latitude, longitude, batteryCapacityWh } = site;
      const useTilted = site.panelTilt !== null && site.panelAzimuth !== null;

      // A failed live reading must not block the weather forecast.
      const telemetryPromise = fetch("/api/telemetry", { cache: "no-store" }).catch(() => null);
      // Optional: without it the forecast runs on the plain weather estimate.
      const learnedPromise = fetch("/api/forecast/calibration", { cache: "no-store" })
        .then((response) => (response.ok ? (response.json() as Promise<LearnedProfile>) : null))
        .catch(() => null);
      const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
      weatherUrl.searchParams.set("latitude", String(latitude));
      weatherUrl.searchParams.set("longitude", String(longitude));
      weatherUrl.searchParams.set("timezone", site.timezone);
      weatherUrl.searchParams.set("forecast_days", "7");
      weatherUrl.searchParams.set(
        "current",
        "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,is_day",
      );
      weatherUrl.searchParams.set(
        "daily",
        "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset",
      );
      weatherUrl.searchParams.set(
        "hourly",
        "temperature_2m,precipitation_probability,precipitation,cloud_cover,weather_code,shortwave_radiation,direct_radiation,diffuse_radiation" + (useTilted ? ",global_tilted_irradiance" : ""),
      );
      if (useTilted) {
        // Settings store a compass bearing (0 = north, 180 = south). Open-Meteo
        // measures from south (0 = south, -90 = east, 90 = west).
        weatherUrl.searchParams.set("tilt", String(clamp(site.panelTilt!, 0, 90)));
        weatherUrl.searchParams.set("azimuth", String(clamp(((site.panelAzimuth! % 360) + 360) % 360 - 180, -180, 180)));
      }

      const [telemetryResponse, weatherResponse, learned] = await Promise.all([
        telemetryPromise,
        // A hung or failed weather call must not hold back the live reading.
        fetch(weatherUrl.toString(), { cache: "no-store", signal: typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(12_000) : undefined }).catch(() => null),
        learnedPromise,
      ]);
      const solarFactor = learned?.calibration?.status === "calibrated" && Number.isFinite(learned.calibration.factor) ? learned.calibration.factor : 1;
      setCalibration(learned?.calibration ?? null);

      let nextSnapshot: EnergySnapshot | null = snapshotRef.current;
      if (telemetryResponse?.ok) {
        const data = (await telemetryResponse.json()) as EnergySnapshot;
        if (data.source === "live") nextSnapshot = data;
      }

      // Keep the live reading current even when the weather service is down;
      // the previous forecast stays on screen with an error note.
      snapshotRef.current = nextSnapshot;
      setSnapshot(nextSnapshot);
      // Stored readings know every night, not only the nights the app was open.
      const browserStats = updateNightLoadHistory(nextSnapshot);
      const loadStats = learned?.night && learned.night.sampleCount >= 8 ? learned.night : browserStats;
      setNightLoadStats(loadStats);

      const nextWeather = weatherResponse?.ok ? ((await weatherResponse.json().catch(() => null)) as WeatherResponse | null) : null;
      const hourly = nextWeather?.hourly;
      const daily = nextWeather?.daily;

      if (!nextWeather || !hourly?.time?.length || !daily?.time?.length) {
        throw new Error("forecast_unavailable");
      }

      const currentLoadW = Math.max(0, nextSnapshot?.homePowerW ?? snapshotRef.current?.homePowerW ?? 0);
      // One instant's load (a kettle, a water heater) must not be assumed for a
      // whole week: nights use the measured night average, days use today's
      // average so far, and only fall back to the live load when unknown.
      const nightLoadW = loadStats.averageW ?? currentLoadW;
      const localNow = new Intl.DateTimeFormat("en-US", { timeZone: site.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
      const hoursElapsedToday = Number(localNow.slice(0, 2)) + Number(localNow.slice(3, 5)) / 60;
      const todayHomeKWh = nextSnapshot?.todayHomeUsageKWh;
      const dayLoadW = typeof todayHomeKWh === "number" && todayHomeKWh > 0 && hoursElapsedToday >= 3
        ? (todayHomeKWh * 1000) / hoursElapsedToday
        : currentLoadW;
      const initialSoc = clamp(nextSnapshot?.batterySoc ?? snapshotRef.current?.batterySoc ?? 50, 0, 100);
      let modeledBatteryWh = batteryCapacityWh * initialSoc / 100;

      const nextForecasts = daily.time.slice(0, 7).map((date, dayIndex) => {
        const indexes = hourly.time!.map((time, i) => ({ time, i })).filter(({ time }) => time.startsWith(date));
        const points: HourlySolarPoint[] = indexes.map(({ time, i }) => {
          // Open-Meteo radiation is the mean over the hour BEFORE its timestamp
          // (the 11:00 value covers 10:00–11:00). Our points are the hour that
          // starts at `time`, so they take the next entry; using the same index
          // shifted the whole solar day one hour late.
          const j = i + 1;
          const irradiance = (useTilted ? hourly.global_tilted_irradiance?.[j] : undefined) ?? hourly.shortwave_radiation?.[j] ?? 0;
          const solarKWh = estimateSolarKWh(irradiance, panelCapacityKw) * solarFactor;
          return {
            time,
            irradianceWm2: irradiance,
            weatherCode: hourly.weather_code?.[i] ?? 0,
            precipitationProbability: hourly.precipitation_probability?.[i] ?? 0,
            solarKWh,
            surplusKWh: 0,
            directRadiationWm2: hourly.direct_radiation?.[j] ?? 0,
            diffuseRadiationWm2: hourly.diffuse_radiation?.[j] ?? 0,
          };
        });

        let directHomeKWh = 0;
        let batteryChargeKWh = 0;
        let surplusKWh = 0;
        let dayStartSoc = modeledBatteryWh / batteryCapacityWh * 100;
        let sunsetSoc = dayStartSoc;
        let sunriseSoc = dayStartSoc;
        let sunriseSet = false;
        let sunsetSet = false;
        let fullChargeTime: string | null = null;
        const sunrise = daily.sunrise?.[dayIndex] ?? "";
        const sunset = daily.sunset?.[dayIndex] ?? "";

        // Today's hours that already passed must not be simulated again from the
        // current battery level: that inflated sunset charge, the full-charge time
        // and today's surplus window.
        const nowKey = currentHourKey(site.timezone);
        const simulated = dayIndex === 0 ? points.filter((point) => point.time >= nowKey) : points;

        // Only the rest of the current hour is still ahead of us.
        const minuteNow = Number(new Intl.DateTimeFormat("en-US", { timeZone: site.timezone, minute: "2-digit" }).format(new Date())) || 0;
        for (const point of simulated) {
          const isNowHour = dayIndex === 0 && point.time === nowKey;
          const share = isNowHour ? Math.max(0, 60 - minuteNow) / 60 : 1;
          const startMinute = isNowHour ? minuteNow : 0;
          const pointSolarKWh = point.solarKWh * share;
          const isDaylight = Boolean(sunrise && sunset && point.time >= sunrise.slice(0, 13) && point.time < sunset);
          const homeKWh = ((isNowHour ? currentLoadW : isDaylight ? dayLoadW : nightLoadW) / 1000) * share;
          const hourStartWh = modeledBatteryWh;
          const directHome = Math.min(homeKWh, pointSolarKWh);
          const netSolarAfterHome = Math.max(0, pointSolarKWh - directHome);
          const batteryCanTake = Math.max(0, batteryCapacityWh - modeledBatteryWh) / 1000;
          const charge = Math.min(netSolarAfterHome, batteryCanTake);
          const remaining = Math.max(0, netSolarAfterHome - charge);

          directHomeKWh += directHome;
          batteryChargeKWh += charge;
          surplusKWh += remaining;
          point.surplusKWh = Math.round(remaining * 100) / 100;

          if (pointSolarKWh < homeKWh) {
            const deficitWh = (homeKWh - pointSolarKWh) * 1000;
            const usableWh = Math.max(0, modeledBatteryWh - batteryCapacityWh * site.reservePct / 100);
            modeledBatteryWh -= Math.min(deficitWh, usableWh);
          }

          const beforeChargeWh = modeledBatteryWh;
          // Never lift a battery that is already below the reserve up to it.
          const floorWh = Math.min(modeledBatteryWh, batteryCapacityWh * site.reservePct / 100);
          modeledBatteryWh = clamp(modeledBatteryWh + charge * 1000, floorWh, batteryCapacityWh);

          // Sunrise/sunset fall inside an hour: read the level at that minute
          // (interpolated through the hour) rather than at the hour's end.
          const levelAt = (event: string) => {
            const minute = Number(event.slice(14, 16)) || 0;
            const from = isNowHour ? startMinute : 0;
            const f = clamp((minute - from) / Math.max(1, 60 - from), 0, 1);
            return (hourStartWh + (modeledBatteryWh - hourStartWh) * f) / batteryCapacityWh * 100;
          };
          point.socPct = Math.round((modeledBatteryWh / batteryCapacityWh) * 1000) / 10;
          if (sunrise && !sunriseSet && point.time.slice(0, 13) === sunrise.slice(0, 13)) {
            sunriseSoc = levelAt(sunrise);
            sunriseSet = true;
          } else if (sunrise && !sunriseSet && point.time > sunrise) {
            sunriseSoc = hourStartWh / batteryCapacityWh * 100;
            sunriseSet = true;
          }
          if (sunset && !sunsetSet && point.time.slice(0, 13) === sunset.slice(0, 13)) {
            sunsetSoc = levelAt(sunset);
            sunsetSet = true;
          } else if (sunset && !sunsetSet && point.time > sunset) {
            sunsetSoc = hourStartWh / batteryCapacityWh * 100;
            sunsetSet = true;
          }
          if (!fullChargeTime && modeledBatteryWh >= batteryCapacityWh * 0.995 && point.time <= sunset) {
            // Minute within the hour when the battery tops up, assuming the
            // hour's surplus arrives evenly.
            const neededWh = Math.max(0, batteryCapacityWh - beforeChargeWh);
            const rateWhPerMin = netSolarAfterHome > 0 ? (netSolarAfterHome * 1000) / Math.max(1, 60 - startMinute) : 0;
            const minute = Math.min(59, Math.round(startMinute + (rateWhPerMin > 0 ? neededWh / rateWhPerMin : 0)));
            fullChargeTime = `${point.time.slice(0, 14)}${String(minute).padStart(2, "0")}`;
          }
        }

        if (sunrise && (simulated[0]?.time ?? "") >= sunrise) {
          sunriseSoc = dayStartSoc;
        }

        // No production left to split (night, overcast): show 0/0/0, not 100% surplus.
        const produced = directHomeKWh + batteryChargeKWh + surplusKWh;
        const homePct = produced > 0 ? Math.round(directHomeKWh / produced * 100) : 0;
        const batteryPct = produced > 0 ? Math.min(100 - homePct, Math.round(batteryChargeKWh / produced * 100)) : 0;
        const surplusPct = produced > 0 ? Math.max(0, 100 - batteryPct - homePct) : 0;
        const confidence = weatherConfidence(
          points.map((p) => p.weatherCode),
          points.map((p) => p.precipitationProbability),
        );

        return {
          date,
          label: dayLabel(dayIndex, date),
          weatherCode: daily.weather_code?.[dayIndex] ?? 0,
          tempMax: daily.temperature_2m_max?.[dayIndex] ?? 0,
          tempMin: daily.temperature_2m_min?.[dayIndex] ?? 0,
          sunrise,
          sunset,
          productionKWh: Math.round(points.reduce((sum, point) => sum + point.solarKWh, 0) * 10) / 10,
          batteryPct,
          homePct,
          surplusPct,
          batteryKWh: Math.round(batteryChargeKWh * 10) / 10,
          homeKWh: Math.round(directHomeKWh * 10) / 10,
          surplusKWh: Math.round(surplusKWh * 10) / 10,
          splitKWh: Math.round(produced * 10) / 10,
          confidence,
          hourly: points,
          chargeAtSunsetPct: Math.round(clamp(sunsetSoc, 0, 100)),
          chargeAtSunrisePct: Math.round(clamp(sunriseSoc, 0, 100)),
          fullChargeTime,
        };
      });

      setBatteryCapacityWh(batteryCapacityWh);
      setReservePct(site.reservePct);
      setWeather(nextWeather);
      setForecasts(nextForecasts);
      setError(null);
      return true;
    } catch {
      setError("تعذر تحديث بيانات الطقس والتنبؤ");
      return false;
    } finally {
      if (mode === "initial") setLoading(false);
      else setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load("initial");
    return startVisiblePolling(() => void load("refresh"), 15 * 60 * 1000);
  }, [load]);

  return {
    snapshot,
    weather,
    forecasts,
    loading,
    isRefreshing,
    error,
    nightLoadStats,
    calibration,
    batteryCapacityWh,
    reservePct,
    refresh: () => load("refresh"),
  };
}
