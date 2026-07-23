import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  currentUser,
  query,
  request,
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

describe("social search route", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockReset();
    mocks.createAdminClient.mockReset();
    mocks.getSessionUser.mockReset();
    mocks.getSessionUser.mockResolvedValue(currentUser);
  });

  it("rejects malformed social search rows from service-role projection", async () => {
    const supabaseClient = {
      from: vi.fn(() => query({ data: [], error: null })),
    };
    const adminClient = {
      from: vi.fn(() =>
        query({
          data: [
            {
              id: "not-a-uuid",
              display_name: "Bad",
              avatar_url: null,
              current_level: "bad-number",
            },
          ],
          error: null,
        }),
      ),
    };

    mocks.createClient.mockResolvedValue(supabaseClient);
    mocks.createAdminClient.mockReturnValue(adminClient);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const { GET } = await import("./search/route");
    const response = await GET(request("/search?q=stu"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Search failed" });
    consoleError.mockRestore();
    expect(supabaseClient.from).toHaveBeenCalledWith("friendships");
    expect(adminClient.from).toHaveBeenCalledWith("profiles");
  });

  it("preserves a validated friend code in social search results", async () => {
    const supabaseClient = {
      from: vi.fn(() => query({ data: [], error: null })),
    };
    const adminClient = {
      from: vi.fn(() =>
        query({
          data: [
            {
              id: "22222222-2222-4222-8222-222222222222",
              display_name: "Friend",
              avatar_url: null,
              current_level: "2",
              friend_code: "FRIEND-1",
            },
          ],
          error: null,
        }),
      ),
    };

    mocks.createClient.mockResolvedValue(supabaseClient);
    mocks.createAdminClient.mockReturnValue(adminClient);

    const { GET } = await import("./search/route");
    const response = await GET(request("/search?q=fri"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      {
        id: "22222222-2222-4222-8222-222222222222",
        display_name: "Friend",
        avatar_url: null,
        current_level: 2,
        friend_code: "FRIEND-1",
      },
    ]);
  });
});
