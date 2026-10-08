import type { EnergySettings } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculateAutonomy } from "@/lib/smart-forecast";
import { sunTimes } from "@/lib/solar-core";
import { hourlyReadings, nightLoadFrom } from "@/lib/solar-calibration";

/**
 * Once each evening, right after sunset, decide whether the battery will last
 * until sunrise and log the verdict as one "[night] check" line. The hourly
 * monitoring task reads that line and notifies the owner when it is not "ok".
 * Uses the same autonomy formula as the Energy page's night card.
 */

const WINDOW_AFTER_SUNSET_MS = 90 * 60_000;
const ACTION = "night_check";

// The cron calls this every minute, but it only does anything for 90 minutes
// after sunset. Keeping the location in memory lets the other ~22 hours of
// calls return without touching the database at all.
const SETTINGS_CACHE_MS = 60 * 60_000;
type NightSettings = EnergySettings | null;
let cachedSettings: { at: number; settings: NightSettings } | null = null;

async function nightSettings() {
  if (cachedSettings && Date.now() - cachedSettings.at < SETTINGS_CACHE_MS) return cachedSettings.settings;
  const settings = await prisma.energySettings.findUnique({ where: { id: "default" } });
  cachedSettings = { at: Date.now(), settings };
  return settings;
}

export async function runNightCheck(now = new Date()) {
  const settings = await nightSettings();
  if (!settings) return;
  const { sunset } = sunTimes(now, settings.latitude, settings.longitude);
  if (now < sunset || now.getTime() - sunset.getTime() > WINDOW_AFTER_SUNSET_MS) return;

  // Once per evening, across every server instance.
  const done = await prisma.monitoringEvent.findFirst({ where: { action: ACTION, timestamp: { gte: sunset } }, select: { id: true } });
  if (done) return;

  const latest = await prisma.telemetryLog.findFirst({ orderBy: { timestamp: "desc" } });
  if (!latest || now.getTime() - latest.timestamp.getTime() > 15 * 60_000) return;

  const sunrise = sunTimes(new Date(now.getTime() + 12 * 3_600_000), settings.latitude, settings.longitude).sunrise;
  const hours = Math.max(0.5, (sunrise.getTime() - now.getTime()) / 3_600_000);
  const night = nightLoadFrom(await hourlyReadings(settings.timezone, 7));
  const loadW = night.averageW ?? Math.max(0, latest.loadPowerW);
  const reservePct = settings.batteryMinReservePct ?? 20;
  const result = calculateAutonomy(latest.batterySoc, settings.batteryCapacityWh, loadW, hours, reservePct);
  const verdict = result.sufficient ? "ok" : result.probability >= 90 ? "tight" : "short";

  const details = {
    verdict,
    soc: Math.round(latest.batterySoc),
    reservePct,
    loadW: Math.round(loadW),
    loadSource: night.averageW !== null ? `night_average_${night.sampleCount}h` : "current_reading",
    hoursToSunrise: Math.round(hours * 10) / 10,
    hoursCovered: result.hoursCovered,
    socAtSunrise: result.expectedSocAtSunrise,
  };
  await prisma.monitoringEvent.create({ data: { action: ACTION, success: verdict === "ok", details: JSON.stringify(details) } });
  console.info(`[night] check verdict=${verdict} soc=${details.soc} reserve=${reservePct} loadW=${details.loadW} (${details.loadSource}) hoursToSunrise=${details.hoursToSunrise} hoursCovered=${details.hoursCovered} socAtSunrise=${details.socAtSunrise}`);
}
