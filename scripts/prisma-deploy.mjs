import { spawnSync } from "node:child_process";

/**
 * Runs `prisma migrate deploy`, recovering from one specific failure mode.
 *
 * Background: 20260930140000_enable_rls_deny_public_roles shipped with
 * `CREATE POLICY ... TO anon`. `anon` and `authenticated` are Supabase roles
 * and do not exist on this project's Prisma Postgres database, so the
 * statement aborted with `role "anon" does not exist`. Prisma recorded the
 * migration as failed and from then on refused to apply anything new,
 * returning P3009 and failing every deployment.
 *
 * The migration has since been rewritten to create each policy only when its
 * role exists. But a failed entry in _prisma_migrations still blocks
 * everything until it is explicitly resolved, and that has to happen where
 * DATABASE_URL lives — here, during the build.
 *
 * Only migrations on RECOVERABLE below are ever resolved automatically. Each
 * one must be safe to re-run from a partially applied state; the RLS
 * migration is, because every statement in it is idempotent (ENABLE ROW LEVEL
 * SECURITY on an already-enabled table is a no-op, and each policy is dropped
 * before being recreated). Any other failed migration is left alone and the
 * build fails loudly, which is the correct outcome: silently rolling back an
 * unknown migration could hide real data damage.
 */
const RECOVERABLE = new Set(["20260930140000_enable_rls_deny_public_roles"]);

// Preview deployments share the production database (same DATABASE_URL), so
// a preview build must never change its schema. Only production builds (or
// local/CI builds outside Vercel) apply migrations.
if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
  console.log(`[solar] Skipping migrations on a ${process.env.VERCEL_ENV} build (database is shared with production).`);
  process.exit(0);
}

const databaseUrl =
  process.env.DATABASE_URL || process.env.PRISMA_DATABASE_URL || process.env.POSTGRES_URL;

if (!databaseUrl) {
  console.error("[solar] DATABASE_URL is not set; cannot run migrations.");
  process.exit(1);
}

const runner = process.platform === "win32" ? "npx.cmd" : "npx";
const env = { ...process.env, DATABASE_URL: databaseUrl };

function prisma(args, { capture = false } = {}) {
  return spawnSync(runner, ["prisma", ...args], {
    env,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });
}

function deploy(capture) {
  const result = prisma(["migrate", "deploy"], { capture });
  if (capture) {
    // Mirror the output so the build log still shows what Prisma reported.
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  return result;
}

const first = deploy(true);
if (first.status === 0) {
  process.exit(0);
}

const output = `${first.stdout ?? ""}${first.stderr ?? ""}`;

if (!output.includes("P3009")) {
  console.error("[solar] migrate deploy failed for a reason other than P3009.");
  process.exit(first.status ?? 1);
}

// P3009 names the failed migration: "The `<name>` migration started at ... failed"
const named = output.match(/The `([^`]+)` migration started at [^\n]*failed/);
const failed = named?.[1];

if (!failed || !RECOVERABLE.has(failed)) {
  console.error(
    `[solar] Migration '${failed ?? "unknown"}' is in a failed state and is not on the ` +
      "recoverable list. Resolve it by hand after checking what it left behind: " +
      "https://pris.ly/d/migrate-resolve",
  );
  process.exit(first.status ?? 1);
}

console.error(
  `[solar] '${failed}' is a known-failed, idempotent migration. Marking it rolled back ` +
    "and retrying once.",
);

const resolved = prisma(["migrate", "resolve", "--rolled-back", failed]);
if (resolved.status !== 0) {
  console.error(`[solar] Could not mark '${failed}' as rolled back.`);
  process.exit(resolved.status ?? 1);
}

const second = deploy(false);
process.exit(second.status ?? 1);
