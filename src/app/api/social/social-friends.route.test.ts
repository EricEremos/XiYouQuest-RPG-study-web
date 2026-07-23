import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  currentUser,
} from "./social-routes.test-setup";

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

describe("social friends route", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockReset();
    mocks.createAdminClient.mockReset();
    mocks.getSessionUser.mockReset();
    mocks.getSessionUser.mockResolvedValue(currentUser);
  });

  it("reads self and friend stats through one bounded authenticated projection", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          friendship_id: null,
          is_self: true,
          id: "11111111-1111-4111-8111-111111111111",
          display_name: "Current Student",
          avatar_url: null,
          current_level: 3,
          total_xp: 250,
          login_streak: 4,
          total_sessions: 8,
          avg_scores: { "1": 81 },
          selected_character: {
            name: "Sun Wukong (孙悟空)",
            image_url: null,
          },
          achievement_count: 2,
        },
        {
          friendship_id: "33333333-3333-4333-8333-333333333333",
          is_self: false,
          id: "22222222-2222-4222-8222-222222222222",
          display_name: "Friend",
          avatar_url: null,
          current_level: 2,
          total_xp: 120,
          login_streak: 3,
          total_sessions: 1,
          avg_scores: { "1": 90 },
          selected_character: null,
          achievement_count: 1,
        },
      ],
      error: null,
    }));
    const userClient = {
      rpc,
    };

    mocks.createClient.mockResolvedValue(userClient);

    const { GET } = await import("./friends/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("get_social_friend_stats");
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(body.self.id).toBe(currentUser.id);
    expect(body.friends).toEqual([
      {
        friendship_id: "33333333-3333-4333-8333-333333333333",
        id: "22222222-2222-4222-8222-222222222222",
        display_name: "Friend",
        avatar_url: null,
        current_level: 2,
        total_xp: 120,
        login_streak: 3,
        total_sessions: 1,
        avg_scores: { "1": 90 },
        selected_character: null,
        achievement_count: 1,
      },
    ]);
  });

  it("fails friend hydration when the bounded projection fails", async () => {
    mocks.createClient.mockResolvedValue({
      rpc: vi.fn(async () => ({
        data: null,
        error: new Error("projection unavailable"),
      })),
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const { GET } = await import("./friends/route");
    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to fetch friends",
    });
    consoleError.mockRestore();
  });

  it.each([
    { current_level: null, total_xp: 250 },
    { current_level: 3, total_xp: "" },
  ])(
    "rejects null and empty social numeric wire values: %o",
    async ({ current_level, total_xp }) => {
      mocks.createClient.mockResolvedValue({
        rpc: vi.fn(async () => ({
          data: [
            {
              friendship_id: null,
              is_self: true,
              id: "11111111-1111-4111-8111-111111111111",
              display_name: "Current Student",
              avatar_url: null,
              current_level,
              total_xp,
              login_streak: 4,
              total_sessions: 8,
              avg_scores: { "1": 81 },
              selected_character: null,
              achievement_count: 2,
            },
          ],
          error: null,
        })),
      });
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      const { GET } = await import("./friends/route");
      const response = await GET();

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: "Failed to fetch friends",
      });
      consoleError.mockRestore();
    },
  );

  it("rejects malformed projection rows instead of trusting an unchecked cast", async () => {
    mocks.createClient.mockResolvedValue({
      rpc: vi.fn(async () => ({
        data: [
          {
            friendship_id: "not-a-uuid",
            is_self: false,
            id: "also-not-a-uuid",
          },
        ],
        error: null,
      })),
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const { GET } = await import("./friends/route");
    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to fetch friends",
    });
    consoleError.mockRestore();
  });
});
