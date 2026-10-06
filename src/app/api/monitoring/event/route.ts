import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, verifySessionToken } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { MONITORING_ACTIONS, recordMonitoringEvent } from "@/lib/monitoring";
import { deviceDetails, deviceFromRequest, rememberDevice } from "@/lib/devices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await verifySessionToken(request.cookies.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const action = typeof (body as { action?: unknown })?.action === "string"
    ? (body as { action: string }).action
    : "";

  if (action !== MONITORING_ACTIONS.APP_OPEN) {
    return NextResponse.json({ error: "unsupported_action" }, { status: 422 });
  }

  const device = deviceFromRequest(request);
  await recordMonitoringEvent({
    action,
    username: session.username,
    details: deviceDetails(device),
  });

  const response = NextResponse.json({ recorded: true });
  rememberDevice(response, device);
  return response;
}

export async function GET(request: NextRequest) {
  const session = await verifySessionToken(request.cookies.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const count = await prisma.monitoringEvent.count();
  return NextResponse.json({ count });
}
