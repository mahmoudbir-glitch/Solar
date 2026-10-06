import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { COOKIE_NAME, verifySessionToken } from "@/lib/auth-session";
import { canManage, OWNER_ONLY_MESSAGE } from "@/lib/owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPORT_BATCH = 2000;

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return '"' + text.replaceAll('"', '""') + '"';
}

export async function GET(request: NextRequest) {
  const session = await verifySessionToken(request.cookies.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    // A year of readings is hundreds of thousands of rows: read and send them
    // in batches instead of holding the whole table in memory.
    const page = (after: Date | null) =>
      prisma.telemetryLog.findMany({
        where: after ? { timestamp: { gt: after } } : undefined,
        orderBy: { timestamp: "asc" },
        take: EXPORT_BATCH,
      });
    const lines = (rows: Awaited<ReturnType<typeof page>>) =>
      rows.map((row) => [
        row.timestamp.toISOString(), row.pvPowerW, row.loadPowerW, row.batterySoc, row.batteryPowerW,
        row.batteryVoltage, row.batteryCurrent, row.batteryTemperature, row.gridConnected, row.gridPowerW, row.source,
      ].map(csvCell).join(",") + "\n").join("");
    const header = ["timestamp","pv_power_w","load_power_w","battery_soc","battery_power_w","battery_voltage","battery_current","battery_temperature","grid_connected","grid_power_w","source"];

    // The first batch is read before answering, so a database failure is still
    // reported as an error rather than as a cut-off download.
    let batch = await page(null);
    let started = false;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          if (!started) {
            started = true;
            controller.enqueue(encoder.encode("\uFEFF" + header.join(",") + "\n"));
          } else if (batch.length === EXPORT_BATCH) {
            batch = await page(batch[batch.length - 1].timestamp);
          } else {
            batch = [];
          }
          if (!batch.length) return controller.close();
          controller.enqueue(encoder.encode(lines(batch)));
        } catch (error) {
          console.error("[export] stream_failed", error);
          controller.error(error);
        }
      },
    });
    return new NextResponse(stream, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="solar-telemetry.csv"', "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "export_failed", message: "تعذر تصدير البيانات." }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await verifySessionToken(request.cookies.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Erasing the history is the owner's decision, not every signed-in user's.
  if (!canManage(session.username)) return NextResponse.json({ error: "forbidden", message: OWNER_ONLY_MESSAGE }, { status: 403 });
  let body: { confirm?: unknown } = {};
  try { body = await request.json(); } catch {}
  if (body.confirm !== "مسح السجل") return NextResponse.json({ error: "confirmation_required", message: "اكتب «مسح السجل» للتأكيد." }, { status: 422 });
  try {
    const result = await prisma.telemetryLog.deleteMany({});
    return NextResponse.json({ ok: true, deleted: result.count });
  } catch {
    return NextResponse.json({ error: "delete_failed", message: "تعذر مسح السجل." }, { status: 503 });
  }
}
