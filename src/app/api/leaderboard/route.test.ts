import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

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
  count?: number | null;
};

function query(result: QueryResult) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gt: vi.fn(() => builder),
    in: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    order: vi.fn(() => builder),
    or: vi.fn(async () => result),
    single: vi.fn(async () => result),
    then: (
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

describe("GET /api/leaderboard", () => {
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

  it("keeps global rankings behind authentication and uses the server-only read client", async () => {
    const userClient = { from: vi.fn() };
    const rankingQuery = query({
      data: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          display_name: "Current Student",
          avatar_url: null,
          current_level: 3,
          total_xp: 250,
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          display_name: "Study Partner",
          avatar_url: null,
          current_level: 2,
          total_xp: 180,
        },
      ],
      error: null,
    });
    const adminClient = {
      from: vi.fn((table: string) => {
        if (table !== "profiles") {
          throw new Error(`Unexpected ranking table: ${table}`);
        }
        return rankingQuery;
      }),
    };
    mocks.createClient.mockResolvedValue(userClient);
    mocks.createAdminClient.mockReturnValue(adminClient);

    const { GET } = await import("./route");
    const response = await GET(
      new NextRequest(
        "https://cle-xyq.hkust.edu.hk/api/leaderboard?tab=xp&scope=global",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(userClient.from).not.toHaveBeenCalled();
    expect(adminClient.from).toHaveBeenCalledWith("profiles");
    expect(body).toEqual({
      rankings: [
        {
          rank: 1,
          id: "11111111-1111-4111-8111-111111111111",
          display_name: "Current Student",
          avatar_url: null,
          current_level: 3,
          value: 250,
        },
        {
          rank: 2,
          id: "22222222-2222-4222-8222-222222222222",
          display_name: "Study Partner",
          avatar_url: null,
          current_level: 2,
          value: 180,
        },
      ],
      user_rank: { rank: 1, value: 250 },
    });
  });

  it("derives friend membership with the user client before reading friend rankings", async () => {
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
    const rankingQuery = query({
      data: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          display_name: "Study Partner",
          avatar_url: null,
          current_level: 2,
          login_streak: 7,
        },
      ],
      error: null,
    });
    const adminClient = {
      from: vi.fn(() => rankingQuery),
    };
    mocks.createClient.mockResolvedValue(userClient);
    mocks.createAdminClient.mockReturnValue(adminClient);

    const { GET } = await import("./route");
    const response = await GET(
      new NextRequest(
        "https://cle-xyq.hkust.edu.hk/api/leaderboard?tab=streak&scope=friends",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(userClient.from).toHaveBeenCalledWith("friendships");
    expect(friendshipQuery.or).toHaveBeenCalledWith(
      "requester_id.eq.11111111-1111-4111-8111-111111111111,addressee_id.eq.11111111-1111-4111-8111-111111111111",
    );
    expect(rankingQuery.in).toHaveBeenCalledWith("id", [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ]);
    expect(body.rankings).toHaveLength(1);
  });

  it("surfaces friendship read failures instead of returning an empty friends leaderboard", async () => {
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
    const response = await GET(
      new NextRequest(
        "https://cle-xyq.hkust.edu.hk/api/leaderboard?tab=xp&scope=friends",
      ),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to fetch leaderboard",
    });
    consoleError.mockRestore();
  });

  it("surfaces ranking read failures instead of returning a false empty state", async () => {
    const rankingQuery = query({
      data: null,
      error: new Error("rankings unavailable"),
    });
    mocks.createClient.mockResolvedValue({ from: vi.fn() });
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn(() => rankingQuery),
    });

    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { GET } = await import("./route");
    const response = await GET(
      new NextRequest(
        "https://cle-xyq.hkust.edu.hk/api/leaderboard?tab=xp&scope=global",
      ),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to fetch leaderboard",
    });
    consoleError.mockRestore();
  });

  it("does not create a server-only data client for an unauthenticated request", async () => {
    mocks.createClient.mockResolvedValue({ from: vi.fn() });
    mocks.getSessionUser.mockResolvedValue(null);

    const { GET } = await import("./route");
    const response = await GET(
      new NextRequest(
        "https://cle-xyq.hkust.edu.hk/api/leaderboard?tab=xp&scope=global",
      ),
    );

    expect(response.status).toBe(401);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
