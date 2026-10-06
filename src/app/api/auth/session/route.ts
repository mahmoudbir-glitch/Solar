import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, LOGOUT_MARKER_COOKIE, verifySessionToken } from "@/lib/auth-session";
import { isOwner } from "@/lib/owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (request.cookies.get(LOGOUT_MARKER_COOKIE)?.value === "1") {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const session = await verifySessionToken(request.cookies.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ authenticated: false }, { status: 401 });
  return NextResponse.json({ authenticated: true, username: session.username, owner: isOwner(session.username) });
}
