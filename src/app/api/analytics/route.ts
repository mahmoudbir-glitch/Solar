import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { estimateBatteryNight, powerSourceShares, solarSurplus } from "@/lib/predictive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  }

  try {
    const [telemetry, settings] = await Promise.all([
      prisma.telemetryLog.findFirst({ orderBy: { timestamp: "desc" } }),
      prisma.energySettings.findUnique({ where: { id: "default" } }),
    ]);

    if (!telemetry) {
      return NextResponse.json({ error: "no_telemetry" }, { status: 404 });
    }

    const snapshot = {
      timestamp: telemetry.timestamp.toISOString(),
      solarPowerW: telemetry.pvPowerW,
      homePowerW: telemetry.loadPowerW,
      gridPowerW: telemetry.gridPowerW ?? 0,
      batteryPowerW: telemetry.batteryPowerW,
      batterySoc: telemetry.batterySoc,
      batteryVoltage: telemetry.batteryVoltage ?? undefined,
      batteryCurrent: telemetry.batteryCurrent ?? undefined,
      batteryTemperature: telemetry.batteryTemperature ?? undefined,
      gridConnected: telemetry.gridConnected,
      source: "live" as const,
    };

    const panelKw = Math.max(0.1, (settings?.panelPowerW ?? 6000) / 1000);
    const batteryKwh = Math.max(0.1, (settings?.batteryCapacityWh ?? 10000) / 1000);
    const expectedNightLoadKwh = Math.max(0.1, Number(request.nextUrl.searchParams.get("nightLoadKwh") ?? 8));

    return NextResponse.json({
      source: "live",
      generatedAt: new Date().toISOString(),
      snapshot,
      panelKw,
      batteryKwh,
      surplusKw: solarSurplus(snapshot.solarPowerW, snapshot.homePowerW, snapshot.batteryPowerW),
      batteryNight: estimateBatteryNight(snapshot, batteryKwh, expectedNightLoadKwh, 20),
      sourceShares: powerSourceShares(snapshot),
      currency: settings?.currency ?? "USD",
      tariff: settings?.gridTariff ?? 0,
      exportTariff: settings?.exportTariff ?? 0,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "analytics_read_failed" }, { status: 503 });
  }
}
