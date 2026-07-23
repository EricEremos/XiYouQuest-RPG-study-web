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
  count?: number | null;
};

function query(result: QueryResult) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    not: vi.fn(() => builder),
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

describe("social route data access", () => {
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
    expect(body.self.id).toBe("11111111-1111-4111-8111-111111111111");
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

  it("uses the server-only client to resolve profiles for authorized pending requests", async () => {
    const incoming = query({
      data: [
        {
          id: "request-1",
          requester_id: "22222222-2222-4222-8222-222222222222",
          created_at: "2026-07-23T00:00:00Z",
        },
      ],
      error: null,
    });
    const outgoing = query({ data: [], error: null });
    const userClient = {
      from: vi
        .fn()
        .mockReturnValueOnce(incoming)
        .mockReturnValueOnce(outgoing),
    };
    const adminClient = {
      from: vi.fn(() =>
        query({
          data: [
            {
              id: "22222222-2222-4222-8222-222222222222",
              display_name: "Friend",
              avatar_url: null,
              current_level: 2,
            },
          ],
          error: null,
        }),
      ),
    };

    mocks.createClient.mockResolvedValue(userClient);
    mocks.createAdminClient.mockReturnValue(adminClient);

    const { GET } = await import("./requests/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(userClient.from).toHaveBeenCalledTimes(2);
    expect(adminClient.from).toHaveBeenCalledWith("profiles");
    expect(body.incoming[0].user.display_name).toBe("Friend");
  });

  it("fails pending-request hydration when the authorized profile projection fails", async () => {
    const incoming = query({
      data: [
        {
          id: "request-1",
          requester_id: "22222222-2222-4222-8222-222222222222",
          created_at: "2026-07-23T00:00:00Z",
        },
      ],
      error: null,
    });
    const outgoing = query({ data: [], error: null });
    mocks.createClient.mockResolvedValue({
      from: vi
        .fn()
        .mockReturnValueOnce(incoming)
        .mockReturnValueOnce(outgoing),
    });
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn(() =>
        query({
          data: null,
          error: new Error("profiles unavailable"),
        }),
      ),
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const { GET } = await import("./requests/route");
    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to fetch requests",
    });
    consoleError.mockRestore();
  });
});
