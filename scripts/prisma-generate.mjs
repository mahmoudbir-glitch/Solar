import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const databaseUrl =
  process.env.DATABASE_URL ||
  process.env.PRISMA_DATABASE_URL ||
  process.env.POSTGRES_URL ||
  "postgresql://placeholder:placeholder@127.0.0.1:5432/solar?schema=public";

const prismaCli = resolve("node_modules/prisma/build/index.js");
const result = spawnSync(process.execPath, [prismaCli, "generate"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: databaseUrl },
});

if (result.error) {
  console.error(`Failed to start Prisma Client generation: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
