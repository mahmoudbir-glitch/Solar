import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { COOKIE_NAME, verifySessionToken } from "@/lib/auth-session";
import { loadSettings, localDayStart } from "@/lib/telemetry-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 24 * 3_600_000;
const BUCKET_MS = 10 * 60_000;

/**
 * Last 24 hours of load and solar, averaged into 10-minute buckets for the
 * house chart, plus today's peak load (Beirut day) and the inverter rating.
 * Buckets with no reading are omitted, so gaps stay visible as gaps.
 */
export async function GET(request: NextRequest) {
  const session = await verifySessionToken(request.cookies.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const now = Date.now();
    const settings = await loadSettings().catch(() => null);
    const rows = await prisma.telemetryLog.findMany({
      where: { timestamp: { gte: new Date(now - WINDOW_MS) } },
      orderBy: { timestamp: "asc" },
      select: { timestamp: true, loadPowerW: true, pvPowerW: true, batterySoc: true, batteryPowerW: true },
    });

    const buckets = new Map<number, { load: number; solar: number; soc: number; battery: number; n: number }>();
    for (const row of rows) {
      const key = Math.floor(row.timestamp.getTime() / BUCKET_MS) * BUCKET_MS;
      const bucket = buckets.get(key) ?? { load: 0, solar: 0, soc: 0, battery: 0, n: 0 };
      bucket.load += row.loadPowerW;
      bucket.solar += row.pvPowerW;
      bucket.soc += row.batterySoc;
      bucket.battery += row.batteryPowerW;
      bucket.n += 1;
      buckets.set(key, bucket);
    }
    const points = [...buckets.entries()].map(([t, b]) => ({
      t,
      loadW: Math.round(b.load / b.n),
      solarW: Math.round(b.solar / b.n),
      soc: Math.round((b.soc / b.n) * 10) / 10,
      batteryW: Math.round(b.battery / b.n),
    }));

    const dayStart = localDayStart(new Date(now), settings?.timezone);
    // localDayStart returns the local calendar date at UTC midnight; shift by the
    // zone's current offset to get the real instant the local day began.
    const offsetMs = new Date(new Date(now).toLocaleString("en-US", { timeZone: settings?.timezone || "UTC" })).getTime() - new Date(new Date(now).toLocaleString("en-US", { timeZone: "UTC" })).getTime();
    const since = new Date(dayStart.getTime() - offsetMs);
    const peak = await prisma.telemetryLog.findFirst({
      where: { timestamp: { gte: since } },
      orderBy: { loadPowerW: "desc" },
      select: { timestamp: true, loadPowerW: true },
    });

    const [today, socRange] = await Promise.all([
      prisma.dailySummary.findUnique({ where: { day: dayStart } }).catch(() => null),
      prisma.telemetryLog.aggregate({ where: { timestamp: { gte: since } }, _min: { batterySoc: true }, _max: { batterySoc: true } }).catch(() => null),
    ]);

    return NextResponse.json(
      {
        points,
        batteryToday: today ? { chargeKWh: Math.round(today.batteryChargeKWh * 100) / 100, dischargeKWh: Math.round(today.batteryDischargeKWh * 100) / 100 } : null,
        socToday: socRange?._min.batterySoc != null ? { min: socRange._min.batterySoc, max: socRange._max.batterySoc } : null,
        peak: peak ? { w: Math.round(peak.loadPowerW), at: peak.timestamp.toISOString() } : null,
        inverterRatedKw: settings?.inverterRatedPowerKw ?? null,
        timezone: settings?.timezone || "Asia/Beirut",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[telemetry] history_failed", error);
    return NextResponse.json({ error: "history_failed" }, { status: 503 });
  }
}
