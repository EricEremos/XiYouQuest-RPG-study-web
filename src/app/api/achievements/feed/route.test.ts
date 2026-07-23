import { beforeEach, describe, expect, it, vi } from "vitest";

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

type QueryResult = {
  data: unknown;
  error: unknown;
};

function query(result: QueryResult) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    order: vi.fn(() => builder),
    or: vi.fn(async () => result),
    then: (
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

describe("GET /api/achievements/feed", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockReset();
    mocks.createAdminClient.mockReset();
    mocks.getSessionUser.mockReset();
    mocks.getSessionUser.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      email: "student@connect.ust.hk",
    });
  });

  it("uses user-scoped friendships and server-only cross-profile feed reads", async () => {
    const friendshipQuery = query({
      data: [
        {
          requester_id: "11111111-1111-4111-8111-111111111111",
          addressee_id: "22222222-2222-4222-8222-222222222222",
        },
      ],
      error: null,
    });
    const userClient = {
      from: vi.fn((table: string) => {
        if (table !== "friendships") {
          throw new Error(`Unexpected user table: ${table}`);
        }
        return friendshipQuery;
      }),
    };
    const feedQuery = query({
      data: [
        {
          unlocked_at: "2026-07-23T09:00:00Z",
          user_id: "22222222-2222-4222-8222-222222222222",
          achievements: {
            key: "friend_added",
            name: "Fellow Traveler",
            emoji: "👥",
            tier: "common",
          },
          profiles: {
            display_name: "Study Partner",
            avatar_url: null,
          },
        },
      ],
      error: null,
    });
    const adminClient = {
      from: vi.fn((table: string) => {
        if (table !== "user_achievements") {
          throw new Error(`Unexpected admin table: ${table}`);
        }
        return feedQuery;
      }),
    };
    mocks.createClient.mockResolvedValue(userClient);
    mocks.createAdminClient.mockReturnValue(adminClient);

    const { GET } = await import("./route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(userClient.from).toHaveBeenCalledWith("friendships");
    expect(adminClient.from).toHaveBeenCalledWith("user_achievements");
    expect(feedQuery.in).toHaveBeenCalledWith("user_id", [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ]);
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
    ]);
  });

  it("surfaces friendship read failures instead of returning a false empty feed", async () => {
    const friendshipQuery = query({
      data: null,
      error: new Error("friendships unavailable"),
    });
    mocks.createClient.mockResolvedValue({
      from: vi.fn(() => friendshipQuery),
    });
    mocks.createAdminClient.mockReturnValue({ from: vi.fn() });

    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to fetch feed",
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("does not create a server-only data client for an unauthenticated request", async () => {
    mocks.createClient.mockResolvedValue({ from: vi.fn() });
    mocks.getSessionUser.mockResolvedValue(null);

    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
