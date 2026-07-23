import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getSessionUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
  getSessionUser: mocks.getSessionUser,
}));

describe("GET /api/achievements/feed", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockReset();
    mocks.getSessionUser.mockReset();
    mocks.getSessionUser.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      email: "student@connect.ust.hk",
    });
  });

  it("reads the feed through the bounded authenticated projection", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          unlocked_at: "2026-07-23T09:00:00Z",
          user_id: "22222222-2222-4222-8222-222222222222",
          display_name: "Study Partner",
          avatar_url: null,
          achievement_key: "friend_added",
          achievement_name: "Fellow Traveler",
          achievement_emoji: "👥",
          achievement_tier: "common",
          is_self: false,
        },
        {
          unlocked_at: "2026-07-22T09:00:00Z",
          user_id: "11111111-1111-4111-8111-111111111111",
          display_name: null,
          avatar_url: null,
          achievement_key: "streak_3",
          achievement_name: "On a Roll",
          achievement_emoji: "🔥",
          achievement_tier: "uncommon",
          is_self: true,
        },
      ],
      error: null,
    }));
    mocks.createClient.mockResolvedValue({ rpc });

    const { GET } = await import("./route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("get_achievement_feed");
    expect(body.feed).toEqual([
      {
        unlocked_at: "2026-07-23T09:00:00Z",
        user_id: "22222222-2222-4222-8222-222222222222",
        display_name: "Study Partner",
        avatar_url: null,
        achievement_key: "friend_added",
        achievement_name: "Fellow Traveler",
        achievement_emoji: "👥",
        achievement_tier: "common",
        is_self: false,
      },
      {
        unlocked_at: "2026-07-22T09:00:00Z",
        user_id: "11111111-1111-4111-8111-111111111111",
        display_name: "Unknown",
        avatar_url: null,
        achievement_key: "streak_3",
        achievement_name: "On a Roll",
        achievement_emoji: "🔥",
        achievement_tier: "uncommon",
        is_self: true,
      },
    ]);
  });

  it("fails closed when the projection errors", async () => {
    mocks.createClient.mockResolvedValue({
      rpc: vi.fn(async () => ({
        data: null,
        error: new Error("projection unavailable"),
      })),
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to fetch feed",
    });
    consoleError.mockRestore();
  });

  it("rejects malformed projection rows instead of trusting an unchecked cast", async () => {
    mocks.createClient.mockResolvedValue({
      rpc: vi.fn(async () => ({
        data: [{ user_id: "not-a-uuid" }],
        error: null,
      })),
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to fetch feed",
    });
    consoleError.mockRestore();
  });

  it("does not create a data client for an unauthenticated request", async () => {
    mocks.getSessionUser.mockResolvedValue(null);

    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
