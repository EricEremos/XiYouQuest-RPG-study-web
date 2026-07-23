import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const { headers, response } = await auth.api.signInWithOAuth2({
      returnHeaders: true,
      headers: request.headers,
      body: {
        providerId: "hkust",
        callbackURL: "/dashboard",
      },
    });

    if (!response.url) {
      return NextResponse.redirect(
        new URL("/login?error=sso_unavailable", request.url),
      );
    }

    const redirect = NextResponse.redirect(response.url);
    for (const cookie of headers.getSetCookie()) {
      redirect.headers.append("set-cookie", cookie);
    }
    return redirect;
  } catch (error) {
    console.error("[auth] failed to start HKUST OAuth", error);
    return NextResponse.redirect(
      new URL("/login?error=sso_unavailable", request.url),
    );
  }
}
