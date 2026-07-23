import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "./proxy";

describe("proxy", () => {
  it("serves the public login page with security headers", async () => {
    const response = await proxy(
      new NextRequest("https://cle-xyq.hkust.edu.hk/login"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).not.toContain(
      "script-src 'self' 'unsafe-inline'",
    );
  });

  it("optimistically redirects a protected page when no session cookie exists", async () => {
    const response = await proxy(
      new NextRequest("https://cle-xyq.hkust.edu.hk/dashboard"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://cle-xyq.hkust.edu.hk/login",
    );
  });

  it("forwards a protected page when a Better Auth session cookie is present", async () => {
    const response = await proxy(
      new NextRequest("https://cle-xyq.hkust.edu.hk/dashboard", {
        headers: {
          cookie: "better-auth.session_token=test-session",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("content-security-policy")).toBeTruthy();
  });

  it("returns JSON 401 for protected API requests without a session cookie", async () => {
    const response = await proxy(
      new NextRequest("https://cle-xyq.hkust.edu.hk/api/social/friends"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("does not make lookalike login paths public", async () => {
    const response = await proxy(
      new NextRequest("https://cle-xyq.hkust.edu.hk/login-bypass"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://cle-xyq.hkust.edu.hk/login",
    );
  });
});
