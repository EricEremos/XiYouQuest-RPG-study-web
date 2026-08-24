import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";

// Public paths that must be reachable without a session. `/api/auth/*` covers
// the Better Auth handler (sign-in, OAuth callback, JWKS, token) and MUST stay
// public so the OIDC flow and third-party JWKS fetch work.
const PUBLIC_PAGE_PATHS = ["/login"];

function isPublic(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname.startsWith("/api/auth/")) return true;
  return PUBLIC_PAGE_PATHS.some((p) => pathname.startsWith(p));
}

/**
 * Content Security Policy. In production, scripts are allowed only via a
 * per-request nonce plus 'strict-dynamic' (no unsafe-inline / unsafe-eval);
 * Next.js reads the nonce from the request's Content-Security-Policy header
 * and stamps it onto every inline script it renders. Dev builds need
 * unsafe-eval and non-nonced inline scripts for Fast Refresh, so the strict
 * policy is production-only.
 *
 * CAUTION: nonces only reach dynamically rendered pages. Every page today is
 * dynamic (auth gating; /login is force-dynamic; not-found reads headers()).
 * If a statically prerendered page is ever added, its cached inline scripts
 * will carry no nonce and this policy will block them in production; such a
 * page must opt into dynamic rendering.
 */
function buildCsp(nonce: string): string {
  const scriptSrc =
    process.env.NODE_ENV === "production"
      ? `'self' 'nonce-${nonce}' 'strict-dynamic'`
      : "'self' 'unsafe-inline' 'unsafe-eval'";
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "font-src 'self' data:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const session = await auth.api.getSession({ headers: request.headers });
  const isAuthed = Boolean(session?.user);

  if (!isAuthed && !isPublic(pathname)) {
    // API routes get a JSON 401 (each route also verifies auth itself); page
    // routes redirect to the sign-in screen.
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (isAuthed && pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  // Next.js picks the nonce up from the request's CSP header when rendering,
  // so it must be set on the forwarded request AND on the response.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // robots.txt and sitemap.xml must stay publicly crawlable; everything the
    // auth gate should cover still matches.
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|\\.well-known|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
