import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, verifySessionToken } from "@/lib/auth-session";
import { deviceDetails, deviceFromRequest, listDevices, rememberDevice } from "@/lib/devices";
import { MONITORING_ACTIONS, recordMonitoringEvent } from "@/lib/monitoring";
import { isOwner } from "@/lib/owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Devices that signed in or opened the app in the last 90 days, newest first. */
export async function GET(request: NextRequest) {
  const session = await verifySessionToken(request.cookies.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Only the owner's own account may see who else uses the app.
  if (!isOwner(session.username)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  try {
    const device = deviceFromRequest(request);
    let devices = await listDevices(device.deviceId);
    // A browser that signed in before devices were tracked has no record yet:
    // register it now so the owner always sees the device they are holding.
    if (!devices.some((entry) => entry.current)) {
      await recordMonitoringEvent({ action: MONITORING_ACTIONS.APP_OPEN, username: session.username, details: deviceDetails(device) });
      devices = await listDevices(device.deviceId);
    }
    const response = NextResponse.json({ devices }, { headers: { "Cache-Control": "no-store" } });
    rememberDevice(response, device);
    return response;
  } catch (error) {
    console.error("[devices] list_failed", error);
    return NextResponse.json({ error: "devices_unavailable" }, { status: 503 });
  }
}
