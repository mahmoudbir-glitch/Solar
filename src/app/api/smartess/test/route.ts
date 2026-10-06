import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API = "https://api.dessmonitor.com/public/";
const SOURCE = "1";
const APP_CLIENT = "web";
const APP_ID = "shamsak";
const APP_VERSION = "1.2.0";
const DEFAULT_PN = "Q0045395318912";
const DEFAULT_COMPANY_KEY = "bnrl_frRFjEz8Mkn";
const TIMEOUT_MS = 15000;

type Json = Record<string, unknown>;
type Auth = { token: string; secret: string };
type Device = { pn?: string; sn?: string; devcode?: string | number; devaddr?: string | number; status?: string | number; name?: string; [key: string]: unknown };
type Reading = { title?: string; val?: string | number; unit?: string; [key: string]: unknown };

const sha1 = (value: string) => createHash("sha1").update(value, "utf8").digest("hex");

function actionString(action: string, params: Record<string, string | number | undefined> = {}) {
  let result = `&action=${encodeURIComponent(action)}`;
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    result += `&${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;
  }
  return result;
}

async function callApi(action: string, params: Record<string, string | number | undefined>, auth?: Auth) {
  const salt = String(Date.now());
  const tail = actionString(action, params);
  const signature = auth
    ? sha1(`${salt}${auth.secret}${auth.token}${tail}`)
    : sha1(`${salt}${sha1(process.env.SMARTESS_PASSWORD ?? "")}${tail}`);

  const url = new URL(API);
  url.searchParams.set("sign", signature);
  url.searchParams.set("salt", salt);
  if (auth) url.searchParams.set("token", auth.token);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" }, signal: controller.signal });
    const text = await response.text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { throw new Error(`SmartESS returned invalid JSON (HTTP ${response.status})`); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("SmartESS returned an invalid response");
    const json = body as Json;
    if (!response.ok) throw new Error(`SmartESS returned HTTP ${response.status}: ${description(json)}`);
    return json;
  } finally {
    clearTimeout(timer);
  }
}

function description(body: Json) {
  const value = body.desc;
  return typeof value === "string" ? value : value ? JSON.stringify(value) : "";
}

function successful(body: Json) {
  if (body.err !== undefined) return Number(body.err) === 0;
  return body.result === 1 || body.result === "1";
}

async function authenticate(username: string, password: string): Promise<Auth> {
  const companyKey = process.env.SMARTESS_COMPANY_KEY?.trim() || DEFAULT_COMPANY_KEY;
  const variants = [...new Set([username.trim(), username.trim().toLowerCase(), username.trim().charAt(0).toUpperCase() + username.trim().slice(1), username.trim().toUpperCase()])];
  let last = "SmartESS authentication failed";

  for (const usr of variants) {
    const params = { usr, "company-key": companyKey, source: SOURCE, _app_client_: APP_CLIENT, _app_id_: APP_ID, _app_version_: APP_VERSION };
    const body = await callApi("authSource", params);
    if (!successful(body)) {
      last = description(body) || "SmartESS authentication failed";
      const upper = last.toUpperCase();
      if (!/NOT_FOUND_USR|PASSWORD|USER/.test(upper)) throw new Error(last);
      continue;
    }
    const dat = body.dat && typeof body.dat === "object" ? body.dat as Json : {};
    const token = typeof dat.token === "string" ? dat.token : "";
    const secret = typeof dat.secret === "string" ? dat.secret : "";
    if (token && secret) return { token, secret };
    throw new Error("SmartESS authentication response did not contain token/secret");
  }
  throw new Error(last);
}

function arraysFrom(body: Json): Json[] {
  const out: Json[] = [];
  const visit = (value: unknown, depth = 0) => {
    if (depth > 5 || value == null) return;
    if (Array.isArray(value)) { for (const item of value) visit(item, depth + 1); return; }
    if (typeof value !== "object") return;
    const item = value as Json;
    if (typeof item.sn === "string" && item.sn && item.devcode !== undefined) { out.push(item); return; }
    for (const child of Object.values(item)) visit(child, depth + 1);
  };
  visit(body.dat);
  return out;
}

function normalizeDevice(item: Json): Device {
  const status = item.status ?? item.online ?? item.state;
  return {
    ...item,
    pn: typeof item.pn === "string" ? item.pn : typeof item.PN === "string" ? item.PN : undefined,
    sn: typeof item.sn === "string" ? item.sn : typeof item.SN === "string" ? item.SN : undefined,
    devcode: item.devcode ?? item.devCode ?? item.deviceCode,
    devaddr: item.devaddr ?? item.devAddr ?? item.deviceAddr ?? item.address,
    status: typeof status === "string" || typeof status === "number" ? status : undefined,
    name: typeof item.name === "string" ? item.name : typeof item.alias === "string" ? item.alias : undefined,
  };
}

async function discover(auth: Auth, pn: string) {
  const devices = new Map<string, Device>();
  const attempts: string[] = [];
  const actions = ["webQueryDeviceEs", "webQueryDevice", "queryDevices", "queryCollectorDevices", "queryCollectorInfo"];
  for (const action of actions) {
    try {
      const body = await callApi(action, action === "queryCollectorDevices" || action === "queryCollectorInfo" ? { pn } : { page: 0, pagesize: 100, pn }, auth);
      const found = arraysFrom(body).map(normalizeDevice);
      attempts.push(`${action}:${found.length}`);
      for (const device of found) {
        const key = `${device.sn ?? ""}|${device.devcode ?? ""}|${device.devaddr ?? ""}`;
        devices.set(key, device);
      }
    } catch {
      attempts.push(`${action}:error`);
    }
  }
  return { devices: [...devices.values()], attempts };
}

function online(device: Device) {
  return device.status === 1 || device.status === "1" || device.status === "online" || device.status === "ONLINE" || device.status === "Online";
}

function pick(devices: Device[], pn: string) {
  return devices.find(d => d.pn === pn && online(d)) ?? devices.find(online) ?? devices.find(d => d.pn === pn) ?? devices[0] ?? null;
}

function readingsFrom(body: Json): Reading[] {
  const values: unknown[] = [];
  const visit = (value: unknown, depth = 0) => {
    if (depth > 5 || value == null) return;
    if (Array.isArray(value)) { values.push(...value); return; }
    if (typeof value !== "object") return;
    const obj = value as Json;
    for (const key of ["list", "rows", "items", "records", "data"]) if (Array.isArray(obj[key])) values.push(...obj[key] as unknown[]);
    if (values.length === 0) for (const child of Object.values(obj)) visit(child, depth + 1);
  };
  visit(body.dat);
  return values.filter((x): x is Json => !!x && typeof x === "object" && !Array.isArray(x)).map(x => ({ ...x, title: typeof x.title === "string" ? x.title : typeof x.name === "string" ? x.name : undefined, val: x.val ?? x.value ?? x.v }));
}

function num(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") { const n = Number(value.replace(",", ".").trim()); return Number.isFinite(n) ? n : null; }
  return null;
}

function find(readings: Reading[], names: string[]) {
  for (const r of readings) {
    const title = (r.title ?? "").toLowerCase();
    if (names.some(n => title.includes(n))) { const n = num(r.val); if (n !== null) return n; }
  }
  return null;
}

async function lastData(auth: Auth, device: Device, pn: string) {
  const body = await callApi("queryDeviceLastData", { page: 0, pagesize: 100, i18n: "en_US", pn, devcode: device.devcode !== undefined ? String(device.devcode) : undefined, devaddr: device.devaddr !== undefined ? String(device.devaddr) : undefined, sn: device.sn }, auth);
  if (!successful(body)) throw new Error(description(body) || "SmartESS last-data query failed");
  const readings = readingsFrom(body);
  return {
    readings,
    telemetry: {
      pvPowerW: find(readings, ["pv power", "solar power", "pv1 power", "pv2 power"]),
      pvVoltageV: find(readings, ["pv voltage", "pv1 voltage", "pv2 voltage"]),
      pvCurrentA: find(readings, ["pv current", "pv1 current", "pv2 current"]),
      batteryVoltageV: find(readings, ["battery voltage", "bat voltage"]),
      batteryCurrentA: find(readings, ["battery current", "bat current"]),
      batterySoc: find(readings, ["battery soc", "battery percentage", "battery percent", "soc"]),
      loadPowerW: find(readings, ["load power", "load watt", "output power", "active power"]),
      outputVoltageV: find(readings, ["output voltage", "ac output voltage"]),
      gridVoltageV: find(readings, ["grid voltage", "ac input voltage", "utility voltage"]),
      gridPowerW: find(readings, ["grid power", "utility power", "ac input power"]),
      temperatureC: find(readings, ["temperature", "device temperature", "inverter temperature"]),
    },
  };
}

function json(body: Json, status = 200) { return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } }); }

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as Json;
    const username = process.env.SMARTESS_USERNAME?.trim();
    const password = process.env.SMARTESS_PASSWORD;
    const companyKey = process.env.SMARTESS_COMPANY_KEY?.trim();
    const pn = typeof body.pn === "string" && body.pn.trim() ? body.pn.trim() : process.env.SMARTESS_PN?.trim() || DEFAULT_PN;
    const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";

    const missing: string[] = [];
    if (!username) missing.push("SMARTESS_USERNAME");
    if (!password) missing.push("SMARTESS_PASSWORD");
    if (!companyKey) console.warn("[SmartESS] SMARTESS_COMPANY_KEY is not configured; using compatibility key");
    if (missing.length) return json({ ok: false, code: "MISSING_ENV", message: "يرجى إعداد بيانات SmartESS في إعدادات Vercel ثم إعادة النشر.", missing }, 503);

    const auth = await authenticate(username!, password!);
    const discovered = await discover(auth, pn);
    const device = pick(discovered.devices, pn);
    if (!device) return json({ ok: false, code: "DEVICE_NOT_FOUND", message: "تم تسجيل الدخول إلى SmartESS لكن تعذر اكتشاف الإنفرتر.", pn, deviceId: deviceId || null, attempts: discovered.attempts }, 404);
    if (device.status !== undefined && !online(device)) return json({ ok: false, code: "DEVICE_OFFLINE", message: "الإنفرتر أو جهاز الاتصال ظاهر في SmartESS لكنه غير متصل حالياً.", pn, device: { pn: device.pn ?? null, sn: device.sn ?? null, devcode: device.devcode ?? null, devaddr: device.devaddr ?? null, status: device.status ?? null, name: device.name ?? null }, attempts: discovered.attempts }, 503);

    const data = await lastData(auth, device, pn);
    return json({ ok: true, code: "CONNECTED", message: "تم الاتصال بالإنفرتر وقراءة البيانات بنجاح.", timestamp: new Date().toISOString(), device: { pn: device.pn ?? null, sn: device.sn ?? null, devcode: device.devcode ?? null, devaddr: device.devaddr ?? null, status: device.status ?? null, name: device.name ?? null }, telemetry: data.telemetry, readings: data.readings, source: "smartess", deviceId: deviceId || null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown SmartESS error";
    const upper = message.toUpperCase();
    console.error("[SmartESS] Connection test failed:", message);
    if (/NOT_FOUND_USR|PASSWORD|USER|COMPANY|AUTH_SOURCE/.test(upper)) return json({ ok: false, code: "AUTH_FAILED", message: "تعذر تسجيل الدخول إلى SmartESS. تحقق من اسم المستخدم وكلمة المرور وCompany Key." }, 401);
    if (/ABORT|TIMEOUT|TIMED OUT/.test(upper)) return json({ ok: false, code: "TIMEOUT", message: "انتهت مهلة الاتصال بخادم SmartESS." }, 504);
    if (/INVALID JSON|SMARTESS RETURNED/.test(upper)) return json({ ok: false, code: "UPSTREAM_INVALID", message: "خادم SmartESS أعاد استجابة غير صالحة." }, 502);
    return json({ ok: false, code: "UPSTREAM_UNAVAILABLE", message: "تعذر الاتصال بخدمة SmartESS أو قراءة بيانات الإنفرتر." }, 502);
  }
}
