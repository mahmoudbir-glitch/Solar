import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/inverter-config-crypto";
import { patchConnectionExtras } from "@/lib/connection-extras";
import { authenticate, DessError, describeDessError, discoverDevices, listCollectors, pickDevice, readLastData, type DessAuth, type DessDevice, type DessReading } from "@/lib/dessmonitor";
import { ingestSample } from "@/lib/telemetry-store";
import { adoptEnvCloudAccount, defaultConnectionData, envCloudAccount } from "@/lib/smartess-env";

/**
 * Pulls the latest reading from the SmartESS cloud and stores it as telemetry,
 * so the dashboard works without a local gateway. The datalogger only uploads
 * every few minutes, so polling faster than MIN_GAP_MS gains nothing.
 */
const MIN_GAP_MS = 60_000;
export const SMARTESS_SOURCE = "smartess-cloud";

export type SyncResult = { ok: true; stored: true } | { ok: false; skipped?: boolean; reason: string };

let cachedAuth: { key: string; auth: DessAuth } | null = null;
let lastStatusCheckAt = 0;
/** Last online-status answer; while offline, the status is re-checked on every run. */
let lastSeenOffline = false;
let parametersLogged = false;

/** How long identical readings may repeat before they count as frozen. */
const FROZEN_WINDOW_MS = 15 * 60_000;
/** How often a remembered device's online status is re-checked. */
const STATUS_CHECK_MS = 10 * 60_000;

const nearlyEqual = (a: number | null | undefined, b: number | null | undefined) =>
  a == null || b == null ? a == null && b == null : Math.abs(a - b) < 0.01;

/**
 * When the dongle stops uploading, SmartESS keeps answering with its last
 * values. A live system never holds load, battery power and voltage exactly
 * still for 15 minutes, so identical readings across that window mean the data
 * is frozen and must not be stored (it would inflate today's totals).
 */
async function isFrozen(reading: DessReading) {
  const select = { timestamp: true, pvPowerW: true, loadPowerW: true, batterySoc: true, batteryPowerW: true, batteryVoltage: true } as const;
  const next = {
    pv: Math.max(0, reading.solarPowerW ?? 0),
    load: Math.max(0, reading.loadPowerW ?? 0),
    soc: Math.min(100, Math.max(0, reading.batterySoc ?? 0)),
    battery: reading.batteryPowerW ?? 0,
    voltage: reading.batteryVoltage !== undefined ? Math.max(0, reading.batteryVoltage) : null,
  };
  type Row = { timestamp: Date; pvPowerW: number; loadPowerW: number; batterySoc: number; batteryPowerW: number; batteryVoltage: number | null };
  const same = (row: Row) =>
    nearlyEqual(row.pvPowerW, next.pv) &&
    nearlyEqual(row.loadPowerW, next.load) &&
    nearlyEqual(row.batterySoc, next.soc) &&
    nearlyEqual(row.batteryPowerW, next.battery) &&
    nearlyEqual(row.batteryVoltage, next.voltage);

  // Find when these exact values first appeared: walk back through recent rows
  // until one differs. If they have been unchanged for longer than the window,
  // the dongle has stopped uploading. (Judging by the run's start rather than
  // by the rows inside the window keeps the verdict stable: skipped readings
  // no longer thin the window out and let a frozen value slip back in.)
  const recent = await prisma.telemetryLog.findMany({
    where: { source: SMARTESS_SOURCE, timestamp: { gte: new Date(Date.now() - 6 * 3_600_000) } },
    orderBy: { timestamp: "desc" },
    take: 400,
    select,
  });
  let runStart: Date | null = null;
  for (const row of recent) {
    if (!same(row)) break;
    runStart = row.timestamp;
  }
  return runStart !== null && Date.now() - runStart.getTime() > FROZEN_WINDOW_MS;
}
let inFlight: Promise<SyncResult> | null = null;
let lastAttemptAt = 0;

/**
 * When mapping fails, the only way to fix it is to see what SmartESS actually
 * sent, so put the labels and values (or the payload's shape) in the message.
 */
function describeAvailable(reading: DessReading, device?: Record<string, unknown>): string {
  const entries = Object.entries(reading.parameters);
  if (entries.length) {
    const list = entries.slice(0, 60).map(([label, { value, unit }]) => `${label}=${value}${unit}`).join(" | ");
    return `القيم المتاحة (${entries.length}): ${list}`;
  }
  const body = (reading.raw ?? {}) as Record<string, unknown>;
  const dat = body.dat;
  const shape = dat && typeof dat === "object" ? Object.keys(dat as object).join(",") : String(dat);
  const parsRaw = dat && typeof dat === "object" ? (dat as Record<string, unknown>).pars : undefined;
  const parsText = JSON.stringify(parsRaw ?? null) ?? "null";
  const gts = dat && typeof dat === "object" ? String((dat as Record<string, unknown>).gts ?? "") : "";
  const state = device ? ` حالة الجهاز في SmartESS: status=${String(device.status ?? "؟")}.` : "";
  return `لم يُرجع SmartESS أي قراءات (dat{${shape}}، وقت الرفع: ${gts || "لا يوجد"}، pars=${parsText.slice(0, 120)}).${state} غالباً الدنجل غير متصل بالإنترنت فلا يرفع بيانات؛ تأكد أن ضوء الدنجل ثابت وأن الجهاز يظهر Online في SmartESS.`;
}

/** Converts a mapped reading into a stored sample, or says which fields were missing. */
export async function storeReading(reading: DessReading, device?: Record<string, unknown>): Promise<SyncResult> {
  const missing: string[] = [];
  if (reading.solarPowerW === undefined) missing.push("solarPowerW");
  if (reading.loadPowerW === undefined) missing.push("loadPowerW");
  if (reading.batterySoc === undefined) missing.push("batterySoc");
  if (reading.batteryPowerW === undefined) missing.push("batteryPowerW");
  if (reading.gridConnected === undefined) missing.push("gridConnected");
  if (missing.length) {
    return { ok: false, reason: `لم تُقرأ الحقول التالية من SmartESS: ${missing.join(", ")}. ${describeAvailable(reading, device)}` };
  }

  await ingestSample({
    pv_power: Math.max(0, reading.solarPowerW!),
    load_power: Math.max(0, reading.loadPowerW!),
    battery_soc: Math.min(100, Math.max(0, reading.batterySoc!)),
    battery_power: reading.batteryPowerW!,
    battery_voltage: reading.batteryVoltage !== undefined ? Math.max(0, reading.batteryVoltage) : undefined,
    battery_current: reading.batteryCurrent,
    battery_temperature: reading.batteryTemperature,
    grid_status: reading.gridConnected!,
    grid_power: reading.gridPowerW,
    grid_voltage: reading.gridVoltage !== undefined ? Math.max(0, reading.gridVoltage) : undefined,
    inverter_temperature: reading.inverterTemperature,
    load_percent: reading.loadPercent,
    operating_mode: reading.operatingMode,
    output_priority: reading.outputPriority,
    charger_priority: reading.chargerPriority,
    source: SMARTESS_SOURCE,
  });
  return { ok: true, stored: true };
}

/** After SmartESS rejects the username/password, wait this long before trying again. */
const AUTH_BACKOFF_MS = 30 * 60_000;
/** A reused login older than this is dropped after any SmartESS error. */
const STALE_LOGIN_MS = 60 * 60_000;

async function run(deadline: number): Promise<SyncResult> {
  let found = await prisma.inverterConnection.findFirst({
    where: { protocol: "Wi-Fi Datalogger", enabled: true },
    orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
  });
  // First run on a new database: the SmartESS account comes from the environment.
  if (!found && envCloudAccount() && (await prisma.inverterConnection.count()) === 0) {
    found = await prisma.inverterConnection.create({ data: defaultConnectionData() });
  }
  const row = found ? await adoptEnvCloudAccount(found) : null;
  if (!row) return { ok: false, skipped: true, reason: "no_wifi_datalogger_connection" };

  const fail = async (reason: string): Promise<SyncResult> => {
    console.warn("[smartess] sync_not_stored", reason);
    await prisma.inverterConnection
      .update({ where: { id: row.id }, data: { lastStatus: "error", lastTestReason: reason } })
      .catch(() => {});
    return { ok: false, reason };
  };

  let extras: Record<string, unknown> = {};
  try {
    const raw = row.inverterLinkCode ? decryptSecret(row.inverterLinkCode) : "";
    if (raw) extras = JSON.parse(raw);
  } catch (error) {
    console.error("[smartess] extras_decrypt_failed", error);
  }
  const username = typeof extras.cloudUsername === "string" ? extras.cloudUsername : "";
  const password = typeof extras.cloudPassword === "string" ? extras.cloudPassword : "";
  if (!username || !password) {
    console.warn("[smartess] sync_skipped cloud_credentials_missing");
    return { ok: false, skipped: true, reason: "cloud_credentials_missing" };
  }
  // Wrong credentials are retried every 30 minutes, not every minute, so the
  // account is not hammered (and possibly locked). Saving the connection form
  // rewrites these extras and clears the pause at once.
  const authFailedAt = Number(extras.authFailedAt ?? 0);
  if (authFailedAt && Date.now() - authFailedAt < AUTH_BACKOFF_MS) {
    return { ok: false, skipped: true, reason: "auth_backoff" };
  }

  const cloudUrl = process.env.SOLAR_DESSMONITOR_URL || undefined;
  // Kept short: this runs in the background of a dashboard request.
  const timeout = 12000;

  // Logging in from here can end the session of the owner's phone app, so a
  // login is reused for as long as SmartESS honours it: first from memory, then
  // from the encrypted copy in the database (serverless instances come and go),
  // and only then by signing in again. Saving the connection form clears it.
  // `extras` is this run's copy and can be a minute old by the time something
  // is written, so every write patches what is stored now instead of writing
  // the copy back (which could undo a password the owner just corrected).
  const patchExtras = (change: (stored: Record<string, unknown>) => void) =>
    patchConnectionExtras(row.id, { username, password }, change);
  const savePersistedAuth = async (auth: DessAuth | null) => {
    await patchExtras((stored) => {
      if (auth) {
        stored.dessAuth = { username, auth };
        delete stored.authFailedAt;
      } else delete stored.dessAuth;
    }).catch((error) => console.error("[smartess] persist_auth_failed", error));
  };

  let reusedAuth = false;
  let authInUse: DessAuth | null = null;
  try {
    const key = `${username}\u0000${password.length}`;
    let auth: DessAuth | null = cachedAuth && cachedAuth.key === key && cachedAuth.auth.expiresAt > Date.now() ? cachedAuth.auth : null;
    if (!auth) {
      const saved = extras.dessAuth as { username?: string; auth?: DessAuth } | undefined;
      if (saved?.username === username && saved.auth && saved.auth.token && saved.auth.secret && saved.auth.expiresAt > Date.now()) {
        auth = saved.auth;
      }
    }
    if (auth) {
      reusedAuth = true;
    } else {
      try {
        auth = await authenticate({ username, password, baseUrl: cloudUrl }, timeout);
      } catch (error) {
        if (error instanceof DessError && /NOT_FOUND_USR|PASSWORD/i.test(error.message)) {
          await patchExtras((stored) => {
            stored.authFailedAt = Date.now();
            delete stored.dessAuth;
          }).catch(() => {});
        }
        throw error;
      }
      await savePersistedAuth(auth);
    }
    authInUse = auth;
    cachedAuth = { key, auth };

    // The connection test stores the device that worked; reuse it so each sync
    // is a single read instead of up to seven discovery calls.
    const remembered = extras.dessDevice as DessDevice | undefined;
    let target: DessDevice;
    let device: Record<string, unknown> | undefined;
    if (remembered && remembered.pn && remembered.sn && Number.isFinite(Number(remembered.devcode))) {
      target = { pn: remembered.pn, sn: remembered.sn, devcode: Number(remembered.devcode), devaddr: Number(remembered.devaddr ?? 1) };
      // The remembered path skips discovery, so re-check the datalogger's
      // online status now and then (one call). A failed check is ignored.
      // Once seen offline, keep checking every run: SmartESS serves stale (and
      // partly zeroed, e.g. battery 0%) values until the dongle is back.
      if (lastSeenOffline || Date.now() - lastStatusCheckAt > STATUS_CHECK_MS) {
        lastStatusCheckAt = Date.now();
        const pn = target.pn;
        const collector = await listCollectors(auth, cloudUrl, timeout)
          .then((list) => list.find((entry) => String(entry.pn ?? "").trim() === pn))
          .catch(() => undefined);
        if (collector) lastSeenOffline = Number(collector.status) === 1;
        if (collector && Number(collector.status) === 1) {
          return await fail("الدنجل غير متصل في SmartESS (Offline)، لذلك لم تُحفظ قراءة.");
        }
      }
    } else {
      const { devices } = await discoverDevices(auth, cloudUrl, timeout);
      const wanted = (row.dataloggerPn || "").trim();
      device = pickDevice(devices, wanted);
      if (!device) return await fail("تم تسجيل الدخول إلى SmartESS، لكن الحساب لا يحتوي أي جهاز.");

      // SmartESS reports an offline device's last known values as if current.
      // Storing them would show hours-old numbers as live, so refuse.
      if (Number(device.status) === 1) {
        return await fail("الجهاز غير متصل في SmartESS (Offline)، لذلك لم تُحفظ قراءة.");
      }
      target = {
        pn: String(device.pn ?? wanted),
        devcode: Number(device.devcode ?? 0),
        devaddr: Number(device.devaddr ?? 1),
        sn: String(device.sn ?? row.dataloggerDeviceIdentifier ?? ""),
      };
      // Discovery costs up to seven slow calls; remember the result.
      extras = { ...extras, dessDevice: target };
      await patchExtras((stored) => {
        stored.dessDevice = target;
      }).catch((error) => console.error("[smartess] remember_device_failed", error));
    }

    const reading = await readLastData(auth, target, cloudUrl, timeout);
    if (!parametersLogged) {
      parametersLogged = true;
      console.info("[smartess] parameters", Object.entries(reading.parameters).map(([label, { value, unit }]) => `${label}=${value}${unit}`).join(" | ").slice(0, 3000));
    }
    // One short line per read, to measure how often the dongle really uploads.
    console.info(`[smartess] sig pvV=${reading.parameters["PV Voltage"]?.value ?? "-"} grid=${reading.gridPowerW ?? "-"} load=${reading.loadPowerW ?? "-"} soc=${reading.batterySoc ?? "-"}`);
    // The platform may resume this run after the request already answered;
    // a reading that arrives that late must not be stored as "now".
    if (Date.now() > deadline) return { ok: false, reason: "transient" };
    if (await isFrozen(reading)) {
      return await fail("الدنجل لا يرسل قراءات جديدة: القيم نفسها منذ 15 دقيقة. تأكد أن الدنجل متصل بالواي فاي.");
    }
    const stored = await storeReading(reading, device);
    if (!stored.ok) return await fail(stored.reason);
    await prisma.inverterConnection
      .update({ where: { id: row.id }, data: { lastStatus: "connected", lastSeenAt: new Date(), lastTestReason: null } })
      .catch(() => {});
    return stored;
  } catch (error) {
    // A slow or unreachable SmartESS is not a broken connection: keep the
    // current status instead of flipping the badge to "not connected".
    if (!(error instanceof DessError)) {
      console.error("[smartess] sync_transient", error);
      return { ok: false, reason: "transient" };
    }
    // A rejected login must be retried with fresh credentials, not a cached token.
    cachedAuth = null;
    // Only a rejected token justifies signing in again; a timeout must not
    // trigger another login, which is what could end the phone app's session.
    // SmartESS's wording for an expired token varies, so a reused login is also
    // dropped when it is over an hour old: the next run signs in once instead of
    // reusing a dead token until its (up to 7-day) expiry.
    const loginAge = authInUse?.obtainedAt ? Date.now() - authInUse.obtainedAt : Infinity;
    if (
      extras.dessAuth &&
      (/token|sign|expire|auth|secret|login|session/i.test(error.message) || (reusedAuth && loginAge > STALE_LOGIN_MS))
    ) {
      await savePersistedAuth(null);
    }
    console.error("[smartess] sync_failed", error);
    return await fail(describeDessError(error));
  }
}

/** Safe to call on every dashboard poll: it throttles itself and never throws. */
const RUN_BUDGET_MS = 45_000;
let inFlightSince = 0;

export async function syncSmartEss(): Promise<SyncResult> {
  const now = Date.now();
  // A run cut off by the platform never settles; without this the stale
  // promise would be returned forever and no sync would ever run again.
  if (inFlight && now - inFlightSince < RUN_BUDGET_MS + 15_000) return inFlight;
  // A few seconds of slack so a cron that fires slightly early is not throttled.
  if (now - lastAttemptAt < MIN_GAP_MS - 10_000) return { ok: false, skipped: true, reason: "throttled" };
  lastAttemptAt = now;
  inFlightSince = now;

  const attempt = (async (): Promise<SyncResult> => {
    try {
      // Another server instance may have synced moments ago.
      const latest = await prisma.telemetryLog.findFirst({
        where: { source: SMARTESS_SOURCE },
        orderBy: { timestamp: "desc" },
        select: { timestamp: true },
      });
      // The stored timestamp lags the cron by the read time, so compare with
      // slack; otherwise every other minute would be skipped.
      if (latest && now - latest.timestamp.getTime() < MIN_GAP_MS - 15_000) {
        return { ok: false, skipped: true, reason: "recent_sample_exists" };
      }
      // Stay inside the function's time limit; a slow SmartESS is transient.
      const budget = new Promise<SyncResult>((resolve) => setTimeout(() => resolve({ ok: false, reason: "transient" }), RUN_BUDGET_MS));
      return await Promise.race([run(now + RUN_BUDGET_MS), budget]);
    } catch (error) {
      console.error("[smartess] sync_crashed", error);
      return { ok: false, reason: "sync_crashed" };
    }
  })();

  inFlight = attempt.then((result) => {
    if (!(result.ok === false && result.skipped)) console.info("[smartess] sync_result", result.ok ? "stored" : result.reason.slice(0, 200));
    return result;
  }).finally(() => {
    inFlight = null;
  });
  return inFlight;
}
