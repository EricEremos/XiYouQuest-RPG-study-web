import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const getSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession,
    },
  },
}));

import { proxy } from "./proxy";

describe("proxy", () => {
  it("serves the public login page without a database-backed session lookup", async () => {
    const response = await proxy(
      new NextRequest("https://cle-xyq.hkust.edu.hk/login"),
    );

    expect(response.status).toBe(200);
    expect(getSession).not.toHaveBeenCalled();
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
