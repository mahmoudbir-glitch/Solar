import { prisma } from "@/lib/prisma";

export const MONITORING_ACTIONS = {
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
  LOGIN_FAILED: "LOGIN_FAILED",
  APP_OPEN: "APP_OPEN",
  INVERTER_CONFIG_SAVED: "INVERTER_CONFIG_SAVED",
  CONNECTION_TEST: "CONNECTION_TEST",
  CONNECTION_TEST_SUCCESS: "CONNECTION_TEST_SUCCESS",
  CONNECTION_TEST_FAILED: "CONNECTION_TEST_FAILED",
  TELEMETRY_RECEIVED: "TELEMETRY_RECEIVED",
} as const;

let monitoringStorageReady = false;

export async function ensureMonitoringStorage() {
  if (monitoringStorageReady) return;

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MonitoringEvent" (
        "id" TEXT NOT NULL,
        "username" TEXT,
        "action" TEXT NOT NULL,
        "success" BOOLEAN NOT NULL DEFAULT true,
        "details" TEXT,
        "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "MonitoringEvent_pkey" PRIMARY KEY ("id")
      )
    `);
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "MonitoringEvent_timestamp_idx" ON "MonitoringEvent"("timestamp")`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "MonitoringEvent_action_timestamp_idx" ON "MonitoringEvent"("action", "timestamp")`
    );
    monitoringStorageReady = true;
  } catch (error) {
    console.error("[monitoring] storage_init_failed", error);
  }
}

/** One TELEMETRY_RECEIVED event is written per reading (about 1,440 a day). */
const TELEMETRY_EVENT_DAYS = 7;
/** Everything else: sign-ins, app opens, alerts, night checks. */
const EVENT_DAYS = 365;

/** Deletes old events so the table does not grow without bound. */
export async function pruneMonitoringEvents(now = Date.now()) {
  await prisma.monitoringEvent.deleteMany({
    where: {
      OR: [
        { action: MONITORING_ACTIONS.TELEMETRY_RECEIVED, timestamp: { lt: new Date(now - TELEMETRY_EVENT_DAYS * 86_400_000) } },
        { timestamp: { lt: new Date(now - EVENT_DAYS * 86_400_000) } },
      ],
    },
  });
}

export async function recordMonitoringEvent(input: {
  action: string;
  username?: string | null;
  success?: boolean;
  details?: string | null;
}) {
  try {
    await ensureMonitoringStorage();
    await prisma.monitoringEvent.create({
      data: {
        action: input.action,
        username: input.username || null,
        success: input.success ?? true,
        details: input.details ? input.details.slice(0, 500) : null,
      },
    });
  } catch (error) {
    console.error("[monitoring] event_write_failed", error);
  }
}
