/**
 * Why a sync run did not store a reading. Vercel's free plan keeps runtime logs
 * for only an hour, so the cause of a gap in the readings is also written to the
 * database (as a SYNC_FAILED monitoring event), where a daily check can read it.
 * This file holds the pure parts so they carry no imports.
 */
export type SyncFailureCategory =
  | "transient"
  | "run_budget_exceeded"
  | "database"
  | "frozen"
  | "offline"
  | "auth_backoff"
  | "credentials_missing"
  | "no_connection"
  | "no_device"
  | "missing_fields"
  | "smartess_error"
  | "sync_crashed";

/** One event per cause per this long (per server instance), not one per minute. */
export const SYNC_FAILURE_LOG_INTERVAL_MS = 30 * 60_000;

/** True when this cause has not been logged within the interval; remembers it if so. */
export function shouldLogSyncFailure(
  lastLoggedAt: Map<SyncFailureCategory, number>,
  category: SyncFailureCategory,
  now: number,
): boolean {
  const last = lastLoggedAt.get(category);
  if (last !== undefined && now - last < SYNC_FAILURE_LOG_INTERVAL_MS) return false;
  lastLoggedAt.set(category, now);
  return true;
}

const DATABASE_ERROR_CODES = new Set(["P1001", "P1002", "P1008", "P1017", "P2024", "P2028", "P2034"]);
const DATABASE_ERROR_TEXT = /can't reach database server|max clients reached|tenant or user not found|prepared statement|connection pool/i;

/** Prisma / pooler failures: the database is unreachable or refusing connections. */
export function isDatabaseError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof code === "string" && DATABASE_ERROR_CODES.has(code)) return true;
  return typeof message === "string" && DATABASE_ERROR_TEXT.test(message);
}
