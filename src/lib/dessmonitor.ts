import { createHash } from "node:crypto";

/**
 * Client for the DESSMonitor / SmartESS cloud, which is what the Wi-Fi Plug Pro
 * datalogger reports to. Reading from here needs no extra hardware: the dongle
 * is already pushing to it.
 *
 * The API is not publicly documented by the vendor. The request format below
 * matches what the SmartESS app itself sends and what several open-source
 * clients implement, so treat the response shape as unverified until a real
 * call succeeds — `raw` is carried through on every read precisely so the first
 * live response can be inspected instead of guessed at.
 *
 * Auth model:
 *   salt = milliseconds since epoch
 *   before a token exists:  sign = sha1(salt + sha1(password) + actionString)
 *   once authenticated:     sign = sha1(salt + secret + token + actionString)
 *   actionString = "&action=<name>&<k>=<v>..." with values URL-encoded
 */

const DEFAULT_BASE_URL = "https://api.dessmonitor.com/public/";
const DEFAULT_SOURCE = "1";
const DEFAULT_COMPANY_KEY = "bnrl_frRFjEz8Mkn";

const sha1 = (value: string) => createHash("sha1").update(value, "utf8").digest("hex");

export type DessAuth = {
  token: string;
  secret: string;
  /** Epoch milliseconds after which the token should be refreshed. */
  expiresAt: number;
  /** Epoch milliseconds when this login was made. */
  obtainedAt?: number;
  usr?: string;
};

export type DessConfig = {
  username: string;
  password: string;
  companyKey?: string;
  baseUrl?: string;
  source?: string;
};

export type DessDevice = {
  pn: string;
  devcode: number;
  devaddr: number;
  sn: string;
};

export class DessError extends Error {
  readonly code: number | string;
  readonly raw: unknown;
  constructor(message: string, code: number | string, raw?: unknown) {
    super(message);
    this.name = "DessError";
    this.code = code;
    this.raw = raw;
  }
}

function buildActionString(action: string, params: Record<string, string | number | undefined>) {
  let actionString = `&action=${action}`;
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    actionString += `&${key}=${encodeURIComponent(String(value))}`;
  }
  return actionString;
}

async function call(
  baseUrl: string,
  signature: string,
  salt: string,
  actionString: string,
  token: string | undefined,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  let url = `${baseUrl}?sign=${signature}&salt=${salt}`;
  if (token) url += `&token=${token}`;
  url += actionString;

  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new DessError(`DESSMonitor returned HTTP ${response.status}`, response.status);
  }

  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) throw new DessError("DESSMonitor returned a non-JSON body", "invalid_json");

  // The API signals failure in the body with err != 0, not via HTTP status.
  const err = Number(body.err ?? 0);
  if (err !== 0) {
    throw new DessError(String(body.desc ?? `DESSMonitor error ${err}`), err, body);
  }
  return body;
}

/**
 * SmartESS user names are case-sensitive and phone keyboards silently
 * lower-case or capitalise them, so "Mahmoudbir" typed as "mahmoudbir" is
 * reported as an unknown user, or matched to someone else's account that
 * rejects the password. On either error, retry a few common spellings with the
 * same password; any other error (network, server) is returned immediately.
 */
export async function authenticate(config: DessConfig, timeoutMs = 15000): Promise<DessAuth> {
  const typed = config.username.trim();
  const variants = Array.from(
    new Set([
      typed,
      typed.charAt(0).toUpperCase() + typed.slice(1),
      typed.toLowerCase(),
      typed.toUpperCase(),
    ]),
  );
  // A lower-case spelling can belong to a different person's account, which
  // answers "wrong password" rather than "unknown user". So both errors move on
  // to the next spelling; any other error (network, server) stops at once.
  let firstError: unknown;
  for (const username of variants) {
    try {
      return await authenticateExact({ ...config, username }, timeoutMs);
    } catch (error) {
      firstError ??= error;
      if (!(error instanceof DessError) || !/NOT_FOUND_USR|PASSWORD/i.test(error.message)) throw error;
    }
  }
  throw firstError;
}

/** Logs in and returns the token/secret pair used to sign later requests. */
async function authenticateExact(config: DessConfig, timeoutMs = 15000): Promise<DessAuth> {
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  const salt = String(Date.now());
  const actionString = buildActionString("authSource", {
    usr: config.username,
    "company-key": config.companyKey || DEFAULT_COMPANY_KEY,
    source: config.source || DEFAULT_SOURCE,
    "_app_client_": "web",
    "_app_id_": "solar",
    "_app_version_": "1.2.0",
  });

  const signature = sha1(`${salt}${sha1(config.password)}${actionString}`);
  const body = await call(baseUrl, signature, salt, actionString, undefined, timeoutMs);
  const dat = (body.dat ?? {}) as Record<string, unknown>;

  const token = typeof dat.token === "string" ? dat.token : "";
  const secret = typeof dat.secret === "string" ? dat.secret : "";
  if (!token || !secret) {
    throw new DessError("DESSMonitor did not return a token/secret pair", "no_token", body);
  }

  // The API reports a lifetime in seconds; fall back to 7 days, and always
  // renew a little early so a call never lands on an expiring token.
  const expiresIn = Number(dat.expire ?? 0) || 7 * 24 * 3600;
  return {
    token,
    secret,
    expiresAt: Date.now() + Math.max(60, expiresIn - 300) * 1000,
    obtainedAt: Date.now(),
    usr: typeof dat.usr === "string" ? dat.usr : config.username,
  };
}

async function authedCall(
  auth: DessAuth,
  action: string,
  params: Record<string, string | number | undefined>,
  baseUrl = DEFAULT_BASE_URL,
  timeoutMs = 15000,
) {
  const salt = String(Date.now());
  const actionString = buildActionString(action, params);
  const signature = sha1(`${salt}${auth.secret}${auth.token}${actionString}`);
  return call(baseUrl, signature, salt, actionString, auth.token, timeoutMs);
}

/** Lists the dataloggers ("collectors") on the account. */
export async function listCollectors(auth: DessAuth, baseUrl?: string, timeoutMs?: number) {
  const body = await authedCall(auth, "webQueryCollectorsEs", { page: 0, pagesize: 50 }, baseUrl, timeoutMs);
  const dat = (body.dat ?? {}) as Record<string, unknown>;
  const collectors = Array.isArray(dat.collector) ? dat.collector : [];
  return collectors as Array<Record<string, unknown>>;
}

/** Finds every object in a response that looks like a device (has sn + devcode). */
function collectDevices(node: unknown, out: Map<string, Record<string, unknown>>, depth = 0) {
  if (!node || typeof node !== "object" || depth > 6) return;
  if (Array.isArray(node)) {
    for (const child of node) collectDevices(child, out, depth + 1);
    return;
  }
  const item = node as Record<string, unknown>;
  if (typeof item.sn === "string" && item.sn && item.devcode !== undefined) {
    out.set(item.sn, item);
    return;
  }
  for (const child of Object.values(item)) collectDevices(child, out, depth + 1);
}

/**
 * webQueryDeviceEs only lists energy-storage devices. A device the app shows
 * with type "Other" is missing from it and the call answers
 * ERR_NOT_FOUND_DEVICE, although the device is online. So fall back to the
 * account's dataloggers and ask for the devices behind each one through the
 * other listing actions. Every attempt is recorded so an empty result can be
 * diagnosed from the message instead of guessed at.
 */
export async function discoverDevices(auth: DessAuth, baseUrl?: string, timeoutMs?: number) {
  const found = new Map<string, Record<string, unknown>>();
  const attempts: string[] = [];
  const attempt = async (label: string, action: string, params: Record<string, string | number | undefined>) => {
    try {
      const body = await authedCall(auth, action, params, baseUrl, timeoutMs);
      const before = found.size;
      collectDevices(body.dat, found);
      const shape = body.dat && typeof body.dat === "object" ? Object.keys(body.dat as object).slice(0, 12).join(",") : String(body.dat);
      attempts.push(found.size > before ? `${label}:${found.size - before}` : `${label}:0{${shape}}`);
    } catch (error) {
      attempts.push(`${label}:${error instanceof DessError ? error.message : "error"}`);
    }
  };

  await attempt("es", "webQueryDeviceEs", { page: 0, pagesize: 50 });
  if (found.size) return { devices: [...found.values()], collectors: [] as Array<Record<string, unknown>>, attempts };

  let collectors: Array<Record<string, unknown>> = [];
  try {
    collectors = await listCollectors(auth, baseUrl, timeoutMs);
    attempts.push(`collectors:${collectors.length}`);
  } catch (error) {
    attempts.push(`collectors:${error instanceof DessError ? error.message : "error"}`);
  }

  await attempt("all", "webQueryDevice", { page: 0, pagesize: 50 });
  await attempt("devices", "queryDevices", { page: 0, pagesize: 50 });
  for (const collector of collectors) {
    const pn = String(collector.pn ?? "").trim();
    if (!pn || found.size) continue;
    await attempt("es+pn", "webQueryDeviceEs", { page: 0, pagesize: 50, pn });
    await attempt("collectorDevices", "queryCollectorDevices", { pn });
    await attempt("collectorInfo", "queryCollectorInfo", { pn });
  }
  if (!found.size) {
    // Nothing is listed, yet the app shows the device with SN = PN + 4 hex
    // digits of devcode + 2 hex digits of devaddr (seen: Q0045395318912 +
    // "0948" + "01"). Offer that device, and the same shape for any SN the
    // owner typed, so the read itself can be tried.
    for (const candidate of [...collectors.map((entry) => ({ pn: String(entry.pn ?? "").trim(), status: entry.status }))]) {
      if (!candidate.pn) continue;
      const guessed = deviceFromSn(candidate.pn, candidate.pn + "094801");
      if (guessed) {
        found.set(guessed.sn, { ...guessed, status: candidate.status, derived: true });
        attempts.push(`derived:${guessed.sn}`);
      }
    }
  }
  return { devices: [...found.values()], collectors, attempts };
}

/** Splits a SmartESS device SN of the form PN + devcode(4 hex) + devaddr(2 hex). */
export function deviceFromSn(pn: string, sn: string): DessDevice | null {
  const cleanPn = pn.trim();
  const cleanSn = sn.trim();
  if (!cleanPn || !cleanSn.startsWith(cleanPn)) return null;
  const rest = cleanSn.slice(cleanPn.length);
  if (!/^[0-9a-fA-F]{6}$/.test(rest)) return null;
  return { pn: cleanPn, sn: cleanSn, devcode: parseInt(rest.slice(0, 4), 16), devaddr: parseInt(rest.slice(4), 16) };
}

/**
 * Picks the device to read. The saved datalogger PN is the owner's choice and
 * is never overridden: with several devices on the account, only one whose PN
 * matches is read (an online one first; status 1 means offline in SmartESS),
 * and when none matches nothing is picked, so the caller can ask the owner
 * instead of silently reading someone else's inverter. An account with a single
 * device has no such ambiguity, so that device is used even if the PN was
 * mistyped or never entered.
 */
export function pickDevice(devices: Array<Record<string, unknown>>, wantedPn: string) {
  const wanted = wantedPn.trim();
  const isOnline = (entry: Record<string, unknown>) => Number(entry.status) !== 1;
  if (wanted) {
    // Some listings omit the PN; the device SN always starts with it.
    const matching = devices.filter((entry) => {
      const pn = String(entry.pn ?? "").trim();
      return pn ? pn === wanted : String(entry.sn ?? "").trim().startsWith(wanted);
    });
    if (matching.length) return matching.find(isOnline) ?? matching[0];
  }
  return devices.length === 1 ? devices[0] : undefined;
}

/** Says why no device was picked, naming the PNs the owner can choose from. */
export function describeNoDevice(devices: Array<Record<string, unknown>>, wantedPn: string): string {
  if (!devices.length) return "تم تسجيل الدخول إلى SmartESS، لكن الحساب لا يحتوي أي جهاز.";
  const pns = Array.from(new Set(devices.map((entry) => String(entry.pn ?? entry.sn ?? "").trim()).filter(Boolean))).join("، ");
  const wanted = wantedPn.trim();
  return wanted
    ? `حساب SmartESS يحتوي ${devices.length} أجهزة ولا يطابق أيٌّ منها رقم الدنجل المحفوظ (${wanted}). الأرقام الموجودة في الحساب: ${pns}. اكتب الرقم الصحيح في خانة «رقم Datalogger (PN)» ثم أعد الاختبار.`
    : `حساب SmartESS يحتوي ${devices.length} أجهزة ولم يُحدَّد أيها يخص هذه المنظومة. الأرقام الموجودة في الحساب: ${pns}. اكتب رقم الدنجل في خانة «رقم Datalogger (PN)» ثم أعد الاختبار.`;
}

export type DessReading = {
  solarPowerW?: number;
  loadPowerW?: number;
  batterySoc?: number;
  batteryVoltage?: number;
  batteryCurrent?: number;
  batteryPowerW?: number;
  batteryTemperature?: number;
  acOutputVoltage?: number;
  gridVoltage?: number;
  gridFrequency?: number;
  /** Hottest inverter module (DC / INV), °C. */
  inverterTemperature?: number;
  loadPercent?: number;
  operatingMode?: string;
  outputPriority?: string;
  chargerPriority?: string;
  gridPowerW?: number;
  gridConnected?: boolean;
  /** Every parameter the API returned, flattened to label -> value. */
  parameters: Record<string, { value: string; unit: string }>;
  /** Unmodified response body, for diagnosing a mapping that came back empty. */
  raw: unknown;
};

/**
 * Parameter labels differ between firmware versions and device codes, so the
 * mapper matches on the human-readable label rather than a fixed key.
 *
 * The patterns below are anchored on labels observed in the SmartESS app for
 * this installation (device SN 55355535553555): "AC output voltage",
 * "Battery discharge current", "Grid voltage", plus the flow-diagram values for
 * solar power, load and battery percentage. Other spellings this class of
 * device is known to use are accepted too. Anything unmatched still reaches the
 * caller through `parameters`, and `raw` keeps the untouched body.
 */
const FIELD_PATTERNS: Array<[keyof DessReading, RegExp, string?]> = [
  ["solarPowerW", /\b(pv|solar)\b.*\b(power|charging power)\b/i, "W"],
  // "pv_output_power" must not be read as the house load.
  ["loadPowerW", /^(?!.*\b(pv|solar)\b).*\b(load|output)\b.*\b(power|apparent|active)\b/i, "W"],
  ["batterySoc", /\b(battery|batt)\b.*\b(capacity|soc|percent|level)\b/i, "%"],
  ["batteryVoltage", /\b(battery|batt)\b.*\bvoltage\b/i, "V"],
  // One-direction labels ("battery discharge power") carry no sign; skip them.
  ["batteryPowerW", /^(?!.*\b(charg|discharg)\w*\b).*\b(battery|batt)\b.*\bpower\b/i, "W"],
  ["batteryTemperature", /\b(battery|batt)\b.*\btemp/i],
  ["acOutputVoltage", /\bac\s*output\b.*\bvoltage\b/i, "V"],
  ["gridFrequency", /\b(grid|utility|mains|ac\s*input)\b.*\bfreq/i, "Hz"],
  ["gridVoltage", /\b(grid|utility|ac\s*input|mains)\b.*\bvoltage\b/i, "V"],
  ["gridPowerW", /\b(grid|utility|mains)\b.*\bpower\b/i, "W"],
];

/**
 * Battery current is reported as two separate one-way parameters. The app's
 * convention is a single signed number: positive charging, negative discharging.
 */
const CHARGE_CURRENT = /\b(battery|batt)\b.*\bchargn?(e|ing)?\b.*\bcurrent\b/i;
const DISCHARGE_CURRENT = /\b(battery|batt)\b.*\bdischarg\w*\b.*\bcurrent\b/i;
const GENERIC_CURRENT = /\b(battery|batt)\b.*\bcurrent\b/i;

function toNumber(value: string) {
  const cleaned = String(value).replace(/[^\d.+-]/g, "");
  // "", "N/A" or "--" mean "no value", not 0 (a blank grid voltage read as 0 V
  // would report a grid outage).
  if (!/\d/.test(cleaned)) return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function mapReading(body: Record<string, unknown>): DessReading {
  const dat = (body.dat ?? {}) as Record<string, unknown>;
  const parameters: Record<string, { value: string; unit: string }> = {};

  // The parameter list has been seen as groups of {id, par, val, unit}. The
  // exact nesting varies by device family, so walk the whole payload for any
  // object that looks like a labelled value instead of trusting one path.
  const seen = new Set<unknown>();
  const visit = (node: unknown, depth: number) => {
    if (!node || typeof node !== "object" || depth > 6 || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const child of node) visit(child, depth + 1);
      return;
    }
    const item = node as Record<string, unknown>;
    const label = item.par ?? item.name ?? item.title ?? item.id;
    const value = item.val ?? item.value;
    if (typeof label === "string" && label.trim() && (typeof value === "string" || typeof value === "number")) {
      parameters[label.trim()] = { value: String(value), unit: String(item.unit ?? "") };
      return;
    }
    for (const child of Object.values(item)) visit(child, depth + 1);
  };
  visit(dat, 0);

  const reading: DessReading = { parameters, raw: body };
  const entries = Object.entries(parameters);

  for (const [field, pattern, expectedUnit] of FIELD_PATTERNS) {
    if (reading[field] !== undefined) continue;
    for (const [label, { value, unit }] of entries) {
      if (!pattern.test(label.replace(/_+/g, " "))) continue;
      if (expectedUnit && unit && !unit.toLowerCase().includes(expectedUnit.toLowerCase())) continue;
      const numeric = toNumber(value);
      if (numeric === undefined) continue;
      // "kW".includes("W") is true, so a kilowatt value passed the unit check
      // and -0.547 kW was stored as -0.547 W (battery shown as idle). Scale it.
      const scaled = expectedUnit === "W" && /^\s*kw\b/i.test(unit) ? numeric * 1000 : numeric;
      (reading as Record<string, unknown>)[field] = scaled;
      break;
    }
  }

  // Panel power is reported under several labels ("PV Power", "PV Charge
  // Power", "pv_output_power"). In Mains mode the inverter puts the panels'
  // output only into "PV Charge Power" (it all goes to the battery) and reports
  // "PV Power" as 0, so the app showed 0 W from the panels on a sunny morning.
  // The panels produce at least the largest of these figures.
  let pvMax: number | undefined;
  for (const [label, { value, unit }] of entries) {
    const words = label.replace(/_+/g, " ");
    if (!/\b(pv|solar)\b/i.test(words) || !/\bpower\b/i.test(words)) continue;
    if (unit && !/w/i.test(unit)) continue;
    const numeric = toNumber(value);
    if (numeric === undefined || numeric < 0) continue;
    const watts = /^\s*kw\b/i.test(unit) ? numeric * 1000 : numeric;
    pvMax = Math.max(pvMax ?? 0, watts);
  }
  if (pvMax !== undefined) reading.solarPowerW = Math.max(reading.solarPowerW ?? 0, pvMax);

  // Signed battery current: charging positive, discharging negative. A
  // one-way parameter reading 0 means that direction is simply inactive, so
  // whichever is non-zero wins rather than whichever appears first.
  let charge: number | undefined;
  let discharge: number | undefined;
  let generic: number | undefined;
  for (const [label, { value }] of entries) {
    const numeric = toNumber(value);
    if (numeric === undefined) continue;
    const words = label.replace(/_+/g, " ");
    if (DISCHARGE_CURRENT.test(words)) discharge ??= numeric;
    else if (CHARGE_CURRENT.test(words)) charge ??= numeric;
    else if (GENERIC_CURRENT.test(words)) generic ??= numeric;
  }
  if (charge !== undefined && charge !== 0) reading.batteryCurrent = Math.abs(charge);
  else if (discharge !== undefined && discharge !== 0) reading.batteryCurrent = -Math.abs(discharge);
  else if (generic !== undefined) reading.batteryCurrent = generic;
  else if (charge !== undefined || discharge !== undefined) reading.batteryCurrent = 0;

  // Derive battery power when only voltage and current are reported.
  if (reading.batteryPowerW === undefined && reading.batteryVoltage !== undefined && reading.batteryCurrent !== undefined) {
    reading.batteryPowerW = Math.round(reading.batteryVoltage * reading.batteryCurrent);
  }

  // Inverter status: module temperatures (labels are spelled "Termperature"),
  // load percent, and the text settings the inverter reports.
  const temps: number[] = [];
  for (const [label, { value }] of entries) {
    const words = label.replace(/_+/g, " ");
    if (/\b(dc|inv|inverter)\b.*\bmodule\b.*\bte?r?m?p/i.test(words) || /\binverter\b.*\btemp/i.test(words)) {
      const t = toNumber(value);
      if (t !== undefined) temps.push(t);
    } else if (/\bload\s*percent/i.test(words)) {
      reading.loadPercent ??= toNumber(value);
    } else if (/\b(operating|work(ing)?)\s*mode\b/i.test(words)) {
      reading.operatingMode ??= String(value).trim().slice(0, 64);
    } else if (/\boutput\b.*\bpriority\b/i.test(words)) {
      reading.outputPriority ??= String(value).trim().slice(0, 64);
    } else if (/\bcharger\b.*\bpriority\b/i.test(words)) {
      reading.chargerPriority ??= String(value).trim().slice(0, 96);
    }
  }
  if (temps.length) reading.inverterTemperature = Math.max(...temps);

  if (reading.gridVoltage !== undefined) {
    // Lebanon's grid is out more often than not; a dead AC input reads 0V.
    // Anything under 50V is not a live 230V mains.
    reading.gridConnected = reading.gridVoltage > 50;
  } else if (reading.gridFrequency !== undefined) {
    // Some device families report the grid only as frequency (seen: "Grid
    // Frequency 50.01 Hz"); a dead AC input reads 0 Hz.
    reading.gridConnected = reading.gridFrequency > 45;
  }

  return reading;
}

/** Reads the latest values the datalogger has uploaded for one device. */
/**
 * Diagnostic: dumps what a few endpoints say right now, to find which one (if
 * any) has fresher data than the "last data" endpoint. Never throws.
 */
export async function probeFreshness(auth: DessAuth, device: DessDevice, baseUrl?: string, timeoutMs?: number) {
  const base = { pn: device.pn, devcode: device.devcode, devaddr: device.devaddr, sn: device.sn, i18n: "en_US" };
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date());
  const probes: Array<[string, Record<string, string | number | undefined>]> = [
    ["queryDeviceDataOneDayPaging", { ...base, source: DEFAULT_SOURCE, date: day, page: 0, pagesize: 3 }],
    ["webQueryDeviceEnergyFlowEs", { ...base, source: DEFAULT_SOURCE }],
    ["queryDeviceParsEs", { ...base, source: DEFAULT_SOURCE }],
    ["queryDeviceCtrlField", { ...base, source: DEFAULT_SOURCE }],
  ];
  for (const [action, params] of probes) {
    try {
      const body = await authedCall(auth, action, params, baseUrl, timeoutMs);
      console.info(`[smartess] probe ${action} ${JSON.stringify(body.dat ?? body).slice(0, 1500)}`);
      if (action === "queryDeviceCtrlField") {
        // Reading a setting makes the cloud ask the dongle right now: success
        // means the dongle is reachable even if "last data" is stale.
        const fields = JSON.stringify(body.dat ?? {}).match(/"id":"([^"]+)"/);
        if (fields) {
          const started = Date.now();
          try {
            const live = await authedCall(auth, "queryDeviceCtrlValue", { ...base, source: DEFAULT_SOURCE, id: fields[1] }, baseUrl, timeoutMs);
            console.info(`[smartess] probe queryDeviceCtrlValue id=${fields[1]} ${Date.now() - started}ms ${JSON.stringify(live.dat ?? live).slice(0, 400)}`);
          } catch (error) {
            console.info(`[smartess] probe queryDeviceCtrlValue id=${fields[1]} failed after ${Date.now() - started}ms ${error instanceof Error ? error.message.slice(0, 160) : "error"}`);
          }
        }
      }
    } catch (error) {
      console.info(`[smartess] probe ${action} failed ${error instanceof Error ? error.message.slice(0, 160) : "error"}`);
    }
  }
}

/**
 * Diagnostic: the SmartESS phone app can show fresh numbers while
 * api.dessmonitor.com still serves an old copy. Log in to the other public
 * hosts of the same platform and log what each one says right now.
 */
export async function probeHosts(username: string, password: string, device: DessDevice, timeoutMs = 12000) {
  const hosts = [
    "https://web.dessmonitor.com/public/",
    "https://app.dessmonitor.com/public/",
    "https://ios.shinemonitor.com/public/",
    "https://android.shinemonitor.com/public/",
    "https://web.shinemonitor.com/public/",
  ];
  const base = { pn: device.pn, devcode: device.devcode, devaddr: device.devaddr, sn: device.sn, i18n: "en_US", source: DEFAULT_SOURCE };
  for (const host of hosts) {
    const started = Date.now();
    try {
      const auth = await authenticateExact({ username, password, baseUrl: host }, timeoutMs);
      const flow = await authedCall(auth, "webQueryDeviceEnergyFlowEs", base, host, timeoutMs);
      const text = JSON.stringify(flow.dat ?? {});
      const soc = text.match(/bt_battery_capacity","val":"([^"]+)/)?.[1];
      const pv = text.match(/pv_output_power","val":"([^"]+)/)?.[1];
      console.info(`[smartess] host ${host} ok ${Date.now() - started}ms soc=${soc} pv=${pv}`);
    } catch (error) {
      console.info(`[smartess] host ${host} failed ${Date.now() - started}ms ${error instanceof Error ? `${error.name} ${error.message}`.slice(0, 140) : "error"}`);
    }
  }
}

/** Logs when SmartESS says the reading was taken, to tell fresh data from a cached copy. */
function logDataTime(action: string, dat: unknown) {
  if (!dat || typeof dat !== "object") return;
  const stamps: string[] = [];
  for (const [key, value] of Object.entries(dat as Record<string, unknown>)) {
    if (/time|gts|date/i.test(key) && (typeof value === "string" || typeof value === "number")) stamps.push(`${key}=${value}`);
  }
  console.info(`[smartess] data_time ${action} ${stamps.join(" ") || "keys=" + Object.keys(dat as object).slice(0, 12).join(",")}`);
}

export async function readLastData(
  auth: DessAuth,
  device: DessDevice,
  baseUrl?: string,
  timeoutMs?: number,
): Promise<DessReading> {
  const params = { source: DEFAULT_SOURCE, devcode: device.devcode, pn: device.pn, devaddr: device.devaddr, sn: device.sn, i18n: "en_US" };
  const bodies: unknown[] = [];
  const failures: string[] = [];
  let networkError: unknown;
  // querySPDeviceLastData covers energy-storage inverters; other device types
  // answer through queryDeviceLastData, and the energy-flow view carries the
  // headline PV/load/battery figures the app draws on its house picture.
  for (const action of ["querySPDeviceLastData", "queryDeviceLastData", "webQueryDeviceEnergyFlowEs"]) {
    // SmartESS is slow and occasionally drops a request; one retry on a
    // network/timeout error, never on a real API answer.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const body = await authedCall(auth, action, params, baseUrl, timeoutMs);
        bodies.push(body.dat);
        logDataTime(action, body.dat);
        break;
      } catch (error) {
        if (error instanceof DessError) {
          failures.push(`${action}:${error.message}`);
          break;
        }
        networkError ??= error;
        if (attempt === 1) failures.push(`${action}:${error instanceof Error ? `${error.name} ${error.message}`.slice(0, 80) : "error"}`);
      }
    }
    const merged = mapReading({ dat: bodies });
    const complete = [merged.solarPowerW, merged.loadPowerW, merged.batterySoc, merged.batteryPowerW, merged.gridConnected].every((value) => value !== undefined);
    if (complete) return merged;
  }
  if (!bodies.length) {
    // Only timeouts/network failures: surface them as such so callers treat
    // this as a transient outage, not as a broken connection.
    if (networkError && failures.every((entry) => !/:ERR_/.test(entry))) throw networkError;
    throw new DessError(`READ_FAILED devcode=${device.devcode} devaddr=${device.devaddr} sn=${device.sn} | ${failures.join(" | ")}`, "read_failed");
  }
  return mapReading({ dat: bodies });
}

/** Plain-language (Arabic) explanation of the vendor's error codes. */
export function describeDessError(error: unknown): string {
  if (!(error instanceof DessError)) return "تعذر الوصول إلى خادم SmartESS من Solar.";
  const text = String(error.message || "");
  if (/^READ_FAILED/.test(text)) return `تم الدخول ووُجد الجهاز، لكن SmartESS رفض قراءة بياناته: ${text.replace(/^READ_FAILED\s*/, "")}`;
  if (/NOT_FOUND_USR/i.test(text)) return "اسم المستخدم غير موجود في SmartESS. جرّب الإيميل الذي تسجّل به.";
  if (/PASSWORD/i.test(text)) return "كلمة مرور SmartESS غير صحيحة. إن كنت متأكداً منها فقد يكون المتصفح عبّأ كلمة أخرى تلقائياً؛ امسح الخانة واكتبها بنفسك ثم احفظ.";
  if (/NOT_FOUND_DEVICE/i.test(text)) {
    return "تم تسجيل الدخول بنجاح، لكن الحساب لا يحتوي أي انفرتر مرتبط بالدنجل. أضف الانفرتر من تطبيق SmartESS (الجهاز ثم +) وتأكد أن الدنجل متصل.";
  }
  return `SmartESS رفض الطلب: ${text}`;
}
