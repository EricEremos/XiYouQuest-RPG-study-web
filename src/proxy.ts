import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

import { createContentSecurityPolicy } from "@/lib/security-headers";

// Public paths that must be reachable without a session. `/api/auth/*` covers
// the Better Auth handler (sign-in, OAuth callback, JWKS, token) and MUST stay
// public so the OIDC flow and third-party JWKS fetch work.
const PUBLIC_PAGE_PATHS = ["/login", "/auth/hkust", "/robots.txt"];

function isPublic(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname.startsWith("/api/auth/")) return true;
  return PUBLIC_PAGE_PATHS.includes(pathname);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const nonce = Buffer.from(
    crypto.getRandomValues(new Uint8Array(16)),
  ).toString("base64");
  const contentSecurityPolicy = createContentSecurityPolicy(
    nonce,
    process.env.NODE_ENV === "development",
  );
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  function secure(response: NextResponse) {
    response.headers.set("Content-Security-Policy", contentSecurityPolicy);
    return response;
  }

  const hasSessionCookie = Boolean(getSessionCookie(request));

  if (!hasSessionCookie && !isPublic(pathname)) {
    // API routes get a JSON 401 (each route also verifies auth itself); page
    // routes redirect to the sign-in screen.
    if (pathname.startsWith("/api")) {
      return secure(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return secure(NextResponse.redirect(url));
  }

  return secure(
    NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    }),
  );
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
