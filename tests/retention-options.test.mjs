import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("history can be kept for 60 days, offered on the page and accepted by the API", () => {
  assert.match(read("src/app/api/settings/route.ts"), /retentionDays: z\.union\(\[z\.literal\(30\), z\.literal\(60\), z\.literal\(90\)/);
  assert.match(read("src/app/settings/page.tsx"), /<option value=\{60\}>60 يوماً<\/option>/);
});
