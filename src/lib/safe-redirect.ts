/**
 * Returns `next` only when it is a same-site path ("/battery?x=1"); anything
 * that could leave the site ("//evil.com", "/\evil.com", "https://…", control
 * characters) falls back to "/". Shared by the login form and login API.
 */
export function safeNextPath(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//")) return "/";
  // Browsers treat "\" like "/" and ignore tabs/newlines inside URLs.
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return "/";
  try {
    const base = "https://solar.invalid";
    const url = new URL(next, base);
    if (url.origin !== base) return "/";
    return `${url.pathname}${url.search}${url.hash}` || "/";
  } catch {
    return "/";
  }
}
