import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, logoutMarkerCookie } from "@/lib/auth-session";
import { isCrossSiteRequest } from "@/lib/same-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // Another website must not be able to sign the user out.
  if (isCrossSiteRequest(request)) return NextResponse.json({ error: "cross_site_request" }, { status: 403 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(clearSessionCookie());
  response.cookies.set(logoutMarkerCookie());
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  return response;
}
