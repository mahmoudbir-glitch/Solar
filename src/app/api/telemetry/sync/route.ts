import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { syncSmartEss } from "@/lib/smartess-sync";
import { runNightCheck } from "@/lib/night-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// An external scheduler (e.g. cron-job.org) calls this every minute so readings
// are recorded even while nobody has the app open. It is protected by
// CRON_SECRET, sent only as "Authorization: Bearer <secret>". A "?key=" query
// parameter is deliberately not accepted: URLs end up in the scheduler's and
// the host's request logs, headers do not.
function authorized(request: NextRequest) {
  // A value pasted into the hosting dashboard often carries a trailing line
  // break; without trimming, the key that was copied never matches it.
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected || expected.length < 16) return false;
  const header = request.headers.get("authorization") ?? "";
  const given = (header.startsWith("Bearer ") ? header.slice(7) : "").trim();
  // Compare digests so the lengths always match and timing reveals nothing.
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

async function handle(request: NextRequest) {
  if (!process.env.CRON_SECRET?.trim()) return NextResponse.json({ error: "cron_not_configured" }, { status: 503 });
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await syncSmartEss();
  // Right after sunset, once per evening: will the battery last the night?
  // A failure here must never affect the sync's own result.
  await runNightCheck().catch((error) => console.error("[night] check_failed", error));
  // Keep the body tiny: cron-job.org only needs the status code.
  const body = result.ok
    ? { ok: true }
    : { ok: false, skipped: Boolean(result.skipped), reason: result.reason.slice(0, 80) };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

export const GET = handle;
export const POST = handle;
