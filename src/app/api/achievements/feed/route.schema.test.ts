import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  getSessionUser: vi.fn(),
}));

const currentUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "student@connect.ust.hk",
};

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
    or: vi.fn(() => builder),
    then: (
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

describe("GET /api/achievements/feed joined-row schema", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockReset();
    mocks.createAdminClient.mockReset();
    mocks.getSessionUser.mockReset();
    mocks.getSessionUser.mockResolvedValue(currentUser);
  });

  it.each([
    ["null", { achievements: null }],
    ["missing", {}],
  ])(
    "rejects a %s achievement relation from the service-role join",
    async (_caseName, relation) => {
      const friendshipQuery = query({
        data: [
          {
            requester_id: currentUser.id,
            addressee_id: "22222222-2222-4222-8222-222222222222",
          },
        ],
        error: null,
      });
      const feedQuery = query({
        data: [
          {
            unlocked_at: "2026-07-23T09:00:00Z",
            user_id: "22222222-2222-4222-8222-222222222222",
            ...relation,
            profiles: {
              display_name: "Study Partner",
              avatar_url: null,
            },
          },
        ],
        error: null,
      });

      mocks.createClient.mockResolvedValue({
        from: vi.fn(() => friendshipQuery),
      });
      mocks.createAdminClient.mockReturnValue({
        from: vi.fn(() => feedQuery),
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
    },
  );
});
