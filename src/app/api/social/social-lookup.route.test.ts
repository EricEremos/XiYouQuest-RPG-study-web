import { beforeEach, describe, expect, it, vi } from "vitest";

import { currentUser, request } from "./social-routes.test-setup";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  getSessionUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
  getSessionUser: mocks.getSessionUser,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

describe("social lookup route", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockReset();
    mocks.createAdminClient.mockReset();
    mocks.getSessionUser.mockReset();
    mocks.getSessionUser.mockResolvedValue(currentUser);
  });

  it("resolves a friend code through the bounded projection without leaking codes", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          display_name: "Friend",
          avatar_url: null,
          current_level: 2,
        },
      ],
      error: null,
    }));
    mocks.createClient.mockResolvedValue({ rpc });

    const { GET } = await import("./lookup/route");
    const response = await GET(request("/lookup?code=PSC-ABCD12"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("get_friend_code_profile", {
      requested_code: "PSC-ABCD12",
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(body).toEqual({
      id: "22222222-2222-4222-8222-222222222222",
      display_name: "Friend",
      avatar_url: null,
      current_level: 2,
    });
    expect(body).not.toHaveProperty("friend_code");
  });

  it("returns 404 when no profile matches the friend code", async () => {
    mocks.createClient.mockResolvedValue({
      rpc: vi.fn(async () => ({ data: [], error: null })),
    });

    const { GET } = await import("./lookup/route");
    const response = await GET(request("/lookup?code=PSC-MISSING"));

    expect(response.status).toBe(404);
  });

  it("rejects malformed projection rows instead of trusting an unchecked cast", async () => {
    mocks.createClient.mockResolvedValue({
      rpc: vi.fn(async () => ({
        data: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            display_name: "Friend",
            avatar_url: null,
            current_level: "high",
          },
        ],
        error: null,
      })),
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const { GET } = await import("./lookup/route");
    const response = await GET(request("/lookup?code=PSC-ABCD12"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Lookup failed" });
    consoleError.mockRestore();
  });

  it("rate limits repeated friend-code lookups per user", async () => {
    mocks.createClient.mockResolvedValue({
      rpc: vi.fn(async () => ({ data: [], error: null })),
    });

    const { GET } = await import("./lookup/route");
    const lookup = () => GET(request("/lookup?code=PSC-ABCD12"));

    let lastStatus = 0;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      lastStatus = (await lookup()).status;
    }
    expect(lastStatus).toBe(404);

    const limited = await lookup();
    expect(limited.status).toBe(429);
  });
});
