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

describe("social search route", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockReset();
    mocks.createAdminClient.mockReset();
    mocks.getSessionUser.mockReset();
    mocks.getSessionUser.mockResolvedValue(currentUser);
  });

  it("searches through the bounded projection and never returns friend codes", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          display_name: "Study Partner",
          avatar_url: null,
          current_level: 2,
        },
      ],
      error: null,
    }));
    mocks.createClient.mockResolvedValue({ rpc });

    const { GET } = await import("./search/route");
    const response = await GET(request("/search?q=Study"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("search_profiles_for_friends", {
      search_term: "Study",
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(body).toEqual([
      {
        id: "22222222-2222-4222-8222-222222222222",
        display_name: "Study Partner",
        avatar_url: null,
        current_level: 2,
      },
    ]);
    expect(body[0]).not.toHaveProperty("friend_code");
  });

  it("rejects malformed projection rows instead of trusting an unchecked cast", async () => {
    mocks.createClient.mockResolvedValue({
      rpc: vi.fn(async () => ({
        data: [{ id: "not-a-uuid" }],
        error: null,
      })),
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const { GET } = await import("./search/route");
    const response = await GET(request("/search?q=Study"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Search failed" });
    consoleError.mockRestore();
  });

  it("rejects search terms that are too short or too long", async () => {
    mocks.createClient.mockResolvedValue({ rpc: vi.fn() });

    const { GET } = await import("./search/route");

    const tooShort = await GET(request("/search?q=a"));
    expect(tooShort.status).toBe(400);

    const tooLong = await GET(request(`/search?q=${"a".repeat(51)}`));
    expect(tooLong.status).toBe(400);
  });
});
