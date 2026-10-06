import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { COOKIE_NAME, verifySessionToken } from "@/lib/auth-session";
import { loadSettings, localDayStart } from "@/lib/telemetry-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Period = "day" | "week" | "month";

// Daily summaries are keyed by the local calendar day (see localDayStart), so
// the period must start on the local day too. Counting from the UTC day made
// "day" add up two days between local midnight and the zone's UTC offset.
function startFor(period: Period, timezone?: string | null) {
  const start = localDayStart(new Date(), timezone);
  if (period === "week") start.setUTCDate(start.getUTCDate() - 6);
  if (period === "month") start.setUTCDate(1);
  return start;
}

export async function GET(request: NextRequest) {
  const session = await verifySessionToken(request.cookies.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  }

  const raw = request.nextUrl.searchParams.get("period") ?? "day";
  const period: Period = raw === "week" || raw === "month" ? raw : "day";

  try {
    const settings = await loadSettings().catch(() => null);
    const rows = await prisma.dailySummary.findMany({
      where: { day: { gte: startFor(period, settings?.timezone) } },
      orderBy: { day: "asc" },
    });

    const totals = rows.reduce(
      (acc, row) => ({
        solarKWh: acc.solarKWh + row.solarKWh,
        homeKWh: acc.homeKWh + row.homeKWh,
        batteryChargeKWh: acc.batteryChargeKWh + row.batteryChargeKWh,
        batteryDischargeKWh: acc.batteryDischargeKWh + row.batteryDischargeKWh,
        gridImportKWh: acc.gridImportKWh + row.gridImportKWh,
        gridExportKWh: acc.gridExportKWh + row.gridExportKWh,
        savings: acc.savings + row.savings,
      }),
      {
        solarKWh: 0,
        homeKWh: 0,
        batteryChargeKWh: 0,
        batteryDischargeKWh: 0,
        gridImportKWh: 0,
        gridExportKWh: 0,
        savings: 0,
      },
    );

    const coveredKWh = totals.solarKWh + totals.batteryDischargeKWh + totals.gridImportKWh;
    const solarToHome = Math.min(totals.homeKWh, totals.solarKWh);
    const batteryToHome = Math.min(
      Math.max(0, totals.homeKWh - solarToHome),
      totals.batteryDischargeKWh,
    );
    const gridToHome = Math.max(0, totals.homeKWh - solarToHome - batteryToHome);

    return NextResponse.json(
      {
        period,
        days: rows.map((row) => ({
          day: row.day.toISOString().slice(0, 10),
          solarKWh: row.solarKWh,
          homeKWh: row.homeKWh,
          batteryChargeKWh: row.batteryChargeKWh,
          batteryDischargeKWh: row.batteryDischargeKWh,
          gridImportKWh: row.gridImportKWh,
          gridExportKWh: row.gridExportKWh,
          savings: row.savings,
          currency: row.currency,
        })),
        totals: {
          ...totals,
          coveragePct: coveredKWh > 0 ? Math.round(((solarToHome + batteryToHome) / coveredKWh) * 100) : null,
          sources: {
            solarKWh: solarToHome,
            batteryKWh: batteryToHome,
            gridKWh: gridToHome,
          },
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "summary_read_failed" }, { status: 503 });
  }
}
