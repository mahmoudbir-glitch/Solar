import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(process.env.DATABASE_URL || process.env.PRISMA_DATABASE_URL || process.env.POSTGRES_URL)) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  }

  try {
    const row = await prisma.telemetryLog.findFirst({ orderBy: { timestamp: "desc" } });
    if (!row) {
      return NextResponse.json({ error: "no_telemetry" }, { status: 404 });
    }

    return NextResponse.json(
      {
        success: true,
        source: "live",
        data: {
          solar_production: row.pvPowerW,
          home_consumption: row.loadPowerW,
          battery_level: row.batterySoc,
          grid_status: row.gridConnected == null ? "غير معروفة" : row.gridConnected ? "متصلة" : "مقطوعة",
          grid_power: row.gridPowerW ?? 0,
          battery_power: row.batteryPowerW,
          timestamp: row.timestamp.toISOString(),
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "energy_read_failed" }, { status: 503 });
  }
}
