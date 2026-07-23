import { describe, expect, it, vi } from "vitest";

const signInWithOAuth2 = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      signInWithOAuth2,
    },
  },
}));

describe("GET /auth/hkust", () => {
  it("starts HKUST OAuth without client-side JavaScript and forwards the state cookie", async () => {
    signInWithOAuth2.mockResolvedValue({
      headers: new Headers({
        "set-cookie": "better-auth.state=state-value; Path=/; HttpOnly",
      }),
      response: {
        redirect: true,
        url: "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize",
      },
    });

    const { GET } = await import("./route");
    const request = new Request("https://cle-xyq.hkust.edu.hk/auth/hkust");
    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain(
      "login.microsoftonline.com",
    );
    expect(response.headers.get("set-cookie")).toContain("better-auth.state");
    expect(signInWithOAuth2).toHaveBeenCalledWith(
      expect.objectContaining({
        returnHeaders: true,
        body: {
          providerId: "hkust",
          callbackURL: "/dashboard",
        },
      }),
    );
  });
});
