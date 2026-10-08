import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("telemetry summary endpoint requires an authenticated session", () => {
  const source = read("src/app/api/telemetry/summary/route.ts");
  assert.match(source, /verifySessionToken\(/);
  assert.match(source, /if \(!session\).*401/s);
});

test("initial battery capacity remains aligned with Solar defaults", () => {
  const source = read("src/app/api/settings/route.ts");
  assert.match(source, /batteryCapacityWh:\s*4800/);
});

test("SmartESS datalogger migration is safe when columns already exist", () => {
  // The per-feature migrations were squashed into 0_init_baseline; assert against it
  // so this regression test keeps protecting re-runnable DDL instead of a deleted path.
  const source = read("prisma/migrations/0_init_baseline/migration.sql");
  const dataloggerColumns = [
    "dataloggerPn",
    "dataloggerType",
    "dataloggerFirmware",
    "dataloggerStationName",
    "dataloggerDeviceIdentifier",
    "dataloggerUpdateIntervalSec",
    "dataloggerCloud",
  ];
  for (const column of dataloggerColumns) {
    assert.match(source, new RegExp(`ADD COLUMN IF NOT EXISTS "${column}"`), `${column} must be added conditionally`);
  }
  // No unconditional ADD COLUMN anywhere: a re-run on an existing database must not fail.
  assert.doesNotMatch(source, /ADD COLUMN "/);
});

test("login failures do not reveal whether the username exists", () => {
  const source = read("src/app/api/auth/login/route.ts");
  assert.match(source, /error:\s*"invalid_credentials"/);
  assert.doesNotMatch(source, /error:\s*usernameOk\s*\?/);
});

test("logout uses a full navigation to prevent stale protected pages", () => {
  const source = read("src/components/logout-button.tsx");
  assert.match(source, /window\.location\.replace\(["']\/login["']\)/);
});


test("database and inverter defaults match the real Solar hardware", () => {
  const schema = read("prisma/schema.prisma");
  const connectionRoute = read("src/app/api/inverter/connection/route.ts");
  const migration = read("prisma/migrations/0_init_baseline/migration.sql");
  assert.match(schema, /batteryCapacityWh Float @default\(4800\)/);
  assert.match(schema, /inverterModel String @default\("NEXT - Victor Max 8\.2KW"\)/);
  assert.match(schema, /protocol String @default\("Wi-Fi Datalogger"\)/);
  assert.match(schema, /timeoutMs Int @default\(1000\)/);
  assert.match(connectionRoute, /batteryCapacityWh: input\.batteryCapacityWh !== undefined \? input\.batteryCapacityWh : 4800/);
  assert.match(migration, /SET DEFAULT 4800/);
  assert.match(migration, /NEXT - Victor Max 8\.2KW/);
  assert.match(migration, /Wi-Fi Datalogger/);
});

test("quiet hours accept real clock times", () => {
  const source = read("src/app/api/settings/route.ts");
  const declaration = source.match(/const TIME_HHMM = (\/.+\/);/);
  assert.ok(declaration, "settings route must declare a shared TIME_HHMM matcher");
  // Rebuild the matcher from the source literal so an escaping mistake fails the test.
  const pattern = new RegExp(declaration[1].slice(1, -1));
  for (const valid of ["00:00", "08:30", "13:45", "23:59"]) {
    assert.ok(pattern.test(valid), `${valid} must be accepted as a quiet-hours time`);
  }
  for (const invalid of ["24:00", "8:30", "12:60", "abcd"]) {
    assert.ok(!pattern.test(invalid), `${invalid} must be rejected`);
  }
});

test("telemetry ingest keeps a stored reading even if post-processing fails", () => {
  const store = read("src/lib/telemetry-store.ts");
  const source = store + read("src/app/api/telemetry/route.ts");
  // The write and the summary/alert work must be in separate try blocks, and the
  // second must not return 503 — otherwise the gateway retries and duplicates rows.
  const postProcessing = store.slice(store.indexOf("post_processing_failed") - 400);
  assert.match(source, /console\.error\("\[telemetry\] post_processing_failed"/);
  assert.doesNotMatch(postProcessing, /telemetry_write_failed/);
  assert.match(source, /stale: ageSeconds > STALE_AFTER_SEC/);
});

test("telemetry ingest reports a missing ingest token instead of a bare 401", () => {
  const source = read("src/app/api/telemetry/route.ts");
  assert.match(source, /telemetry_token_not_configured/);
  assert.match(source, /timingSafeEqual/);
});

test("Modbus gateway does not invent grid status when its profile cannot read it", () => {
  const gateway = read("gateway/gateway.py");
  assert.doesNotMatch(gateway, /"gridConnected": True/);
  assert.doesNotMatch(gateway, /"gridPowerW": 0\.0/);
  assert.match(gateway, /if "gridConnected" in snapshot:/);
  assert.match(gateway, /if "gridPowerW" in snapshot:/);
  assert.match(read("src/lib/telemetry.ts"), /grid_status: z\.boolean\(\)\.nullable\(\)\.optional\(\)/);
  assert.match(read("prisma/schema.prisma"), /gridConnected Boolean\?/);
  assert.match(read("prisma/migrations/20261003120000_allow_unknown_grid_status/migration.sql"), /ALTER COLUMN "gridConnected" DROP NOT NULL/);
  assert.match(read("src/components/energy-flow.tsx"), /gridConnected == null \? "غير معروفة"/);
});

test("RLS migration does not assume Supabase roles exist", () => {
  // Deployed as-is, `CREATE POLICY ... TO anon` aborted with `role "anon" does
  // not exist` on Prisma Postgres, leaving a failed migration that blocked every
  // later deploy with P3009. RLS itself must still be enabled unconditionally.
  const source = read("prisma/migrations/20260930140000_enable_rls_deny_public_roles/migration.sql");
  assert.match(source, /ALTER TABLE "InverterConnection" ENABLE ROW LEVEL SECURITY/);
  assert.match(source, /ALTER TABLE "EnergySettings" ENABLE ROW LEVEL SECURITY/);
  assert.match(source, /FROM pg_roles WHERE rolname/, "policies must be guarded by a role-existence check");
  assert.doesNotMatch(source, /^\s*CREATE POLICY .* TO (anon|authenticated)/m, "no unguarded CREATE POLICY for a Supabase role");
});

test("the test script survives the Node version CI runs", () => {
  // `node --test tests` treats the directory as one test file, and a quoted
  // glob is not expanded by Node 20. The glob must reach the shell unquoted.
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts.test, "node --test tests/*.test.mjs");
});

test("output source priority covers every option the inverter offers", () => {
  // SmartESS exposes three: Utility first / Solar first / SBU first. With only
  // SBU and SUB, an installation set to Utility first could not be represented.
  const route = read("src/app/api/settings/route.ts");
  assert.match(route, /outputSourcePriority: z\.enum\(\["SBU", "SUB", "UTI"\]\)/);
});

test("nameplate limits match the Victor Max-8.2KW rating label", () => {
  // Transcribed from the label: battery 40-63VDC / 190A, solar charge 160A,
  // AC charge 140A, load cut-off 44VDC, return 52VDC, rated 8.2kW.
  const source = read("src/lib/inverter-limits.ts");
  for (const value of ["minVoltage: 40", "maxVoltage: 63", "maxCurrentA: 190", "maxSolarCurrentA: 160", "maxAcCurrentA: 140", "cutOffVoltage: 44", "returnVoltage: 52", "ratedPowerKw: 8.2"]) {
    assert.ok(source.includes(value), `nameplate value missing: ${value}`);
  }
  assert.match(read("src/app/api/settings/route.ts"), /checkAgainstInverter\(limits, merged\)/);
});

test("stored defaults match the inverter's own load-transfer thresholds", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /lowDcCutoffVoltage Float\? @default\(44\.0\)/);
  assert.match(schema, /backToGridVoltage Float\? @default\(52\.0\)/);
});

test("SmartESS mapper recognises the labels this installation reports", () => {
  // Observed live in SmartESS for device SN 55355535553555:
  //   Grid 0.00V, PV 132W, Battery 75%, Load 194W,
  //   AC output 230.00V, Battery discharge current 1.00A.
  const source = read("src/lib/dessmonitor.ts");
  const patternFor = (field) => {
    const match = source.match(new RegExp(`\\["${field}", (/[^/]+/i)`));
    assert.ok(match, `no pattern declared for ${field}`);
    const body = match[1].slice(1, match[1].lastIndexOf("/"));
    return new RegExp(body, "i");
  };

  const observed = {
    solarPowerW: "PV Input Power",
    loadPowerW: "Output Active Power",
    batterySoc: "Battery Capacity",
    batteryVoltage: "Battery Voltage",
    acOutputVoltage: "AC Output Voltage",
    gridVoltage: "Grid Voltage",
  };
  for (const [field, label] of Object.entries(observed)) {
    assert.ok(patternFor(field).test(label), `${field} must match the label "${label}"`);
  }

  // "AC Output Voltage" must not be mistaken for the grid feed: the two read
  // 230V and 0V at the same moment, so confusing them inverts grid status.
  assert.ok(!patternFor("gridVoltage").test("AC Output Voltage"));

  // Charge and discharge arrive as separate one-way parameters and have to
  // become one signed number, or a discharging battery looks like a charging one.
  assert.match(source, /reading\.batteryCurrent = -Math\.abs\(discharge\)/);
  assert.match(source, /reading\.batteryCurrent = Math\.abs\(charge\)/);
});

test("Wi-Fi datalogger form lets the owner enter SmartESS credentials", () => {
  // The reader needs the SmartESS login, but the form only offered those fields
  // under "Cloud API", so a Wi-Fi Datalogger owner had nowhere to type them.
  const page = read("src/app/settings/page.tsx");
  const section = page.slice(page.indexOf('draft.protocol === "Wi-Fi Datalogger" && ('));
  const wifiBlock = section.slice(0, section.indexOf('draft.connectionMode === "gateway"'));
  assert.match(wifiBlock, /updateDraft\("cloudUsername"/);
  assert.match(wifiBlock, /updateDraft\("cloudPassword"/);
});

test("saving the connection form without retyping a password keeps it", () => {
  const route = read("src/app/api/inverter/connection/route.ts");
  assert.match(route, /preserveSecrets\(existing\?\.inverterLinkCode, extras\)/);
  assert.match(route, /"cloudPassword"/);
});

test("gateway SSRF guard blocks private, reserved and IPv4-mapped addresses", () => {
  // Evaluate the real function: string checks missed "::ffff:7f00:1" (127.0.0.1).
  const source = read("src/lib/net-guard.ts")
    .replace(/^import.*$/gm, "")
    .replace(/export /g, "")
    .replace(/: string/g, "")
    .replace(/async function assertPublicEndpoint[\s\S]*$/, "");
  const isPrivateIp = new Function(`${source}; return isPrivateIp;`)();
  for (const address of ["127.0.0.1", "::ffff:7f00:1", "::ffff:127.0.0.1", "::ffff:a9fe:a9fe", "169.254.169.254", "10.1.2.3", "172.16.0.1", "192.168.1.1", "0.1.2.3", "100.64.0.1", "::1", "fd00::1", "fe90::1", "localhost"]) {
    assert.equal(isPrivateIp(address), true, address);
  }
  for (const address of ["8.8.8.8", "1.1.1.1", "2606:4700::1"]) {
    assert.equal(isPrivateIp(address), false, address);
  }
});

test("both outbound test routes share one SSRF guard", () => {
  // Two divergent copies of this check is how the weaker one silently loses
  // coverage, so neither route may define its own.
  for (const route of ["src/app/api/inverter/test/route.ts", "src/app/api/connection/test/route.ts"]) {
    const source = read(route);
    assert.match(source, /from "@\/lib\/net-guard"/, `${route} must use the shared guard`);
    assert.match(source, /fetchPublicEndpoint\(/, `${route} must pin requests to the validated DNS address`);
    assert.doesNotMatch(source, /function isPrivateIp/, `${route} must not redefine isPrivateIp`);
  }
  assert.match(read("src/lib/net-guard.ts"), /headers\["Content-Length"\]/);
});

test("gateway token is recoverable so connection tests authenticate", () => {
  const connection = read("src/app/api/inverter/connection/route.ts");
  const test = read("src/app/api/inverter/test/route.ts");
  assert.match(connection, /gatewayTokenCipher: encryptSecret\(token\)/);
  assert.match(test, /decryptSecret/);
  assert.match(read("prisma/schema.prisma"), /gatewayTokenCipher String\?/);
});

test("connection test saves the form first so typed credentials are used", () => {
  // The test route reads stored credentials; testing before saving reported
  // "credentials missing" even though the owner had just typed them.
  const page = read("src/app/settings/page.tsx");
  const test = page.slice(page.indexOf("const testConnection"));
  assert.match(test.slice(0, 400), /await saveAll\(\)/);
});

test("connection save tolerates nulls the form echoes back", () => {
  // A stored row with no port/QoS made the form send null; Number(null) is 0
  // and z.number() rejects null, so saving failed with 'invalid_connection'.
  const route = read("src/app/api/inverter/connection/route.ts");
  assert.match(route, /if \(value === null\) return false/);
});

test("dashboard polling refreshes readings from SmartESS without blocking", () => {
  const route = read("src/app/api/telemetry/route.ts");
  // The background task must hand its promise to after(): with "void" the
  // function was frozen after responding and every SmartESS call timed out.
  assert.match(route, /after\(\(\) => syncSmartEss\(\)\)/);
  assert.doesNotMatch(route, /void syncSmartEss/);
  assert.match(route, /export const maxDuration = 60/);
  const sync = read("src/lib/smartess-sync.ts");
  // An offline device's last values must not be stored as live readings.
  assert.match(sync, /Number\(device\.status\) === 1/);
  // Throttled so dashboard polls cannot hammer the vendor API.
  assert.match(sync, /MIN_GAP_MS/);
  // Both the gateway route and the cloud reader store through one function.
  assert.match(read("src/lib/telemetry-store.ts"), /export async function ingestSample/);
  assert.match(route, /ingestSample\(input\)/);
});

test("SmartESS error codes are explained in plain language", () => {
  const source = read("src/lib/dessmonitor.ts");
  for (const code of ["NOT_FOUND_USR", "PASSWORD", "NOT_FOUND_DEVICE"]) {
    assert.match(source, new RegExp(code), `${code} must have its own explanation`);
  }
  assert.match(read("src/app/api/inverter/test/route.ts"), /describeDessError\(error\)/);
});

test("SmartESS login retries user-name spellings on unknown-user or wrong-password errors only", () => {
  const source = read("src/lib/dessmonitor.ts");
  // "plugpro" can be someone else's account that rejects the password, while
  // the owner's is "Plugpro"; network or server errors must not be retried.
  assert.match(source, /if \(!\(error instanceof DessError\) \|\| !\/NOT_FOUND_USR\|PASSWORD\/i\.test\(error\.message\)\) throw error;/);
  // The spelling SmartESS accepted is stored for later logins.
  assert.match(read("src/app/api/inverter/test/route.ts"), /const acceptedUser = auth\.usr || username;/);
});

test("forecast uses the saved settings, not localStorage keys nothing writes", () => {
  const hook = read("src/hooks/use-smart-energy.ts");
  assert.match(hook, /fetch\("\/api\/settings"/);
  assert.match(hook, /data\.panelPowerW/);
  assert.match(hook, /data\.batteryCapacityWh/);
  // The night-autonomy card must take the capacity from the hook as well.
  const card = read("src/components/smart-forecast.tsx");
  assert.doesNotMatch(card, /localStorage\.getItem\("solar_battery_capacity"\)/);
});

test("panel azimuth is converted from compass bearing to Open-Meteo's south-based scale", () => {
  // Compass 180 (south-facing) must become 0; compass 270 (west) must become 90.
  const convert = (az) => ((az % 360) + 360) % 360 - 180;
  assert.equal(convert(180), 0);
  assert.equal(convert(270), 90);
  assert.equal(convert(90), -90);
  for (const file of ["src/hooks/use-smart-energy.ts"]) {
    assert.match(read(file), /% 360\) \+ 360\) % 360 - 180/, `${file} must convert the bearing`);
  }
});

test("no component or library module is left without a user", () => {
  // Dead modules drift out of date and hide real bugs; keep the tree honest.
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(rel);
      else if (/\.(ts|tsx)$/.test(entry.name)) files.push(rel);
    }
  };
  for (const dir of ["src/lib", "src/components", "src/hooks"]) walk(dir);
  const all = [];
  const collect = (dir) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) collect(rel);
      else if (/\.(ts|tsx)$/.test(entry.name)) all.push(rel);
    }
  };
  collect("src");
  all.push("src/middleware.ts");
  const orphans = files.filter((file) => {
    const base = path.basename(file).replace(/\.tsx?$/, "");
    const pattern = new RegExp(`[/"']${base}["']`);
    return !all.some((other) => other !== file && pattern.test(read(other)));
  });
  assert.deepEqual(orphans, [], `unused modules: ${orphans.join(", ")}`);
});

test("failed SmartESS mapping reports what was actually received", () => {
  const sync = read("src/lib/smartess-sync.ts");
  assert.match(sync, /function describeAvailable/);
  assert.match(sync, /القيم المتاحة/);
  // The parameter walk must not depend on a single hard-coded nesting path.
  assert.match(read("src/lib/dessmonitor.ts"), /const visit = \(node: unknown, depth: number\)/);
});

test("SmartESS login is reused so the owner's phone app is not signed out repeatedly", () => {
  const sync = read("src/lib/smartess-sync.ts");
  assert.match(sync, /savePersistedAuth\(auth\)/);
  assert.match(sync, /extras\.dessAuth/);
  // A timeout is not evidence of a bad token, so it must not force a new login:
  // non-SmartESS errors return before the saved login is touched.
  const catchBlock = sync.slice(sync.indexOf("if (!(error instanceof DessError)) {"));
  assert.ok(catchBlock.indexOf('return { ok: false, reason: "transient" }') < catchBlock.indexOf("savePersistedAuth(null)"));
  // An unrecognised expiry message cannot keep a dead login for days.
  assert.match(sync, /reusedAuth && loginAge > STALE_LOGIN_MS/);
  // Wrong credentials back off instead of retrying every minute.
  assert.match(sync, /reason: "auth_backoff"/);
});

test("the reader never switches to a device other than the saved datalogger", () => {
  // With several devices on the account, falling back to "any online device"
  // could silently read another inverter. Only a single device is unambiguous.
  const lib = read("src/lib/dessmonitor.ts");
  assert.match(lib, /export function pickDevice/);
  assert.match(lib, /return devices\.length === 1 \? devices\[0\] : undefined;/);
  const sync = read("src/lib/smartess-sync.ts");
  assert.match(sync, /pickDevice\(devices, wanted\)/);
  assert.match(sync, /if \(!device\) return await fail\(describeNoDevice\(devices, wanted\)\);/);
  // A remembered device is dropped once the owner saves a different PN.
  assert.match(sync, /\(!wanted \|\| remembered\.pn === wanted\)/);
  const route = read("src/app/api/inverter/test/route.ts");
  assert.match(route, /pickDevice\(devices, wanted\)/);
  assert.match(route, /describeNoDevice\(devices, wanted\)/);
});

test("device choice follows the saved PN", { skip: !process.features?.typescript }, async () => {
  const { pickDevice } = await import("../src/lib/dessmonitor.ts");
  const a = { pn: "A1", sn: "A1094801", devcode: 2376, status: 1 };
  const b = { pn: "B2", sn: "B2094801", devcode: 2376, status: 0 };
  assert.equal(pickDevice([a, b], "A1"), a, "the saved device is kept even while it is offline");
  assert.equal(pickDevice([a, b], "C3"), undefined);
  assert.equal(pickDevice([a, b], ""), undefined);
  assert.equal(pickDevice([b], "C3"), b, "a single device is unambiguous");
  assert.equal(pickDevice([{ sn: "A1094801", devcode: 2376 }, b], "A1").sn, "A1094801");
  assert.equal(pickDevice([], "A1"), undefined);
});

test("connection test passes only on a complete, still-changing reading", () => {
  const route = read("src/app/api/inverter/test/route.ts");
  assert.match(route, /if \(await isFrozen\(reading\)\.catch\(\(\) => false\)\) return await notLive\("telemetry_frozen", FROZEN_REASON\);/);
  assert.match(route, /if \(!stored\.ok && !storeCrashed\) return await notLive\("telemetry_incomplete", stored\.reason\);/);
  // The frozen check comes before the reading is stored.
  assert.ok(route.indexOf('notLive("telemetry_frozen"') < route.indexOf("await storeReading(reading, device)"));
});


test("device discovery falls back beyond the energy-storage listing", () => {
  // A device of type "Other" is missing from webQueryDeviceEs (ERR_NOT_FOUND_DEVICE)
  // while it is online; discovery must try the datalogger-based listings too.
  const lib = read("src/lib/dessmonitor.ts");
  assert.match(lib, /export async function discoverDevices/);
  assert.match(lib, /listCollectors\(auth, baseUrl, timeoutMs\)/);
  assert.match(lib, /"queryDeviceLastData", "webQueryDeviceEnergyFlowEs"/);
  assert.match(read("src/app/api/inverter/test/route.ts"), /discovery\.attempts\.join/);
});

test("a device SN is split into PN, devcode and devaddr", async () => {
  // SN Q0045395318912094801 = PN Q0045395318912 + devcode 0x0948 (2376) + devaddr 0x01.
  const lib = read("src/lib/dessmonitor.ts");
  assert.match(lib, /export function deviceFromSn/);
  assert.match(lib, /parseInt\(rest\.slice\(0, 4\), 16\)/);
  assert.match(lib, /candidate\.pn \+ "094801"/);
});

test("background sync reuses the remembered device and survives a slow SmartESS", () => {
  // Discovery took up to seven calls and timed out, flipping the badge to
  // "not connected" right after a successful test.
  const sync = read("src/lib/smartess-sync.ts");
  assert.match(sync, /extras\.dessDevice as DessDevice/);
  assert.match(sync, /if \(!\(error instanceof DessError\)\) \{/);
  assert.match(sync, /lastStatus: "connected", lastSeenAt: new Date\(\)/);
  assert.match(read("src/app/api/inverter/test/route.ts"), /dessDevice: target/);
  assert.match(read("src/app/api/inverter/connection/route.ts"), /merged\.dessDevice = stored\.dessDevice/);
});

test("kilowatt readings are scaled to watts", () => {
  // Battery power arrived as -0.547 kW and was shown as 0.547 W / idle.
  assert.match(read("src/lib/dessmonitor.ts"), /expectedUnit === "W" && \/\^\\s\*kw\\b\/i\.test\(unit\) \? numeric \* 1000/);
});

test("a read that only timed out is transient, not a broken connection", () => {
  const lib = read("src/lib/dessmonitor.ts");
  assert.match(lib, /if \(networkError && failures\.every\(\(entry\) => !\/:ERR_\/\.test\(entry\)\)\) throw networkError;/);
});

test("a sync cut off by the platform cannot block every later sync", () => {
  const sync = read("src/lib/smartess-sync.ts");
  assert.match(sync, /if \(inFlight && now - inFlightSince < RUN_BUDGET_MS \+ 15_000\) return inFlight;/);
  assert.match(sync, /Promise\.race\(\[run\(now \+ RUN_BUDGET_MS\), budget\]\)/);
  // A run resumed after its deadline must not store a stale reading.
  assert.match(sync, /if \(Date\.now\(\) > deadline\) return/);
  assert.match(sync, /dessDevice: target \};/);
});

test("QA fixes: today totals, finance split, blank values, gateway token", () => {
  const telemetry = read("src/app/api/telemetry/route.ts");
  assert.match(telemetry, /todayProductionKWh: today \?/);
  // Each kWh of house use is counted once: grid, then battery, rest solar.
  const finance = read("src/app/api/finance/route.ts");
  assert.match(finance, /const gridKWh = Math\.min\(home, Math\.max\(0, totals\.gridImportKWh\)\)/);
  assert.match(finance, /const directSolarKWh = Math\.max\(0, home - gridKWh - batteryKWh\)/);
  assert.match(read("src/lib/dessmonitor.ts"), /if \(!\/\\d\/\.test\(cleaned\)\) return undefined;/);
  assert.match(read("src/lib/telemetry-store.ts"), /if \(hours <= 0 \|\| hours > 0\.25\) return;/);
  assert.match(read("src/app/api/inverter/connection/route.ts"), /gatewayTokenHash: null, gatewayTokenCipher: null/);
  assert.match(read("src/app/api/inverter/test/route.ts"), /fetchPublicEndpoint\(/);
});

test("frozen SmartESS values are not stored as new readings", () => {
  // An offline dongle makes SmartESS repeat its last values; storing them
  // every minute inflated today's totals and hid the outage.
  const sync = read("src/lib/smartess-sync.ts");
  assert.match(sync, /async function isFrozen\(reading: DessReading\)/);
  assert.match(sync, /if \(await isFrozen\(reading\)\) \{/);
  assert.match(sync, /lastSeenOffline \|\| Date\.now\(\) - lastStatusCheckAt > STATUS_CHECK_MS/);
});

test("an offline dongle is re-checked on every sync until it is back online", () => {
  // After an Offline answer, the next runs stored SmartESS's stale values
  // (battery 0%) for up to 10 minutes because the status check was skipped.
  const sync = read("src/lib/smartess-sync.ts");
  assert.match(sync, /let lastSeenOffline = false;/);
  assert.match(sync, /if \(collector\) lastSeenOffline = Number\(collector\.status\) === 1;/);
});

test("today's forecast simulates only the hours still ahead, with the saved reserve", () => {
  const hook = read("src/hooks/use-smart-energy.ts");
  assert.match(hook, /const simulated = dayIndex === 0 \? points\.filter\(\(point\) => point\.time >= nowKey\) : points;/);
  assert.match(hook, /for \(const point of simulated\)/);
  assert.match(hook, /batteryCapacityWh \* site\.reservePct \/ 100/);
  assert.doesNotMatch(hook, /SAFETY_RESERVE \/ 100/);
});

test("house history endpoint requires a session and the page uses it", () => {
  const route = read("src/app/api/telemetry/history/route.ts");
  assert.match(route, /verifySessionToken\(request\.cookies\.get\(COOKIE_NAME\)\?\.value\)/);
  assert.match(route, /status: 401/);
  assert.match(read("src/app/home/page.tsx"), /fetch\("\/api\/telemetry\/history"/);
});

test("inverter status fields are mapped, stored and shown", () => {
  const lib = read("src/lib/dessmonitor.ts");
  assert.match(lib, /reading\.inverterTemperature = Math\.max\(\.\.\.temps\)/);
  assert.match(read("src/lib/telemetry-store.ts"), /operatingMode: input\.operating_mode/);
  assert.match(read("prisma/migrations/20261001010000_inverter_status_fields/migration.sql"), /ADD COLUMN IF NOT EXISTS "inverterTemperature"/);
  assert.match(read("src/components/solar-dashboard-client.tsx"), /حالة الإنفرتر/);
});

test("cron sync endpoint requires CRON_SECRET and compares in constant time", () => {
  const src = fs.readFileSync(new URL("../src/app/api/telemetry/sync/route.ts", import.meta.url), "utf8");
  assert.match(src, /process\.env\.CRON_SECRET/);
  assert.match(src, /timingSafeEqual/);
  assert.match(src, /status: 401/);
});

test("preview builds never run migrations against the shared database", () => {
  const source = read("scripts/prisma-deploy.mjs");
  assert.match(source, /VERCEL_ENV\s*&&\s*process\.env\.VERCEL_ENV\s*!==\s*"production"/);
  assert.ok(source.indexOf("VERCEL_ENV") < source.indexOf('["migrate", "deploy"]'));
});

test("gateway refuses to start or serve without GATEWAY_TOKEN", () => {
  const source = read("gateway/gateway.py");
  assert.match(source, /if not is_strong_secret\(TOKEN\):\s*\n\s*raise SystemExit/);
  assert.match(source, /if API_URL and not is_strong_secret\(TELEMETRY_TOKEN\):/);
  assert.match(read("gateway/.env.example"), /GATEWAY_HOST=127\.0\.0\.1/);
  assert.match(source, /if not TOKEN or self\.headers\.get\("Authorization"\)/);
});

test("session signing uses AUTH_SECRET only, never the password", () => {
  const session = read("src/lib/auth-session.ts");
  const config = read("src/lib/auth-config.ts");
  assert.doesNotMatch(session, /AUTH_SECRET\s*\|\|\s*process\.env\.SOLAR_PASSWORD/);
  assert.match(config, /const secret = process\.env\.AUTH_SECRET \|\| process\.env\.SOLAR_AUTH_SECRET \|\| "";/);
  assert.doesNotMatch(session, /SOLAR_AUTH_PASSWORD/);
});

test("settings page cannot save placeholder defaults before real settings load", () => {
  const source = read("src/app/settings/page.tsx");
  assert.match(source, /if \(!settingsLoaded\)/);
  assert.match(source, /disabled=\{saving \|\| !settingsLoaded\}/);
  assert.match(source, /currency: "USD"/);
  assert.match(source, /lowDcCutoffVoltage: 44\.0, backToGridVoltage: 52\.0/);
});

test("browser cross-site requests cannot change state or redirect off-site after login", () => {
  const middleware = read("src/middleware.ts");
  assert.match(middleware, /isCrossSiteRequest\(request\)/);
  assert.match(read("src/app/api/auth/logout/route.ts"), /isCrossSiteRequest\(request\)/);
  const redirect = read("src/lib/safe-redirect.ts");
  assert.match(redirect, /url\.origin !== base/);
  assert.match(read("src/components/login-form.tsx"), /safeNextPath\(/);
  assert.match(read("src/app/api/auth/login/route.ts"), /safeNextPath\(input\.next\)/);
});

test("energy ingestion is serialised and does not cancel charge against discharge", () => {
  const store = read("src/lib/telemetry-store.ts");
  assert.match(store, /pg_advisory_xact_lock/);
  assert.match(store, /const batteryChargeKWh = pos\(/);
  assert.match(store, /const batteryDischargeKWh = neg\(/);
  assert.match(store, /export function effectiveGridW/);
});

test("polling pauses while the app is hidden", () => {
  for (const file of ["src/components/status-bar.tsx", "src/components/solar-dashboard-client.tsx", "src/app/home/page.tsx", "src/app/battery/page.tsx", "src/hooks/use-smart-energy.ts"]) {
    assert.match(read(file), /startVisiblePolling\(/, file);
    assert.doesNotMatch(read(file), /window\.setInterval\(/, file);
  }
});

test("forecast day card shows the battery at sunrise/sunset and the full-charge time", () => {
  const source = read("src/components/smart-forecast.tsx");
  assert.match(source, /selected\.chargeAtSunsetPct/);
  assert.match(source, /selected\.fullChargeTime/);
});

test("panel power uses the largest PV figure (Mains mode reports it only as PV Charge Power)", () => {
  const source = read("src/lib/dessmonitor.ts");
  assert.match(source, /pvMax = Math\.max\(pvMax \?\? 0, watts\)/);
  assert.match(source, /reading\.solarPowerW = Math\.max\(reading\.solarPowerW \?\? 0, pvMax\)/);
});

test("forecast uses Open-Meteo radiation for the hour it actually covers (value at the hour's end)", () => {
  const source = read("src/hooks/use-smart-energy.ts");
  assert.match(source, /const j = i \+ 1;/);
  assert.match(source, /shortwave_radiation\?\.\[j\]/);
});

test("details onToggle reads the open state before the state updater runs", () => {
  const source = read("src/app/money/page.tsx");
  assert.doesNotMatch(source, /setPrefsOpen\(\(v\) => \(\{ \.\.\.v, \w+: e\.currentTarget\.open/);
  assert.match(source, /const open = e\.currentTarget\.open;/);
});

// Type-stripping Node (22.18+) can load the pure solar helpers directly; CI on
// Node 20 skips these and relies on the source checks below.
const canLoadTs = Boolean(process.features?.typescript);

test("telemetry rejects timestamps too far in the future", { skip: !canLoadTs }, async () => {
  const { telemetryInputSchema } = await import("../src/lib/telemetry.ts");
  const reading = { pv_power: 0, load_power: 0, battery_soc: 50, battery_power: 0 };
  assert.equal(telemetryInputSchema.safeParse({ ...reading, timestamp: new Date().toISOString() }).success, true);
  assert.equal(telemetryInputSchema.safeParse({ ...reading, timestamp: new Date(Date.now() + 60_000).toISOString() }).success, false);
});

test("sun times for Saida match the weather service within a few minutes", { skip: !canLoadTs }, async () => {
  const { sunTimes } = await import("../src/lib/solar-core.ts");
  const { sunrise, sunset } = sunTimes(new Date("2026-10-02T17:30:00Z"), 33.5911, 35.4061);
  // Open-Meteo: sunrise 06:32, sunset 18:21 Beirut (UTC+3) on 2 Oct 2026.
  assert.ok(Math.abs(sunrise.getTime() - Date.parse("2026-10-02T03:32:00Z")) < 5 * 60_000, sunrise.toISOString());
  assert.ok(Math.abs(sunset.getTime() - Date.parse("2026-10-02T15:21:00Z")) < 5 * 60_000, sunset.toISOString());
});

test("panel calibration ignores throttled hours and waits for enough data", { skip: !canLoadTs }, async () => {
  const { calibrationFactor } = await import("../src/lib/solar-core.ts");
  const expected = new Map();
  const rows = [];
  for (const day of ["2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]) {
    for (const h of [10, 11]) {
      const hour = `${day}T${String(h).padStart(2, "0")}:00`;
      expected.set(hour, 1.0);
      rows.push({ hour, pvW: 800, socMax: 70, batteryW: 900, samples: 12 });
    }
  }
  // A full battery and a charge-limited hour both under-report the panels.
  rows[0] = { ...rows[0], pvW: 200, socMax: 100 };
  rows[1] = { ...rows[1], pvW: 300, batteryW: 2600 };
  const result = calibrationFactor(rows, expected, "2026-10-02T20:00");
  assert.equal(result.status, "calibrated");
  assert.equal(result.factor, 0.8);
  assert.equal(result.hours, 10);
  // Two days are not enough, however many hours they have.
  const early = calibrationFactor(rows.slice(0, 4), expected, "2026-10-02T20:00");
  assert.equal(early.status, "learning");
  assert.equal(early.factor, 1);
  // Tapering battery (90%+) throttles the panels too.
  const tapering = calibrationFactor(rows.map((row) => ({ ...row, socMax: 93 })), expected, "2026-10-02T20:00");
  assert.equal(tapering.hours, 0);
  // Far below any healthy array: reported, never applied.
  const weak = calibrationFactor(rows.map((row) => ({ ...row, pvW: 450 })), expected, "2026-10-02T20:00");
  assert.equal(weak.status, "suspect");
  assert.equal(weak.factor, 1);
  assert.equal(weak.ratio, 0.45);
  // Zero PV in good light is a missing reading, not a weak panel.
  const missing = calibrationFactor([...rows, { hour: "2026-10-02T12:00", pvW: 0, socMax: 30, batteryW: 0, samples: 20 }], new Map([...expected, ["2026-10-02T12:00", 1.9]]), "2026-10-02T20:00");
  assert.equal(missing.factor, 0.8);
});

test("forecast applies the learned calibration and the night check never breaks the sync", () => {
  const hook = read("src/hooks/use-smart-energy.ts");
  assert.match(hook, /estimateSolarKWh\(irradiance, panelCapacityKw, airTempC\) \* solarFactor/);
  assert.match(hook, /status === "calibrated"/);
  const sync = read("src/app/api/telemetry/sync/route.ts");
  assert.match(sync, /const result = await syncSmartEss\(\);\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*await runNightCheck\(\)\.catch\(/);
  const night = read("src/lib/night-check.ts");
  assert.match(night, /action: ACTION, timestamp: \{ gte: sunset \}/);
  assert.match(night, /console\.info\(`\[night\] check verdict=/);
});

test("device list never stores the IP address and requires a session", () => {
  const lib = read("src/lib/devices.ts");
  assert.doesNotMatch(lib, /x-forwarded-for|x-real-ip/);
  assert.match(lib, /httpOnly: true/);
  const route = read("src/app/api/devices/route.ts");
  assert.match(route, /verifySessionToken\(/);
  assert.match(route, /if \(!isOwner\(session\.username\)\).*403/s);
  assert.match(read("src/lib/owner.ts"), /SOLAR_OWNER_USER/);
  assert.match(read("src/app/settings/page.tsx"), /\{isOwnerSession && <SettingsSection icon=\{Smartphone\}/);
  assert.match(route, /if \(!session\).*401/s);
  const login = read("src/app/api/auth/login/route.ts");
  assert.match(login, /details: deviceDetails\(device\)/);
});

test("changing or erasing data requires the owner once an owner account exists", () => {
  const owner = read("src/lib/owner.ts");
  assert.match(owner, /export function canManage\(/);
  // Without an owner account the shared account still manages the app.
  assert.match(owner, /if \(!owner \|\| !process\.env\.SOLAR_OWNER_PASSWORD\) return Boolean\(username\);/);
  const guard = /if \(!canManage\(session\.username\)\).*403/s;
  const wipe = read("src/app/api/settings/export/route.ts");
  assert.match(wipe.slice(wipe.indexOf("export async function DELETE")), guard);
  const connection = read("src/app/api/inverter/connection/route.ts");
  const post = connection.slice(connection.indexOf("export async function POST"));
  assert.match(post, guard);
  assert.ok(post.search(guard) < post.indexOf("rotateGatewayToken"), "the owner check must run before any action");
  const settings = read("src/app/api/settings/route.ts");
  assert.match(settings.slice(settings.indexOf("export async function PUT")), guard);
});

test("failed sign-ins are limited in the database and never store the IP address", () => {
  const throttle = read("src/lib/login-throttle.ts");
  assert.match(throttle, /prisma\.monitoringEvent\.count\(/);
  assert.match(throttle, /createHmac\("sha256"/);
  assert.doesNotMatch(throttle, /MAX_ATTEMPTS_ALL_CLIENTS|count\(\{ where \}\)/);
  const login = read("src/app/api/auth/login/route.ts");
  // Checked before the password is compared, and the failure carries the tag.
  assert.ok(login.indexOf("await tooManyFailedLogins(tag)") < login.indexOf("const ownerLogin"));
  assert.match(login, /clientDetail\(tag\)/);
  assert.doesNotMatch(login, /details:[^\n]*\bkey\b/);
});

test("sessions stop working when the password or the session epoch changes", () => {
  const session = read("src/lib/auth-session.ts");
  assert.match(session, /async function credentialVersion\(/);
  assert.match(session, /SOLAR_SESSION_EPOCH/);
  assert.match(session, /typeof payload\.v!=="string"\|\|!\(await safeEqual\(payload\.v,current\)\)\) return null;/);
});

test("the sync patches stored SmartESS extras instead of writing back its old copy", () => {
  const patch = read("src/lib/connection-extras.ts");
  assert.match(patch, /FOR UPDATE/);
  assert.match(patch, /stored\.cloudUsername !== used\.username \|\| stored\.cloudPassword !== used\.password\) return false;/);
  // No whole-blob write is left in the sync or in the connection test.
  for (const file of ["src/lib/smartess-sync.ts", "src/app/api/inverter/test/route.ts"]) {
    const source = read(file);
    assert.match(source, /patchConnectionExtras\(row\.id, \{ username, password \}/);
    assert.doesNotMatch(source, /encryptSecret\(/);
  }
});

test("event log is pruned and the CSV export is read in batches", () => {
  assert.match(read("src/lib/monitoring.ts"), /export async function pruneMonitoringEvents\(/);
  assert.match(read("src/lib/telemetry-store.ts"), /if \(hourChanged\) await pruneMonitoringEvents\(\)/);
  const exportRoute = read("src/app/api/settings/export/route.ts");
  assert.match(exportRoute, /take: EXPORT_BATCH/);
  assert.match(exportRoute, /new ReadableStream<Uint8Array>/);
  assert.doesNotMatch(exportRoute, /telemetryLog\.findMany\(\{ orderBy: \{ timestamp: "asc" \} \}\)/);
});

test("the summary uses the site's time zone, not the server's", () => {
  const summary = read("src/app/api/telemetry/summary/route.ts");
  assert.match(summary, /const start = localDayStart\(new Date\(\), timezone\);/);
  assert.doesNotMatch(summary, /getUTCFullYear/);
});

test("routes and helpers nothing calls stay removed", () => {
  // They computed the forecast with an older formula (fixed 0.82, no hour
  // shift, no calibration), so any caller would have shown different numbers.
  for (const gone of ["src/app/api/predictions", "src/app/api/forecast/solar", "src/app/api/weather", "src/app/api/analytics", "src/app/api/energy", "src/lib/forecast.ts", "src/lib/predictive.ts", "src/lib/predictions.ts"]) {
    assert.equal(fs.existsSync(path.join(root, gone)), false, gone);
  }
});

test("middleware lives in src/ (next to app/) so Next.js actually runs it", () => {
  // At the repository root it was silently ignored: every page and the
  // routes without their own session check were public in production.
  assert.equal(fs.existsSync(path.join(root, "middleware.ts")), false);
  const middleware = read("src/middleware.ts");
  assert.match(middleware, /pathname\.startsWith\("\/api\/"\)\) \{\s*\n\s*return NextResponse\.json\(\{ error: "unauthorized" \}, \{ status: 401/);
});

test("Solar reads its own sign-in variables and adopts the SmartESS account from the environment", () => {
  const config = read("src/lib/auth-config.ts");
  assert.ok(config.includes("process.env.SOLAR_AUTH_USERNAME"));
  assert.ok(config.includes("process.env.SOLAR_AUTH_PASSWORD"));
  const env = read("src/lib/smartess-env.ts");
  assert.ok(env.includes("process.env.SMARTESS_USERNAME"));
  // An account saved from the settings page is never overwritten.
  assert.ok(env.includes("if (extras.cloudUsername || extras.cloudPassword) return row;"));
  assert.ok(read("src/lib/smartess-sync.ts").includes("adoptEnvCloudAccount(found)"));
  assert.ok(read("src/app/api/inverter/connection/route.ts").includes("data: defaultConnectionData()"));
});

test("energy accounting: one grid figure everywhere, grid-first split, signed savings", () => {
  // Savings are (house use - grid purchases) x tariff; clamping each interval
  // at zero counted grid energy stored in the battery as saved.
  const store = read("src/lib/telemetry-store.ts");
  assert.ok(store.includes("const avoidedGridKWh = homeKWh - gridImportKWh;"));
  // The live reading and the daily totals use the same grid power.
  for (const route of ["src/app/api/telemetry/route.ts"]) {
    assert.ok(read(route).includes("effectiveGridW("), route);
    assert.ok(!read(route).includes("gridPowerW ?? 0"), route);
  }
  // The summary splits house use like the money page: grid, battery, then sun.
  const summary = read("src/app/api/telemetry/summary/route.ts");
  assert.ok(summary.includes("const gridToHome = Math.min(home, Math.max(0, totals.gridImportKWh));"));
  assert.ok(!summary.includes("Math.min(totals.homeKWh, totals.solarKWh)"));
});

test("hourly readings are grouped by instant, so the column type cannot shift the local hour", () => {
  // Converting the zone in SQL moved every hour by the zone's offset when the
  // column was "timestamp with time zone": night load was averaged over the
  // morning and panel output compared with the wrong hour's sunshine.
  const source = read("src/lib/solar-calibration.ts");
  assert.doesNotMatch(source, /AT TIME ZONE/);
  assert.match(source, /floor\(extract\(epoch FROM "timestamp"\) \/ 3600\)/);
  assert.match(source, /hour: hourKey\(new Date\(row\.bucket \* 3_600_000\), timeZone\)/);
  // Forecast and calibration must use the same temperature term.
  assert.match(source, /estimateSolarKWh\(irradiance, panelKw, airTempC\)/);
});

test("panel output falls with heat and site times ignore the viewer's zone", { skip: !canLoadTs }, async () => {
  const { estimateSolarKWh, panelHeatFactor, siteClock, siteInstant } = await import("../src/lib/smart-forecast.ts");
  // Full sun: cells run ~31 °C above the air, and lose 0.4% per degree over 25 °C.
  assert.equal(Math.round(panelHeatFactor(1000, 35) * 1000) / 1000, 0.835);
  assert.ok(panelHeatFactor(1000, 5) > panelHeatFactor(1000, 35));
  assert.equal(panelHeatFactor(1000, 60), 0.75);
  assert.equal(panelHeatFactor(600, undefined), 0.93);
  // 6 kW in full sun at 20 °C air: 6 x 0.84 x 0.895.
  assert.equal(Math.round(estimateSolarKWh(1000, 6, 20) * 100) / 100, 4.51);
  assert.equal(estimateSolarKWh(-5, 6, 20), 0);
  // 06:36 on the site's clock (UTC+3) is 03:36 UTC wherever the page is opened.
  assert.equal(new Date(siteInstant("2026-10-07T06:36", 10800)).toISOString(), "2026-10-07T03:36:00.000Z");
  assert.match(siteClock("2026-10-07T06:36"), /^06:36/);
  assert.match(siteClock("2026-10-07T16:00", 1), /^05:00/);
  assert.equal(siteClock(null), "—");
  const card = read("src/components/smart-forecast.tsx");
  assert.doesNotMatch(card, /new Date\(selected\.sun(rise|set)\)/);
  assert.doesNotMatch(read("src/components/surplus-recommendations.tsx"), /timeZone: "Asia\/Beirut"/);
});

test("the money page prices unrounded energy", () => {
  const finance = read("src/app/api/finance/route.ts");
  assert.doesNotMatch(finance, /solarKWh: Math\.round\(directSolarKWh \* 10\) \/ 10/);
  assert.match(finance, /solarKWh: directSolarKWh,/);
});

test("battery amps ignore a stale 0 A and use the bank's own voltage", { skip: !canLoadTs }, async () => {
  const { batteryAmps } = await import("../src/lib/energy.ts");
  assert.equal(batteryAmps({ batteryCurrent: 31, batteryVoltage: 53, batteryPowerW: 1600 }), 31);
  assert.ok(Math.abs(batteryAmps({ batteryCurrent: 0, batteryVoltage: 53, batteryPowerW: 1590 }) - 30) < 0.01);
  assert.ok(Math.abs(batteryAmps({ batteryPowerW: 1280 }, 24) - 50) < 0.01);
  assert.equal(batteryAmps({ batteryCurrent: 0, batteryPowerW: 10 }), 0);
});

test("today's saving on the home screen uses the same signed rule as the money page", () => {
  const route = read("src/app/api/telemetry/route.ts");
  assert.ok(route.includes("(today.homeKWh - today.gridImportKWh) * (settings?.gridTariff ?? 0)"));
  assert.ok(!route.includes("Math.max(0, today.homeKWh - today.gridImportKWh)"));
});

test("off-grid, the grid icon stays idle like its label", () => {
  const flow = read("src/components/energy-flow.tsx");
  assert.ok(flow.includes("<GridTowerIcon active={gridConnected === true && !inverterOffGrid} />"));
});
