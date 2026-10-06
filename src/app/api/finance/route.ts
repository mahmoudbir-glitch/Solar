import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { localDayStart } from "@/lib/telemetry-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** How many local days each period covers, today included. */
const PERIOD_DAYS = { day: 1, week: 7, month: 30 } as const;
type Period = keyof typeof PERIOD_DAYS;

export async function GET(request: Request) {
  if (!(process.env.DATABASE_URL || process.env.PRISMA_DATABASE_URL || process.env.POSTGRES_URL)) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  }

  const requested = new URL(request.url).searchParams.get("period");
  const period: Period = requested === "day" || requested === "week" ? requested : "month";

  try {
    // Daily rows are keyed by the local calendar day (UTC midnight of that
    // date), so "today" and the days before it come from the site's time zone.
    const settings = await prisma.energySettings.findUnique({ where: { id: "default" } }).catch(() => null);
    const today = localDayStart(new Date(), settings?.timezone);
    const from = new Date(today.getTime() - (PERIOD_DAYS[period] - 1) * 86_400_000);
    const rows = await prisma.dailySummary.findMany({
      where: { day: { gte: from } },
      orderBy: { day: "desc" },
      take: PERIOD_DAYS[period],
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
        period,
        periodDays: rows.length,
        totals,
        sources: {
          solarPct: Math.round((directSolarKWh / served) * 100),
          batteryPct: Math.round((batteryKWh / served) * 100),
          gridPct: Math.round((gridKWh / served) * 100),
          solarKWh: Math.round(directSolarKWh * 10) / 10,
          batteryKWh: Math.round(batteryKWh * 10) / 10,
          gridKWh: Math.round(gridKWh * 10) / 10,
        },
        source: "daily_summary",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "finance_read_failed" }, { status: 503 });
  }
}
