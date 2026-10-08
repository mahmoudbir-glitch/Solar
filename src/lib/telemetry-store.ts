import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { TelemetryInput } from "@/lib/telemetry";
import { MONITORING_ACTIONS, pruneMonitoringEvents, recordMonitoringEvent } from "@/lib/monitoring";

type Settings = Awaited<ReturnType<typeof loadSettings>>;
type Sample = {
  timestamp: Date;
  pvPowerW: number;
  loadPowerW: number;
  batteryPowerW: number;
  batterySoc: number;
  gridPowerW: number | null;
  gridConnected: boolean | null;
  operatingMode?: string | null;
};
type Db = Prisma.TransactionClient | typeof prisma;

/** Arbitrary constant key for the Postgres advisory lock that serialises ingestion. */
const INGEST_LOCK_KEY = 727_101;

/**
 * Grid power for energy accounting. SmartESS often reports no grid power at
 * all; in that case, while the inverter runs from the mains, the grid supplies
 * whatever the house and battery take beyond the panels. Off-grid it is zero
 * (the leftover is inverter loss, not grid import).
 */
export function effectiveGridW(sample: Sample) {
  if (typeof sample.gridPowerW === "number" && Number.isFinite(sample.gridPowerW)) return sample.gridPowerW;
  const mode = sample.operatingMode ?? "";
  const onMains = /mains|line|grid|bypass|utility/i.test(mode) && !/off.?grid/i.test(mode);
  if (!onMains || sample.gridConnected !== true) return 0;
  return Math.max(0, sample.loadPowerW + sample.batteryPowerW - sample.pvPowerW);
}

export function loadSettings() {
  return prisma.energySettings.findUnique({ where: { id: "default" } });
}

// بداية اليوم حسب المنطقة الزمنية للمستخدم (وليس UTC) حتى لا ينقسم اليوم عند 02:00/03:00 محلياً
export function localDayStart(date: Date, timeZone?: string | null) {
  try {
    const text = new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
    const [y, m, d] = text.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  } catch {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }
}

async function updateDailySummary(
  db: Db,
  timestamp: Date,
  previous: Sample | null,
  current: Sample,
  settings: Settings,
) {
  if (!previous) return;

  // Integrate only between close readings. After an outage (app closed, dongle
  // offline) the old reading says nothing about the gap, so it is not counted
  // rather than averaged over an invented 20 minutes.
  const hours = Math.max((timestamp.getTime() - previous.timestamp.getTime()) / 3_600_000, 0);
  if (hours <= 0 || hours > 0.25) return;

  const avg = (a: number, b: number) => ((a + b) / 2 / 1000) * hours;
  // Positive and negative parts are averaged separately so a reading that
  // flips from charging to discharging is not cancelled out to zero.
  const pos = (a: number, b: number) => avg(Math.max(0, a), Math.max(0, b));
  const neg = (a: number, b: number) => avg(Math.max(0, -a), Math.max(0, -b));
  const solarKWh = pos(previous.pvPowerW, current.pvPowerW);
  const homeKWh = pos(previous.loadPowerW, current.loadPowerW);
  const batteryChargeKWh = pos(previous.batteryPowerW, current.batteryPowerW);
  const batteryDischargeKWh = neg(previous.batteryPowerW, current.batteryPowerW);
  const gridPrev = effectiveGridW(previous);
  const gridNow = effectiveGridW(current);
  const gridImportKWh = pos(gridPrev, gridNow);
  const gridExportKWh = neg(gridPrev, gridNow);

  const tariff = settings?.gridTariff ?? 0;
  const exportTariff = settings?.exportTariff ?? 0;
  // What the house would have cost on the grid, minus what was really bought.
  // Signed on purpose: while the grid charges the battery this is negative,
  // and it comes back when the battery later feeds the house. Clamping each
  // interval at zero counted that grid energy as saved.
  const avoidedGridKWh = homeKWh - gridImportKWh;
  const savings = avoidedGridKWh * tariff + gridExportKWh * exportTariff;
  const day = localDayStart(timestamp, settings?.timezone);

  await db.dailySummary.upsert({
    where: { day },
    create: {
      day,
      solarKWh,
      homeKWh,
      batteryChargeKWh,
      batteryDischargeKWh,
      gridImportKWh,
      gridExportKWh,
      savings,
      currency: settings?.currency ?? "USD",
    },
    update: {
      solarKWh: { increment: solarKWh },
      homeKWh: { increment: homeKWh },
      batteryChargeKWh: { increment: batteryChargeKWh },
      batteryDischargeKWh: { increment: batteryDischargeKWh },
      gridImportKWh: { increment: gridImportKWh },
      gridExportKWh: { increment: gridExportKWh },
      savings: { increment: savings },
    },
  });
}

// تنبيه عند "عبور" الحد فقط، بدل تسجيل حدث جديد مع كل قراءة (كل 5-60 ثانية)
function collectAlerts(previous: Sample | null, row: Sample, s: NonNullable<Settings>) {
  const events: Array<{ action: string; details: string }> = [];

  const wasCritical = previous ? previous.batterySoc <= s.criticalBatteryPct : false;
  const wasLow = previous ? previous.batterySoc <= s.lowBatteryPct : false;
  if (row.batterySoc <= s.criticalBatteryPct) {
    if (!wasCritical) events.push({ action: "ALERT_CRITICAL_BATTERY", details: `batterySoc=${row.batterySoc}` });
  } else if (row.batterySoc <= s.lowBatteryPct) {
    if (!wasLow) events.push({ action: "ALERT_LOW_BATTERY", details: `batterySoc=${row.batterySoc}` });
  }

  if (s.inverterRatedPowerKw) {
    const limit = s.inverterRatedPowerKw * 1000 * (s.overloadPct / 100);
    const wasOver = previous ? previous.loadPowerW >= limit : false;
    if (row.loadPowerW >= limit && !wasOver) {
      events.push({ action: "ALERT_OVERLOAD", details: `loadPowerW=${row.loadPowerW}` });
    }
  }

  if (previous && s.gridOutageAlert && typeof previous.gridConnected === "boolean" && typeof row.gridConnected === "boolean" && previous.gridConnected !== row.gridConnected) {
    events.push({
      action: row.gridConnected ? "ALERT_GRID_RESTORED" : "ALERT_GRID_OUTAGE",
      details: `gridConnected=${row.gridConnected}`,
    });
  }
  return events;
}


/**
 * Supabase's free plan stops writes once the database passes 500 MB. Minute
 * readings grow by roughly 10 MB a month, so this should never trigger; if it
 * does, readings older than SIZE_GUARD_KEEP_DAYS are deleted. Daily totals
 * (DailySummary) are kept, so the history pages still show those days.
 */
const SIZE_GUARD_BYTES = 400 * 1024 * 1024;
const SIZE_GUARD_KEEP_DAYS = 90;

export async function guardDatabaseSize() {
  const [row] = await prisma.$queryRaw<Array<{ bytes: bigint }>>`SELECT pg_database_size(current_database())::bigint AS bytes`;
  const bytes = Number(row?.bytes ?? 0);
  console.info(`[db] size_mb=${(bytes / 1024 / 1024).toFixed(1)}`);
  if (bytes < SIZE_GUARD_BYTES) return;
  const cutoff = new Date(Date.now() - SIZE_GUARD_KEEP_DAYS * 86_400_000);
  const { count } = await prisma.telemetryLog.deleteMany({ where: { timestamp: { lt: cutoff } } });
  console.warn(`[db] size_guard deleted=${count} readings older than ${SIZE_GUARD_KEEP_DAYS} days`);
}

/**
 * Stores one reading and runs the follow-up work (daily totals, alerts,
 * retention, connection status). Shared by the gateway ingest route and the
 * SmartESS cloud reader so both feed the dashboard identically.
 *
 * Throws only if the reading itself could not be written. Failures after that
 * are logged and swallowed: the reading is already stored, and reporting an
 * error would make a gateway resend it and create duplicates.
 */
export async function ingestSample(input: TelemetryInput) {
  const timestamp = new Date(input.timestamp ?? new Date().toISOString());
  const data = {
    timestamp,
    pvPowerW: input.pv_power,
    loadPowerW: input.load_power,
    batterySoc: input.battery_soc,
    batteryPowerW: input.battery_power,
    batteryVoltage: input.battery_voltage,
    batteryCurrent: input.battery_current,
    batteryTemperature: input.battery_temperature,
    gridConnected: input.grid_status ?? null,
    gridPowerW: input.grid_power,
    gridVoltage: input.grid_voltage,
    inverterTemperature: input.inverter_temperature,
    loadPercent: input.load_percent,
    operatingMode: input.operating_mode,
    outputPriority: input.output_priority,
    chargerPriority: input.charger_priority,
    source: input.source,
  };
  const settings = await loadSettings().catch(() => null);

  // Read-latest, insert and add-to-today must happen as one step: two syncs
  // overlapping (cron + dashboard) would otherwise both integrate from the same
  // previous reading and count that interval twice. A transaction-scoped
  // advisory lock serialises them across serverless instances.
  let latest: Sample | null = null;
  let row: Sample;
  let summaryDone = false;
  try {
    ({ latest, row } = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(${INGEST_LOCK_KEY})::text`;
      const previous: Sample | null = await tx.telemetryLog.findFirst({ where: { timestamp: { lt: timestamp } }, orderBy: { timestamp: "desc" } });
      const created: Sample = await tx.telemetryLog.create({ data });
      await updateDailySummary(tx, timestamp, previous, created, settings);
      return { latest: previous, row: created };
    }, { timeout: 15_000 }));
    summaryDone = true;
  } catch (error) {
    // A duplicate timestamp is a real rejection; anything else (lock or
    // transaction support) falls back to the plain path so readings never stop.
    if ((error as { code?: string })?.code === "P2002") throw error;
    console.error("[telemetry] locked_ingest_failed_falling_back", error);
    latest = await prisma.telemetryLog.findFirst({ where: { timestamp: { lt: timestamp } }, orderBy: { timestamp: "desc" } });
    row = await prisma.telemetryLog.create({ data });
  }

  try {
    if (!summaryDone) await updateDailySummary(prisma, timestamp, latest, row, settings);

    // Retention runs about once an hour rather than on every reading.
    const hourChanged = !latest || latest.timestamp.getUTCHours() !== timestamp.getUTCHours();
    if (settings) {
      for (const event of collectAlerts(latest, row, settings)) {
        await recordMonitoringEvent({ action: event.action, success: true, details: event.details });
      }
      if (settings.retentionDays > 0 && hourChanged) {
        const cutoff = new Date(Date.now() - settings.retentionDays * 86_400_000);
        await prisma.telemetryLog.deleteMany({ where: { timestamp: { lt: cutoff } } });
      }
    }
    // The event log has its own, fixed retention (it is not the energy history).
    if (hourChanged) await pruneMonitoringEvents().catch((error) => console.error("[monitoring] prune_failed", error));
    // Once a day: log the database size, and trim old minute readings before
    // the free plan's storage limit is reached.
    const dayChanged = !latest || latest.timestamp.getUTCDate() !== timestamp.getUTCDate();
    if (dayChanged) await guardDatabaseSize().catch((error) => console.error("[db] size_guard_failed", error));

    if (input.source.toLowerCase() !== "demo") {
      await prisma.inverterConnection.updateMany({
        where: { id: "default" },
        data: { lastStatus: "connected", lastSeenAt: timestamp },
      });
      // Once an hour is enough to show in the event log that readings arrive;
      // one row per reading was ~1,440 extra database writes a day.
      if (hourChanged) {
        await recordMonitoringEvent({
          action: MONITORING_ACTIONS.TELEMETRY_RECEIVED,
          success: true,
          details: `source=${input.source}; timestamp=${timestamp.toISOString()}`,
        });
      }
    }
  } catch (error) {
    console.error("[telemetry] post_processing_failed", error);
  }

  return row;
}
