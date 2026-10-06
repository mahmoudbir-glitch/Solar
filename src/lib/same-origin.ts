type HeaderSource = { headers: { get(name: string): string | null } };

/**
 * True when a browser says this request came from another site. Used to
 * refuse cross-site state changes (CSRF). Requests without these headers
 * (server-to-server, the gateway, cron) are not browser cross-site requests.
 */
export function isCrossSiteRequest(request: HeaderSource): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return true;
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (origin && origin !== "null" && host) {
    try {
      return new URL(origin).host !== host;
    } catch {
      return true;
    }
  }
  return origin === "null";
}
