import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("a 0 % battery reading at an unchanged voltage keeps the last level and raises no alert", () => {
  const store = read("src/lib/telemetry-store.ts");
  // Only an exact 0 after a real level, with both voltages known and within 1 V, is replaced.
  assert.match(store, /if \(soc !== 0 \|\| !previous \|\| previous\.batterySoc < 10\) return soc;/);
  assert.match(store, /typeof voltage !== "number" \|\| typeof previous\.batteryVoltage !== "number" \|\| voltage <= 0\) return soc;/);
  assert.match(store, /Math\.abs\(voltage - previous\.batteryVoltage\) < 1 \? previous\.batterySoc : soc/);
  // Both write paths store the corrected reading, so alerts and charts see the same value.
  assert.match(store, /tx\.telemetryLog\.create\(\{ data: withCorrectedSoc\(data, previous\) \}\)/);
  assert.match(store, /prisma\.telemetryLog\.create\(\{ data: withCorrectedSoc\(data, latest\) \}\)/);
  assert.doesNotMatch(store, /telemetryLog\.create\(\{ data \}\)/);
});
