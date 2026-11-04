import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("a dashboard poll syncs SmartESS only once readings have stopped", () => {
  const route = read("src/app/api/telemetry/route.ts");
  assert.match(route, /const DASHBOARD_SYNC_AFTER_MS = 5 \* 60_000;/);
  assert.match(route, /if \(!row \|\| Date\.now\(\) - row\.timestamp\.getTime\(\) > DASHBOARD_SYNC_AFTER_MS\) after\(\(\) => syncSmartEss\(\)\);/);
  // The only call is the guarded one: no unconditional sync on every poll.
  assert.equal(route.match(/after\(\(\) => syncSmartEss\(\)\)/g).length, 1);
});

test("SMARTESS_SYNC=off stops every SmartESS sync", () => {
  const sync = read("src/lib/smartess-sync.ts");
  assert.match(sync, /export async function syncSmartEss\(\): Promise<SyncResult> \{\s*(\/\/[^\n]*\n\s*)*if \(process\.env\.SMARTESS_SYNC\?\.trim\(\)\.toLowerCase\(\) === "off"\) return \{ ok: false, skipped: true, reason: "sync_disabled" \};/);
});
