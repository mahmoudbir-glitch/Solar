import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { localDayStart } from "@/lib/telemetry-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** How many local days each period covers, today included. */
const PERIOD_DAYS = { day: 1, week: 7, month: 30 } as const;
type Period = keyof typeof PERIOD_DAYS;

/**
 * House energy by source from the stored readings, integrated over the gaps
 * the daily totals also count (consecutive readings at most 15 minutes apart).
 */
async function splitHouseSources(since: Date) {
  const [row] = await prisma.$queryRaw<Array<{ home: number | null; grid: number | null; battery: number | null }>>`
    WITH r AS (
      SELECT "timestamp" AS t,
             GREATEST("loadPowerW", 0) AS load,
             GREATEST(COALESCE("gridPowerW", 0), 0) AS grid,
             GREATEST(-"batteryPowerW", 0) AS discharge,
             LAG("timestamp") OVER (ORDER BY "timestamp") AS pt
      FROM "TelemetryLog"
      WHERE "timestamp" >= ${since}
    ), i AS (
      SELECT EXTRACT(EPOCH FROM (t - pt)) / 3600.0 AS h, load, LEAST(load, grid) AS from_grid, discharge
      FROM r
      WHERE pt IS NOT NULL AND t > pt AND t - pt <= INTERVAL '15 minutes'
    )
    SELECT SUM(load * h)::float8 / 1000 AS home,
           SUM(from_grid * h)::float8 / 1000 AS grid,
           SUM(LEAST(load - from_grid, discharge) * h)::float8 / 1000 AS battery
    FROM i`;
  return { homeKWh: Number(row?.home ?? 0), gridKWh: Number(row?.grid ?? 0), batteryKWh: Number(row?.battery ?? 0) };
}

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

    // Split what the house used by where it came from, reading by reading: at
    // each moment the grid covers up to the load, the battery the rest it can,
    // and the panels whatever is left. Doing this on the day totals instead
    // charged the house with grid and battery energy that was really lost in
    // the inverter, and under-counted the sun (about 3.7 of 30 kWh in a week).
    const home = Math.max(0, totals.homeKWh);
    const offsetMs = new Date(new Date().toLocaleString("en-US", { timeZone: settings?.timezone || "UTC" })).getTime() - new Date(new Date().toLocaleString("en-US", { timeZone: "UTC" })).getTime();
    const since = new Date(from.getTime() - offsetMs);
    const split = await splitHouseSources(since).catch(() => null);
    let gridKWh: number, batteryKWh: number, directSolarKWh: number;
    if (split && split.homeKWh > 0) {
      // Scaled to the day totals so the three parts always add up to the house figure shown.
      const scale = home / split.homeKWh;
      gridKWh = split.gridKWh * scale;
      batteryKWh = split.batteryKWh * scale;
      directSolarKWh = Math.max(0, home - gridKWh - batteryKWh);
    } else {
      // No raw readings for the period: the day totals are the best left.
      gridKWh = Math.min(home, Math.max(0, totals.gridImportKWh));
      batteryKWh = Math.min(home - gridKWh, Math.max(0, totals.batteryDischargeKWh));
      directSolarKWh = Math.max(0, home - gridKWh - batteryKWh);
    }
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
