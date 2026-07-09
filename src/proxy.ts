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

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
