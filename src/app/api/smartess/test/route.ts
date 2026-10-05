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

// Compatibility fallback used by the existing Shamsak SmartESS client.
// Prefer SMARTESS_COMPANY_KEY when it is configured.
const DEFAULT_COMPANY_KEY = "bnrl_frRFjEz8Mkn";

const REQUEST_TIMEOUT_MS = 15000;

type JsonRecord = Record<string, unknown>;

type AuthResult = {
  token: string;
  secret: string;
  raw: JsonRecord;
};

type Collector = {
  pn?: string;
  name?: string;
  status?: number | string;
  [key: string]: unknown;
};

type Device = {
  pn?: string;
  sn?: string;
  devcode?: string | number;
  devaddr?: string | number;
  status?: string | number;
  name?: string;
  [key: string]: unknown;
};

type Reading = {
  title?: string;
  val?: string | number;
  unit?: string;
  [key: string]: unknown;
};

function sha1(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}

function actionString(
  action: string,
  params: Record<string, string | number | undefined> = {},
): string {
  const parts = [`&action=${encodeURIComponent(action)}`];

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;

    parts.push(
      `&${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    );
  }

  return parts.join("");
}

async function requestApi(
  url: string,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<JsonRecord> {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    const text = await response.text();

    let json: unknown;

    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(
        `SmartESS returned invalid JSON (HTTP ${response.status})`,
      );
    }

    if (!json || typeof json !== "object") {
      throw new Error("SmartESS returned an invalid response");
    }

    return json as JsonRecord;
  } finally {
    clearTimeout(timeout);
  }
}

function buildUrl(
  params: Record<string, string | number | undefined>,
): string {
  const url = new URL(API);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

function getData(response: JsonRecord): unknown {
  return response.dat;
}

function getDescription(response: JsonRecord): string {
  const desc = response.desc;

  if (typeof desc === "string") return desc;

  if (desc && typeof desc === "object") {
    try {
      return JSON.stringify(desc);
    } catch {
      return "";
    }
  }

  return "";
}

function isSuccess(response: JsonRecord): boolean {
  return response.result === 1 || response.result === "1";
}

function isRecoverableAuthError(response: JsonRecord): boolean {
  const desc = getDescription(response).toUpperCase();

  return (
    desc.includes("NOT_FOUND_USR") ||
    desc.includes("PASSWORD") ||
    desc.includes("USER")
  );
}

function usernameVariants(username: string): string[] {
  const values = new Set<string>();

  values.add(username);

  if (username.length > 0) {
    values.add(
      username.charAt(0).toUpperCase() + username.slice(1),
    );
  }

  values.add(username.toLowerCase());
  values.add(username.toUpperCase());

  return [...values];
}

async function authenticateExact(
  username: string,
  password: string,
  companyKey: string,
): Promise<AuthResult> {
  const salt = Date.now().toString();

  const params = {
    usr: username,
    "company-key": companyKey,
    source: SOURCE,
    _app_client_: APP_CLIENT,
    _app_id_: APP_ID,
    _app_version_: APP_VERSION,
  };

  const tail = actionString("authSource", params);

  const sign = sha1(
    `${salt}${sha1(password)}${tail}`,
  );

  const url = buildUrl({
    sign,
    salt,
    usr: username,
    "company-key": companyKey,
    source: SOURCE,
    _app_client_: APP_CLIENT,
    _app_id_: APP_ID,
    _app_version_: APP_VERSION,
    action: "authSource",
  });

  const response = await requestApi(url);

  if (!isSuccess(response)) {
    throw new Error(
      getDescription(response) || "SmartESS authentication failed",
    );
  }

  const dat = getData(response);

  if (!dat || typeof dat !== "object") {
    throw new Error("SmartESS authentication response is invalid");
  }

  const token = (dat as JsonRecord).token;
  const secret = (dat as JsonRecord).secret;

  if (typeof token !== "string" || typeof secret !== "string") {
    throw new Error("SmartESS token/secret missing");
  }

  return {
    token,
    secret,
    raw: response,
  };
}

async function authenticate(
  username: string,
  password: string,
): Promise<AuthResult> {
  const companyKey =
    process.env.SMARTESS_COMPANY_KEY?.trim() ||
    DEFAULT_COMPANY_KEY;

  let lastError = "SmartESS authentication failed";

  for (const candidate of usernameVariants(username)) {
    try {
      return await authenticateExact(
        candidate,
        password,
        companyKey,
      );
    } catch (error) {
      lastError =
        error instanceof Error
          ? error.message
          : "SmartESS authentication failed";

      const upper = lastError.toUpperCase();

      if (
        !upper.includes("NOT_FOUND_USR") &&
        !upper.includes("PASSWORD") &&
        !upper.includes("USER")
      ) {
        throw error;
      }
    }
  }

  throw new Error(lastError);
}

async function authedCall(
  auth: AuthResult,
  action: string,
  params: Record<string, string | number | undefined> = {},
): Promise<JsonRecord> {
  const salt = Date.now().toString();

  /*
   * Important:
   * After authentication Shamsak signs ONLY the actual action
   * parameters. Do not append source/app/client/version here.
   */
  const tail = actionString(action, params);

  const sign = sha1(
    `${salt}${auth.secret}${auth.token}${tail}`,
  );

  const url = buildUrl({
    sign,
    salt,
    token: auth.token,
    action,
    ...params,
  });

  return requestApi(url);
}

function asArray(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (item): item is JsonRecord =>
      !!item &&
      typeof item === "object" &&
      !Array.isArray(item),
  );
}

function normalizeCollector(item: JsonRecord): Collector {
  return {
    ...item,
    pn:
      typeof item.pn === "string"
        ? item.pn
        : typeof item.PN === "string"
          ? item.PN
          : undefined,
    name:
      typeof item.name === "string"
        ? item.name
        : typeof item.alias === "string"
          ? item.alias
          : undefined,
    status:
      item.status ??
      item.online ??
      item.state,
  };
}

function normalizeDevice(item: JsonRecord): Device {
  return {
    ...item,

    pn:
      typeof item.pn === "string"
        ? item.pn
        : typeof item.PN === "string"
          ? item.PN
          : undefined,

    sn:
      typeof item.sn === "string"
        ? item.sn
        : typeof item.SN === "string"
          ? item.SN
          : undefined,

    devcode:
      item.devcode ??
      item.devCode ??
      item.deviceCode,

    devaddr:
      item.devaddr ??
      item.devAddr ??
      item.deviceAddr ??
      item.address,

    status:
      item.status ??
      item.online ??
      item.state,

    name:
      typeof item.name === "string"
        ? item.name
        : typeof item.alias === "string"
          ? item.alias
          : undefined,
  };
}

function getResultItems(response: JsonRecord): JsonRecord[] {
  const dat = getData(response);

  if (Array.isArray(dat)) {
    return asArray(dat);
  }

  if (dat && typeof dat === "object") {
    const obj = dat as JsonRecord;

    for (const key of [
      "list",
      "rows",
      "items",
      "records",
      "data",
      "devices",
      "collectors",
    ]) {
      const value = obj[key];

      if (Array.isArray(value)) {
        return asArray(value);
      }
    }
  }

  return [];
}

async function listCollectors(
  auth: AuthResult,
): Promise<Collector[]> {
  const response = await authedCall(
    auth,
    "webQueryCollectorsEs",
    {
      page: "0",
      pagesize: "100",
    },
  );

  if (!isSuccess(response)) {
    return [];
  }

  return getResultItems(response).map(normalizeCollector);
}

function deviceFromSn(
  pn: string,
  sn: string,
): Device | null {
  /*
   * Shamsak-compatible fallback:
   *
   * PN + 6 hexadecimal characters
   *
   * first 4 chars = devcode
   * last 2 chars  = devaddr
   */
  if (!sn.startsWith(pn)) {
    return null;
  }

  const suffix = sn.slice(pn.length);

  if (!/^[0-9a-fA-F]{6}$/.test(suffix)) {
    return null;
  }

  const devcode = suffix.slice(0, 4);
  const devaddr = suffix.slice(4, 6);

  return {
    pn,
    sn,
    devcode,
    devaddr,
  };
}

async function tryDeviceAction(
  auth: AuthResult,
  action: string,
  params: Record<string, string | number | undefined>,
): Promise<Device[]> {
  try {
    const response = await authedCall(
      auth,
      action,
      params,
    );

    if (!isSuccess(response)) {
      return [];
    }

    return getResultItems(response).map(normalizeDevice);
  } catch {
    return [];
  }
}

async function discoverDevices(
  auth: AuthResult,
  pn: string,
): Promise<{
  devices: Device[];
  collectors: Collector[];
  attempts: string[];
}> {
  const devices: Device[] = [];
  const attempts: string[] = [];

  /*
   * 1. Primary Shamsak discovery endpoint.
   */
  const first = await tryDeviceAction(
    auth,
    "webQueryDeviceEs",
    {
      page: "0",
      pagesize: "100",
      pn,
    },
  );

  attempts.push(
    `webQueryDeviceEs:${first.length}`,
  );

  devices.push(...first);

  /*
   * 2. Collector list.
   */
  const collectors = await listCollectors(auth);

  attempts.push(
    `webQueryCollectorsEs:${collectors.length}`,
  );

  /*
   * 3. Generic device endpoints.
   */
  const second = await tryDeviceAction(
    auth,
    "webQueryDevice",
    {
      page: "0",
      pagesize: "100",
      pn,
    },
  );

  attempts.push(
    `webQueryDevice:${second.length}`,
  );

  devices.push(...second);

  const third = await tryDeviceAction(
    auth,
    "queryDevices",
    {
      page: "0",
      pagesize: "100",
      pn,
    },
  );

  attempts.push(
    `queryDevices:${third.length}`,
  );

  devices.push(...third);

  /*
   * 4. Collector-specific discovery.
   */
  for (const collector of collectors) {
    const collectorPn =
      typeof collector.pn === "string"
        ? collector.pn
        : undefined;

    if (
      collectorPn &&
      collectorPn !== pn
    ) {
      continue;
    }

    const byCollector = await tryDeviceAction(
      auth,
      "webQueryDeviceEs",
      {
        pn,
        page: "0",
        pagesize: "100",
      },
    );

    attempts.push(
      `collector:webQueryDeviceEs:${byCollector.length}`,
    );

    devices.push(...byCollector);

    const collectorDevices =
      await tryDeviceAction(
        auth,
        "queryCollectorDevices",
        {
          pn,
        },
      );

    attempts.push(
      `queryCollectorDevices:${collectorDevices.length}`,
    );

    devices.push(...collectorDevices);

    const collectorInfo =
      await tryDeviceAction(
        auth,
        "queryCollectorInfo",
        {
          pn,
        },
      );

    attempts.push(
      `queryCollectorInfo:${collectorInfo.length}`,
    );

    devices.push(...collectorInfo);
  }

  /*
   * 5. Remove duplicates.
   */
  const unique = new Map<string, Device>();

  for (const device of devices) {
    const key = [
      device.pn ?? "",
      device.sn ?? "",
      device.devcode ?? "",
      device.devaddr ?? "",
    ].join("|");

    if (!unique.has(key)) {
      unique.set(key, device);
    }
  }

  /*
   * 6. Shamsak-compatible SN fallback.
   */
  if (unique.size === 0) {
    const collector = collectors.find(
      (item) =>
        typeof item.pn === "string" &&
        item.pn === pn,
    );

    const possibleSn =
      collector?.sn ??
      collector?.SN;

    if (typeof possibleSn === "string") {
      const derived = deviceFromSn(
        pn,
        possibleSn,
      );

      if (derived) {
        unique.set(
          [
            derived.pn ?? "",
            derived.sn ?? "",
            derived.devcode ?? "",
            derived.devaddr ?? "",
          ].join("|"),
          derived,
        );
      }
    }
  }

  return {
    devices: [...unique.values()],
    collectors,
    attempts,
  };
}

function isOnline(device: Device): boolean {
  const value = device.status;

  return (
    value === 1 ||
    value === "1" ||
    value === true ||
    value === "online" ||
    value === "ONLINE" ||
    value === "Online"
  );
}

function pickDevice(
  devices: Device[],
  pn: string,
): Device | null {
  if (devices.length === 0) {
    return null;
  }

  const onlineMatching = devices.find(
    (device) =>
      device.pn === pn &&
      isOnline(device),
  );

  if (onlineMatching) {
    return onlineMatching;
  }

  const onlineAny = devices.find(
    (device) => isOnline(device),
  );

  if (onlineAny) {
    return onlineAny;
  }

  const matching = devices.find(
    (device) => device.pn === pn,
  );

  if (matching) {
    return matching;
  }

  return devices[0] ?? null;
}

function normalizeReading(
  item: JsonRecord,
): Reading {
  return {
    ...item,

    title:
      typeof item.title === "string"
        ? item.title
        : typeof item.name === "string"
          ? item.name
          : undefined,

    val:
      item.val ??
      item.value ??
      item.v,

    unit:
      typeof item.unit === "string"
        ? item.unit
        : undefined,
  };
}

function extractReadingItems(
  response: JsonRecord,
): Reading[] {
  const dat = getData(response);

  if (Array.isArray(dat)) {
    return asArray(dat).map(normalizeReading);
  }

  if (dat && typeof dat === "object") {
    const obj = dat as JsonRecord;

    for (const key of [
      "list",
      "rows",
      "items",
      "records",
      "data",
    ]) {
      const value = obj[key];

      if (Array.isArray(value)) {
        return asArray(value).map(
          normalizeReading,
        );
      }
    }
  }

  return [];
}

function numberValue(
  value: unknown,
): number | null {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(
      value.replace(",", ".").trim(),
    );

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function mapReadingValue(
  readings: Reading[],
  patterns: string[],
): number | null {
  for (const reading of readings) {
    const title =
      reading.title?.toLowerCase() ?? "";

    if (
      patterns.some((pattern) =>
        title.includes(pattern),
      )
    ) {
      const value = numberValue(
        reading.val,
      );

      if (value !== null) {
        return value;
      }
    }
  }

  return null;
}

async function readLastData(
  auth: AuthResult,
  device: Device,
  pn: string,
): Promise<{
  readings: Reading[];
  raw: JsonRecord;
  telemetry: JsonRecord;
}> {
  const response = await authedCall(
    auth,
    "queryDeviceLastData",
    {
      page: "0",
      pagesize: "100",
      i18n: "en_US",
      pn,
      devcode:
        device.devcode !== undefined
          ? String(device.devcode)
          : undefined,
      devaddr:
        device.devaddr !== undefined
          ? String(device.devaddr)
          : undefined,
      sn:
        typeof device.sn === "string"
          ? device.sn
          : undefined,
    },
  );

  if (!isSuccess(response)) {
    throw new Error(
      getDescription(response) ||
        "SmartESS last-data query failed",
    );
  }

  const readings =
    extractReadingItems(response);

  /*
   * We deliberately map only values that are actually
   * returned by DessMonitor. Missing values remain null.
   * No fabricated telemetry is generated.
   */
  const telemetry: JsonRecord = {
    pvPowerW: mapReadingValue(
      readings,
      [
        "pv power",
        "solar power",
        "pv1 power",
        "pv2 power",
        "pv watt",
      ],
    ),

    pvVoltageV: mapReadingValue(
      readings,
      [
        "pv voltage",
        "pv1 voltage",
        "pv2 voltage",
      ],
    ),

    pvCurrentA: mapReadingValue(
      readings,
      [
        "pv current",
        "pv1 current",
        "pv2 current",
      ],
    ),

    batteryVoltageV: mapReadingValue(
      readings,
      [
        "battery voltage",
        "bat voltage",
      ],
    ),

    batteryCurrentA: mapReadingValue(
      readings,
      [
        "battery current",
        "bat current",
      ],
    ),

    batterySoc: mapReadingValue(
      readings,
      [
        "battery soc",
        "battery percentage",
        "battery percent",
        "soc",
      ],
    ),

    loadPowerW: mapReadingValue(
      readings,
      [
        "load power",
        "load watt",
        "output power",
        "active power",
      ],
    ),

    outputVoltageV: mapReadingValue(
      readings,
      [
        "output voltage",
        "ac output voltage",
      ],
    ),

    gridVoltageV: mapReadingValue(
      readings,
      [
        "grid voltage",
        "ac input voltage",
        "utility voltage",
      ],
    ),

    gridPowerW: mapReadingValue(
      readings,
      [
        "grid power",
        "utility power",
        "ac input power",
      ],
    ),

    temperatureC: mapReadingValue(
      readings,
      [
        "temperature",
        "device temperature",
        "inverter temperature",
      ],
    ),
  };

  return {
    readings,
    raw: response,
    telemetry,
  };
}

function safeCollector(
  collector: Collector | undefined,
): JsonRecord | null {
  if (!collector) return null;

  return {
    pn: collector.pn ?? null,
    name: collector.name ?? null,
    status: collector.status ?? null,
  };
}

function safeDevice(
  device: Device | null,
): JsonRecord | null {
  if (!device) return null;

  return {
    pn: device.pn ?? null,
    sn: device.sn ?? null,
    devcode: device.devcode ?? null,
    devaddr: device.devaddr ?? null,
    status: device.status ?? null,
    name: device.name ?? null,
  };
}

function json(
  body: JsonRecord,
  status = 200,
) {
  return NextResponse.json(
    body,
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function POST(
  request: Request,
) {
  try {
    let body: JsonRecord = {};

    try {
      const parsed = await request.json();

      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      ) {
        body = parsed as JsonRecord;
      }
    } catch {
      body = {};
    }

    const username =
      process.env.SMARTESS_USERNAME?.trim();

    const password =
      process.env.SMARTESS_PASSWORD;

    const pn =
      typeof body.pn === "string" &&
      body.pn.trim()
        ? body.pn.trim()
        : process.env.SMARTESS_PN?.trim() ||
          DEFAULT_PN;

    const requestedDeviceId =
      typeof body.deviceId === "string"
        ? body.deviceId.trim()
        : "";

    const missing: string[] = [];

    if (!username) {
      missing.push("SMARTESS_USERNAME");
    }

    if (!password) {
      missing.push("SMARTESS_PASSWORD");
    }

    if (missing.length > 0) {
      console.error(
        "[SmartESS] Missing configuration:",
        missing.join(", "),
      );

      return json(
        {
          ok: false,
          code: "MISSING_ENV",
          message:
            "يرجى إعداد بيانات SmartESS في إعدادات Vercel ثم إعادة النشر.",
          missing,
        },
        503,
      );
    }

    console.log(
      "[SmartESS] Starting connection test",
    );

    const auth = await authenticate(
      username!,
      password!,
    );

    console.log(
      "[SmartESS] Authentication succeeded",
    );

    const discovered =
      await discoverDevices(
        auth,
        pn,
      );

    const device = pickDevice(
      discovered.devices,
      pn,
    );

    const collector =
      discovered.collectors.find(
        (item) => item.pn === pn,
      ) ??
      discovered.collectors[0];

    if (!device) {
      return json(
        {
          ok: false,
          code: "DEVICE_NOT_FOUND",
          message:
            "تم تسجيل الدخول إلى SmartESS لكن تعذر اكتشاف الإنفرتر.",
          pn,
          deviceId:
            requestedDeviceId || null,
          collector:
            safeCollector(collector),
          collectors:
            discovered.collectors.map(
              safeCollector,
            ),
          attempts:
            discovered.attempts,
        },
        404,
      );
    }

    if (
      device.status !== undefined &&
      !isOnline(device)
    ) {
      return json(
        {
          ok: false,
          code: "DEVICE_OFFLINE",
          message:
            "الإنفرتر أو جهاز الاتصال ظاهر في SmartESS لكنه غير متصل حالياً.",
          pn,
          device: safeDevice(device),
          collector:
            safeCollector(collector),
          attempts:
            discovered.attempts,
        },
        503,
      );
    }

    const lastData =
      await readLastData(
        auth,
        device,
        pn,
      );

    const timestamp =
      new Date().toISOString();

    console.log(
      "[SmartESS] Last data received successfully",
    );

    return json(
      {
        ok: true,
        code: "CONNECTED",
        message:
          "تم الاتصال بالإنفرتر وقراءة البيانات بنجاح.",
        timestamp,

        collector:
          safeCollector(collector),

        device:
          safeDevice(device),

        telemetry:
          lastData.telemetry,

        readings:
          lastData.readings,

        source: "smartess",

        deviceId:
          requestedDeviceId || null,
      },
      200,
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown SmartESS error";

    const upper = message.toUpperCase();

    /*
     * Never return:
     * - password
     * - token
     * - secret
     * - company key
     */
    console.error(
      "[SmartESS] Connection test failed:",
      message,
    );

    if (
      upper.includes("PASSWORD") ||
      upper.includes("NOT_FOUND_USR") ||
      upper.includes("USER")
    ) {
      return json(
        {
          ok: false,
          code: "AUTH_FAILED",
          message:
            "تعذر تسجيل الدخول إلى SmartESS. تحقق من اسم المستخدم وكلمة المرور.",
        },
        401,
      );
    }

    if (
      upper.includes("ABORT") ||
      upper.includes("TIMEOUT") ||
      upper.includes("TIMED OUT")
    ) {
      return json(
        {
          ok: false,
          code: "TIMEOUT",
          message:
            "انتهت مهلة الاتصال بخادم SmartESS.",
        },
        504,
      );
    }

    if (
      upper.includes("INVALID JSON") ||
      upper.includes("SMARTESS RETURNED")
    ) {
      return json(
        {
          ok: false,
          code: "UPSTREAM_INVALID",
          message:
            "خادم SmartESS أعاد استجابة غير صالحة.",
        },
        502,
      );
    }

    return json(
      {
        ok: false,
        code: "UPSTREAM_UNAVAILABLE",
        message:
          "تعذر الاتصال بخدمة SmartESS أو قراءة بيانات الإنفرتر.",
      },
      502,
    );
  }
}
