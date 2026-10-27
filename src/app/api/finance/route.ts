import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { localDayStart } from "@/lib/telemetry-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** How many local days each period covers, today included. */
const PERIOD_DAYS = { day: 1, week: 7, month: 30 } as const;
type Period = keyof typeof PERIOD_DAYS | "custom";
/** The longest custom range the page may ask for. */
const MAX_CUSTOM_DAYS = 366;

/** A local calendar day "YYYY-MM-DD" as the UTC midnight the daily rows are keyed by; null when not a real date. */
function parseDay(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}
const dayText = (date: Date) => date.toISOString().slice(0, 10);

/**
 * House energy by source from the stored readings, integrated over the gaps
 * the daily totals also count (consecutive readings at most 15 minutes apart).
 */
async function splitHouseSources(since: Date, until: Date) {
  const [row] = await prisma.$queryRaw<Array<{ home: number | null; grid: number | null; battery: number | null }>>`
    WITH r AS (
      SELECT "timestamp" AS t,
             GREATEST("loadPowerW", 0) AS load,
             GREATEST(COALESCE("gridPowerW", 0), 0) AS grid,
             GREATEST(-"batteryPowerW", 0) AS discharge,
             LAG("timestamp") OVER (ORDER BY "timestamp") AS pt
      FROM "TelemetryLog"
      WHERE "timestamp" >= ${since} AND "timestamp" < ${until}
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

  const params = new URL(request.url).searchParams;
  const requested = params.get("period");
  const period: Period = requested === "day" || requested === "week" || requested === "custom" ? requested : "month";

  try {
    // Daily rows are keyed by the local calendar day (UTC midnight of that
    // date), so "today" and the days before it come from the site's time zone.
    const settings = await prisma.energySettings.findUnique({ where: { id: "default" } }).catch(() => null);
    const today = localDayStart(new Date(), settings?.timezone);
    let from: Date;
    let to: Date = today;
    if (period === "custom") {
      const start = parseDay(params.get("from"));
      const end = parseDay(params.get("to"));
      if (!start || !end || start > end) return NextResponse.json({ error: "invalid_range" }, { status: 400 });
      // A range reaching past today stops at today; one longer than a year is refused rather than cut silently.
      to = end > today ? today : end;
      from = start;
      if (from > to) return NextResponse.json({ error: "invalid_range" }, { status: 400 });
      if ((to.getTime() - from.getTime()) / 86_400_000 + 1 > MAX_CUSTOM_DAYS) return NextResponse.json({ error: "range_too_long" }, { status: 400 });
    } else {
      from = new Date(today.getTime() - (PERIOD_DAYS[period] - 1) * 86_400_000);
    }
    const requestedDays = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
    const rows = await prisma.dailySummary.findMany({
      where: { day: { gte: from, lte: to } },
      orderBy: { day: "desc" },
      take: requestedDays,
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
    const until = new Date(to.getTime() + 86_400_000 - offsetMs);
    const split = await splitHouseSources(since, until).catch(() => null);
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
        // The days asked for, and the first and last of them that really have readings.
        range: {
          from: dayText(from),
          to: dayText(to),
          requestedDays,
          firstDataDay: rows.length ? dayText(rows[rows.length - 1].day) : null,
          lastDataDay: rows.length ? dayText(rows[0].day) : null,
        },
        totals,
        sources: {
          solarPct: Math.round((directSolarKWh / served) * 100),
          batteryPct: Math.round((batteryKWh / served) * 100),
          gridPct: Math.round((gridKWh / served) * 100),
          // Unrounded: the page prices these, and a rounded 0.1 kWh is real money at a high tariff.
          solarKWh: directSolarKWh,
          batteryKWh,
          gridKWh,
          // Grid energy bought beyond what the house drew from it: mostly the grid charging the battery
          // (plus inverter losses), so part of the battery's share is not solar.
          gridToBatteryKWh: Math.max(0, totals.gridImportKWh - gridKWh),
        },
        source: "daily_summary",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "finance_read_failed" }, { status: 503 });
  }
}
