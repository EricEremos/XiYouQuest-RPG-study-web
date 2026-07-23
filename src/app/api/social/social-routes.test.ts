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

  it("keeps friendship authorization user-scoped but reads friend stats with the server-only client", async () => {
    const userClient = {
      from: vi.fn(() =>
        query({
          data: [
            {
              id: "friendship-1",
              requester_id: "11111111-1111-4111-8111-111111111111",
              addressee_id: "22222222-2222-4222-8222-222222222222",
            },
          ],
          error: null,
        }),
      ),
    };
    const adminClient = {
      from: vi.fn((table: string) => {
        if (table === "profiles") {
          return query({
            data: {
              id: "22222222-2222-4222-8222-222222222222",
              display_name: "Friend",
              avatar_url: null,
              current_level: 2,
              total_xp: 120,
              login_streak: 3,
            },
            error: null,
          });
        }
        if (table === "practice_sessions") {
          return query({ data: [], error: null });
        }
        if (table === "user_characters") {
          return query({ data: null, error: null });
        }
        if (table === "user_achievements") {
          return query({ data: null, error: null, count: 0 });
        }
        throw new Error(`Unexpected admin table: ${table}`);
      }),
    };

    mocks.createClient.mockResolvedValue(userClient);
    mocks.createAdminClient.mockReturnValue(adminClient);

    const { GET } = await import("./friends/route");
    const response = await GET();

    expect(response.status).toBe(200);
    expect(userClient.from).toHaveBeenCalledTimes(1);
    expect(userClient.from).toHaveBeenCalledWith("friendships");
    expect(adminClient.from).toHaveBeenCalledWith("profiles");
    expect(adminClient.from).toHaveBeenCalledWith("practice_sessions");
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
});
