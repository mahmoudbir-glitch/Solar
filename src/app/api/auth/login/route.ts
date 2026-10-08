import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { verifyPassword } from "@/lib/auth-password";
import { clearLogoutMarkerCookie, createSessionToken, sessionCookie } from "@/lib/auth-session";
import { getAuthConfig } from "@/lib/auth-config";
import { MONITORING_ACTIONS, recordMonitoringEvent } from "@/lib/monitoring";
import { safeNextPath } from "@/lib/safe-redirect";
import { isCrossSiteRequest } from "@/lib/same-origin";
import { deviceDetails, deviceFromRequest, rememberDevice } from "@/lib/devices";
import { clientDetail, clientTag, LOGIN_WINDOW_MS, MAX_ATTEMPTS, tooManyFailedLogins } from "@/lib/login-throttle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Quick per-instance counter; the durable limit is counted in the database
// (see login-throttle), because instances do not share this memory.
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = LOGIN_WINDOW_MS;

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  if (isCrossSiteRequest(request)) return NextResponse.json({ error: "cross_site_request" }, { status: 403 });
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const input = body as { username?: unknown; password?: unknown; next?: unknown };
  const username = typeof input.username === "string" ? input.username.trim() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const next = safeNextPath(input.next);

  if (!username || !password) {
    return NextResponse.json({ error: "missing_credentials" }, { status: 400 });
  }

  const config = getAuthConfig();
  if (!config.configured) {
    console.error("[auth] Missing SOLAR_AUTH_USERNAME, SOLAR_AUTH_PASSWORD or SOLAR_AUTH_SECRET configuration.");
    return NextResponse.json({ error: "auth_not_configured" }, { status: 503 });
  }

  const key =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const now = Date.now();
  const state = attempts.get(key);

  if (state && state.resetAt > now && state.count >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }

  // Forget expired entries so the map cannot grow without bound.
  for (const [entry, value] of attempts) if (value.resetAt <= now) attempts.delete(entry);

  const tag = clientTag(key);
  if (await tooManyFailedLogins(tag)) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }

  if (!attempts.has(key)) {
    attempts.set(key, { count: 0, resetAt: now + WINDOW_MS });
  }

  const ownerLogin =
    Boolean(config.ownerUsername && config.ownerPassword) &&
    safeEqual(username, config.ownerUsername) &&
    safeEqual(password, config.ownerPassword);

  const usernameOk = safeEqual(username, config.username);
  const passwordOk = config.password
    ? safeEqual(password, config.password)
    : verifyPassword(password, config.passwordHash);

  if (!ownerLogin && (!usernameOk || !passwordOk)) {
    const nextState = attempts.get(key) || { count: 0, resetAt: now + WINDOW_MS };
    nextState.count++;
    attempts.set(key, nextState);
    // Keep the typed name only when it belongs to a real account. Anything else
    // may be a password typed into the wrong field, and must not be stored.
    const knownName =
      usernameOk || Boolean(config.ownerUsername && safeEqual(username, config.ownerUsername));
    await recordMonitoringEvent({
      action: MONITORING_ACTIONS.LOGIN_FAILED,
      username: knownName ? username : null,
      success: false,
      details: `${usernameOk ? "password_mismatch" : "username_mismatch"}; ${clientDetail(tag)}`,
    });
    return NextResponse.json(
      { error: "invalid_credentials" },
      { status: 401 },
    );
  }

  attempts.delete(key);

  try {
    const sessionUsername = ownerLogin ? config.ownerUsername : config.username;
    const token = await createSessionToken(sessionUsername);
    // Which device signed in (shown under Settings > Devices).
    const device = deviceFromRequest(request);
    await recordMonitoringEvent({
      action: MONITORING_ACTIONS.LOGIN_SUCCESS,
      username: sessionUsername,
      success: true,
      details: deviceDetails(device),
    });
    const response = NextResponse.json({ ok: true, redirectTo: next });
    rememberDevice(response, device);
    response.cookies.set(sessionCookie(token));
    response.cookies.set(clearLogoutMarkerCookie());
    return response;
  } catch (error) {
    console.error("[auth] Session creation failed:", error);
    return NextResponse.json({ error: "session_creation_failed" }, { status: 500 });
  }
}
