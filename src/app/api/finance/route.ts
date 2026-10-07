import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(process.env.DATABASE_URL || process.env.PRISMA_DATABASE_URL || process.env.POSTGRES_URL)) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  }

  try {
    const rows = await prisma.dailySummary.findMany({
      orderBy: { day: "desc" },
      take: 30,
    });

    const totals = rows.reduce(
      (acc, row) => ({
        solarKWh: acc.solarKWh + row.solarKWh,
        homeKWh: acc.homeKWh + row.homeKWh,
        batteryChargeKWh: acc.batteryChargeKWh + row.batteryChargeKWh,
        batteryDischargeKWh: acc.batteryDischargeKWh + row.batteryDischargeKWh,
        gridImportKWh: acc.gridImportKWh + row.gridImportKWh,
        gridExportKWh: acc.gridExportKWh + row.gridExportKWh,
      }),
      { solarKWh: 0, homeKWh: 0, batteryChargeKWh: 0, batteryDischargeKWh: 0, gridImportKWh: 0, gridExportKWh: 0 },
    );

    // Split what the house used by where it came from, each kWh counted once:
    // grid first (it is measured or derived as the shortfall), then battery
    // discharge, and the rest came straight from the panels. Grid energy that
    // went into the battery is not house use, so it is not counted here again.
    const home = Math.max(0, totals.homeKWh);
    const gridKWh = Math.min(home, Math.max(0, totals.gridImportKWh));
    const batteryKWh = Math.min(home - gridKWh, Math.max(0, totals.batteryDischargeKWh));
    const directSolarKWh = Math.max(0, home - gridKWh - batteryKWh);
    const served = Math.max(0.001, directSolarKWh + batteryKWh + gridKWh);

    return NextResponse.json(
      {
        periodDays: rows.length,
        totals,
        sources: {
          solarPct: Math.round((directSolarKWh / served) * 100),
          batteryPct: Math.round((batteryKWh / served) * 100),
          gridPct: Math.round((gridKWh / served) * 100),
          // Unrounded: the page prices these, and a rounded 0.1 kWh is real money at a high tariff.
          solarKWh: directSolarKWh,
          batteryKWh,
          gridKWh,
        },
        source: "daily_summary",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "finance_read_failed" }, { status: 503 });
  }
}
