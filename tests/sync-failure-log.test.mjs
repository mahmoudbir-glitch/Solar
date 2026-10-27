import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("a sync run that stores nothing leaves its cause in the event log", () => {
  const sync = read("src/lib/smartess-sync.ts");
  // Written once the run has settled, whatever path ended it.
  assert.match(sync, /inFlight = attempt\.then\(async \(result\) => \{[\s\S]*?await logSyncFailure\(result\);/);
  assert.match(sync, /action: MONITORING_ACTIONS\.SYNC_FAILED,\s*success: false,/);
  // Skips such as "throttled" and "recent_sample_exists" carry no category and are not faults.
  assert.match(sync, /if \(!category \|\| !shouldLogSyncFailure\(loggedFailureAt, category, Date\.now\(\)\)\) return;/);
  // A slow or down database must not hold up the sync's own answer.
  assert.match(sync, /Promise\.race\(\[\s*recordMonitoringEvent\([\s\S]*?setTimeout\(resolve, 3_000\)/);
  assert.match(sync, /\.catch\(\(\) => \{\}\);\s*\}/);
});

test("every failure path in the sync names its cause", () => {
  const sync = read("src/lib/smartess-sync.ts");
  const calls = sync.split("\n").filter((line) => /await fail\(/.test(line));
  assert.ok(calls.length >= 5, "the failure paths are still routed through fail()");
  for (const line of calls) assert.match(line, /, "[a-z_]+"\);\s*$/, `missing category: ${line.trim()}`);
  for (const reason of ["no_wifi_datalogger_connection", "cloud_credentials_missing", "auth_backoff"]) {
    assert.match(sync, new RegExp(`reason: "${reason}", category: "`), `${reason} must carry a category`);
  }
  assert.match(sync, /category: "run_budget_exceeded"/);
  assert.match(sync, /category: "sync_crashed"/);
  // A database outage is told apart from a SmartESS timeout, without changing the transient result.
  assert.match(sync, /lastTransientWasDatabase = isDatabaseError\(error\);\s*return \{ ok: false, reason: "transient" \};/);
});

test("failure events are throttled per cause and pruned", () => {
  const health = read("src/lib/sync-health.ts");
  assert.match(health, /SYNC_FAILURE_LOG_INTERVAL_MS = 30 \* 60_000/);
  assert.match(health, /if \(last !== undefined && now - last < SYNC_FAILURE_LOG_INTERVAL_MS\) return false;/);
  // Pure module: nothing imported, so it cannot pull the database into a unit.
  assert.doesNotMatch(health, /^import /m);
  const monitoring = read("src/lib/monitoring.ts");
  assert.match(monitoring, /SYNC_FAILED: "SYNC_FAILED"/);
  assert.match(monitoring, /action: MONITORING_ACTIONS\.SYNC_FAILED, timestamp: \{ lt: new Date\(now - SYNC_FAILED_DAYS \* 86_400_000\) \}/);
  assert.match(read("src/app/admin/monitor/page.tsx"), /SYNC_FAILED: "فشل المزامنة"/);
});

test("the cron endpoint still answers with the reason only", () => {
  const route = read("src/app/api/telemetry/sync/route.ts");
  assert.match(route, /: \{ ok: false, skipped: Boolean\(result\.skipped\), reason: result\.reason\.slice\(0, 80\) \}/);
});
