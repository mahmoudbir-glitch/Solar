import { randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Which devices use the account. Each browser gets a random id in a long-lived
 * cookie; logins and app opens are recorded with that id, a readable device and
 * browser name, and the city Vercel derives from the connection. The IP address
 * itself is never stored.
 */

export const DEVICE_COOKIE = "solar_device";
const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 400;
const LOOKBACK_DAYS = 90;

export type DeviceInfo = { deviceId: string; device: string; browser: string; mobile: boolean; city: string | null; country: string | null };

/** "آيفون" / "Safari" from a user-agent string; plain names, no version numbers. */
export function describeUserAgent(ua: string): { device: string; browser: string; mobile: boolean } {
  const s = ua || "";
  const device = /iPad/i.test(s) ? "آيباد"
    : /iPhone/i.test(s) ? "آيفون"
    : /Android/i.test(s) ? (/Mobile/i.test(s) ? "موبايل أندرويد" : "تابلت أندرويد")
    : /Windows/i.test(s) ? "كمبيوتر ويندوز"
    : /Macintosh|Mac OS X/i.test(s) ? "ماك"
    : /Linux|CrOS/i.test(s) ? "كمبيوتر لينكس"
    : "جهاز آخر";
  const browser = /SamsungBrowser/i.test(s) ? "Samsung Internet"
    : /Edg\//i.test(s) ? "Edge"
    : /OPR\/|Opera/i.test(s) ? "Opera"
    : /Firefox|FxiOS/i.test(s) ? "Firefox"
    : /CriOS|Chrome\//i.test(s) ? "Chrome"
    : /Safari/i.test(s) ? "Safari"
    : "متصفح آخر";
  return { device, browser, mobile: /Mobile|iPhone|Android/i.test(s) && !/iPad/i.test(s) };
}

function header(request: NextRequest, name: string) {
  const value = request.headers.get(name);
  if (!value) return null;
  try {
    return decodeURIComponent(value).slice(0, 60);
  } catch {
    return value.slice(0, 60);
  }
}

/** The device behind this request; `isNew` when it has no id cookie yet. */
export function deviceFromRequest(request: NextRequest): DeviceInfo & { isNew: boolean } {
  const existing = request.cookies.get(DEVICE_COOKIE)?.value;
  const valid = existing && /^[0-9a-f-]{36}$/i.test(existing);
  const { device, browser, mobile } = describeUserAgent(request.headers.get("user-agent") ?? "");
  return {
    deviceId: valid ? existing! : randomUUID(),
    isNew: !valid,
    device,
    browser,
    mobile,
    city: header(request, "x-vercel-ip-city"),
    country: header(request, "x-vercel-ip-country"),
  };
}

export function rememberDevice(response: NextResponse, info: { deviceId: string; isNew: boolean }) {
  if (!info.isNew) return;
  response.cookies.set({
    name: DEVICE_COOKIE,
    value: info.deviceId,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DEVICE_COOKIE_MAX_AGE,
  });
}

/** Details stored on a LOGIN_SUCCESS / APP_OPEN event. */
export function deviceDetails(info: DeviceInfo) {
  const { deviceId, device, browser, mobile, city, country } = info;
  return JSON.stringify({ deviceId, device, browser, mobile, city, country });
}

export type DeviceSummary = {
  deviceId: string;
  device: string;
  browser: string;
  mobile: boolean;
  city: string | null;
  country: string | null;
  firstSeen: string;
  lastSeen: string;
  logins: number;
  opens: number;
  current: boolean;
};

export async function listDevices(currentDeviceId: string | null): Promise<DeviceSummary[]> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);
  const events = await prisma.monitoringEvent.findMany({
    where: { action: { in: ["LOGIN_SUCCESS", "APP_OPEN"] }, timestamp: { gte: since }, details: { startsWith: "{" } },
    orderBy: { timestamp: "asc" },
    select: { action: true, details: true, timestamp: true },
    take: 5000,
  });
  const byId = new Map<string, DeviceSummary>();
  for (const event of events) {
    let info: Partial<DeviceInfo>;
    try {
      info = JSON.parse(event.details ?? "{}");
    } catch {
      continue;
    }
    if (!info.deviceId) continue;
    const at = event.timestamp.toISOString();
    const row = byId.get(info.deviceId) ?? {
      deviceId: info.deviceId,
      device: info.device ?? "جهاز آخر",
      browser: info.browser ?? "متصفح آخر",
      mobile: Boolean(info.mobile),
      city: info.city ?? null,
      country: info.country ?? null,
      firstSeen: at,
      lastSeen: at,
      logins: 0,
      opens: 0,
      current: info.deviceId === currentDeviceId,
    };
    row.lastSeen = at;
    if (info.city) row.city = info.city;
    if (info.country) row.country = info.country;
    if (event.action === "LOGIN_SUCCESS") row.logins += 1;
    else row.opens += 1;
    byId.set(info.deviceId, row);
  }
  return [...byId.values()].sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1));
}
