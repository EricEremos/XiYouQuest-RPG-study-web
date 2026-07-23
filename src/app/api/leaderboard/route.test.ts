import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getSessionUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
  getSessionUser: mocks.getSessionUser,
}));

const currentUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "student@connect.ust.hk",
};

function request(tab: string, scope: string) {
  return new NextRequest(
    `https://cle-xyq.hkust.edu.hk/api/leaderboard?tab=${tab}&scope=${scope}`,
  );
}

describe("GET /api/leaderboard", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockReset();
    mocks.getSessionUser.mockReset();
    mocks.getSessionUser.mockResolvedValue(currentUser);
  });

  it("uses one bounded authenticated projection for global rankings", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          rank: 1,
          id: currentUser.id,
          display_name: "Current Student",
          avatar_url: null,
          current_level: 3,
          value: "250",
        },
        {
          rank: 2,
          id: "22222222-2222-4222-8222-222222222222",
          display_name: "Study Partner",
          avatar_url: null,
          current_level: 2,
          value: "180",
        },
      ],
      error: null,
    }));
    mocks.createClient.mockResolvedValue({ rpc });

    const { GET } = await import("./route");
    const response = await GET(request("xp", "global"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("get_leaderboard_projection", {
      requested_metric: "xp",
      requested_scope: "global",
    });
    expect(body.rankings).toHaveLength(2);
    expect(body.user_rank).toEqual({ rank: 1, value: 250 });
  });

  it("returns all authorized rows for friend scope", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          rank: 1,
          id: "22222222-2222-4222-8222-222222222222",
          display_name: "Study Partner",
          avatar_url: null,
          current_level: 2,
          value: 7,
        },
      ],
      error: null,
    }));
    mocks.createClient.mockResolvedValue({ rpc });

    const { GET } = await import("./route");
    const response = await GET(request("streak", "friends"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("get_leaderboard_projection", {
      requested_metric: "streak",
      requested_scope: "friends",
    });
    expect(body.rankings).toHaveLength(1);
  });

  it("keeps a current-user rank outside the global top 20", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          rank: 1,
          id: "22222222-2222-4222-8222-222222222222",
          display_name: "Study Partner",
          avatar_url: null,
          current_level: 2,
          value: "92.5",
        },
        {
          rank: 24,
          id: currentUser.id,
          display_name: "Current Student",
          avatar_url: null,
          current_level: 3,
          value: "73.0",
        },
      ],
      error: null,
    }));
    mocks.createClient.mockResolvedValue({ rpc });

    const { GET } = await import("./route");
    const response = await GET(request("accuracy", "global"));
    const body = await response.json();

    expect(body.rankings).toEqual([
      {
        rank: 1,
        id: "22222222-2222-4222-8222-222222222222",
        display_name: "Study Partner",
        avatar_url: null,
        current_level: 2,
        value: 92.5,
      },
    ]);
    expect(body.user_rank).toEqual({ rank: 24, value: 73 });
  });

  it("surfaces projection failures instead of returning a false empty state", async () => {
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
    const response = await GET(request("xp", "global"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to fetch leaderboard",
    });
    consoleError.mockRestore();
  });

  it("rejects malformed projection rows instead of trusting an unchecked cast", async () => {
    mocks.createClient.mockResolvedValue({
      rpc: vi.fn(async () => ({
        data: [
          {
            rank: "first",
            id: "not-a-uuid",
            display_name: "Invalid",
            avatar_url: null,
            current_level: 1,
            value: "many",
          },
        ],
        error: null,
      })),
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const { GET } = await import("./route");
    const response = await GET(request("xp", "global"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to fetch leaderboard",
    });
    consoleError.mockRestore();
  });

  it.each([
    { current_level: null, value: 250 },
    { current_level: 3, value: "" },
  ])(
    "rejects null and empty numeric wire values: %o",
    async ({ current_level, value }) => {
      mocks.createClient.mockResolvedValue({
        rpc: vi.fn(async () => ({
          data: [
            {
              rank: 1,
              id: currentUser.id,
              display_name: "Current Student",
              avatar_url: null,
              current_level,
              value,
            },
          ],
          error: null,
        })),
      });
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      const { GET } = await import("./route");
      const response = await GET(request("xp", "global"));

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: "Failed to fetch leaderboard",
      });
      consoleError.mockRestore();
    },
  );

  it("does not create a data client for an unauthenticated request", async () => {
    mocks.getSessionUser.mockResolvedValue(null);

    const { GET } = await import("./route");
    const response = await GET(request("xp", "global"));

    expect(response.status).toBe(401);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("rejects invalid query parameters before creating a data client", async () => {
    const { GET } = await import("./route");
    const response = await GET(request("unknown", "global"));

    expect(response.status).toBe(400);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
