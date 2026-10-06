import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, LOGOUT_MARKER_COOKIE, verifySessionToken } from "@/lib/auth-session";
import { isCrossSiteRequest } from "@/lib/same-origin";

const PUBLIC_PATHS = new Set(["/login"]);

function redirectToLogin(request: NextRequest) {
  const url = new URL("/login", request.url);
  url.searchParams.set("next", request.nextUrl.pathname);
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return response;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // CSRF: no other website may change anything here through the user's cookie.
  if (pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method) && isCrossSiteRequest(request)) {
    return NextResponse.json({ error: "cross_site_request" }, { status: 403 });
  }

  // The login page must always be reachable, even if Vercel environment
  // variables are temporarily missing. The API will report a clear error
  // when credentials are submitted.
  if (PUBLIC_PATHS.has(pathname)) {
    const token = request.cookies.get(COOKIE_NAME)?.value;
    const loggedOut = request.cookies.get(LOGOUT_MARKER_COOKIE)?.value === "1";
    const session = loggedOut ? null : await verifySessionToken(token);

    if (session) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    const response = NextResponse.next();
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return response;
  }

  // Every application page requires a valid signed session cookie.
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const loggedOut = request.cookies.get(LOGOUT_MARKER_COOKIE)?.value === "1";
  const session = loggedOut ? null : await verifySessionToken(token);

  if (session) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    response.headers.set("Pragma", "no-cache");
    return response;
  }

  // API callers get a status they can act on, not the login page's HTML.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  return redirectToLogin(request);
}

export const config = {
  matcher: [
    "/((?!api/auth/|api/telemetry(?:/|$)|_vercel/|_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|robots.txt).*)",
  ],
};
