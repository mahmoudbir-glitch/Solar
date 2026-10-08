/**
 * Supabase's shared pooler answers on one host in two modes:
 *   5432 = session mode: every app connection holds a database connection
 *          for as long as it stays open. The free plan allows only about 15,
 *          so a few serverless instances at once can hit "max clients reached".
 *   6543 = transaction mode: a database connection is only borrowed for the
 *          length of one transaction, so many instances can share it.
 *
 * Migrations need session mode, so DATABASE_URL keeps the 5432 address (the
 * build uses it as is). At runtime the app switches the same address to
 * transaction mode, which is what Supabase recommends for serverless apps.
 * pgbouncer=true tells Prisma not to keep prepared statements between queries.
 *
 * Set DATABASE_SESSION_MODE=1 to turn this off without a code change.
 */
export function runtimeDatabaseUrl(url: string | undefined, sessionMode = false): string | undefined {
  if (!url || sessionMode) return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  // An address that already says how to use the pooler is left as it is.
  if (!parsed.hostname.endsWith(".pooler.supabase.com") || parsed.searchParams.has("pgbouncer")) return url;
  if (parsed.port === "5432" || parsed.port === "") parsed.port = "6543";
  if (parsed.port !== "6543") return url;
  parsed.searchParams.set("pgbouncer", "true");
  // A few connections per instance, so one slow transaction does not make the
  // other requests on that instance wait; a longer wait before giving up.
  if (!parsed.searchParams.has("connection_limit")) parsed.searchParams.set("connection_limit", "3");
  if (!parsed.searchParams.has("pool_timeout")) parsed.searchParams.set("pool_timeout", "20");
  return parsed.toString();
}
