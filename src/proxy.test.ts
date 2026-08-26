import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getSessionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: getSessionMock,
    },
  },
}));

import { proxy } from "./proxy";

function request(pathname: string): NextRequest {
  return new NextRequest(`https://cle-xyq.hkust.edu.hk${pathname}`);
}

describe("proxy authentication boundary", () => {
  it("rejects an unauthenticated application API request", async () => {
    getSessionMock.mockResolvedValueOnce(null);

    const response = await proxy(request("/api/quest/progress"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("allows the unauthenticated OIDC callback path", async () => {
    getSessionMock.mockResolvedValueOnce(null);

    const response = await proxy(request("/api/auth/oauth2/callback/hkust"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
  });

  it("redirects an unauthenticated page request to login", async () => {
    getSessionMock.mockResolvedValueOnce(null);

    const response = await proxy(request("/component-5"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://cle-xyq.hkust.edu.hk/login",
    );
  });

  it("redirects an authenticated user away from login", async () => {
    getSessionMock.mockResolvedValueOnce({ user: { id: "verified-user" } });

    const response = await proxy(request("/login"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://cle-xyq.hkust.edu.hk/dashboard",
    );
  });
});
