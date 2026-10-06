import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, verifySessionToken } from "@/lib/auth-session";
import { getLearnedProfile } from "@/lib/solar-calibration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What the app has learned from the owner's readings: panel calibration and night load. */
export async function GET(request: NextRequest) {
  const session = await verifySessionToken(request.cookies.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  try {
    return NextResponse.json(await getLearnedProfile(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[calibration] failed", error);
    return NextResponse.json({ error: "calibration_unavailable" }, { status: 503 });
  }
}
