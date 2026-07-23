import { beforeEach, describe, expect, it, vi } from "vitest";

import { currentUser } from "./social-routes.test-setup";

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

describe("social requests route", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockReset();
    mocks.createAdminClient.mockReset();
    mocks.getSessionUser.mockReset();
    mocks.getSessionUser.mockResolvedValue(currentUser);
  });

  it("reads pending requests through the bounded authenticated projection", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          direction: "incoming",
          friendship_id: "44444444-4444-4444-8444-444444444444",
          created_at: "2026-07-23T00:00:00Z",
          id: "22222222-2222-4222-8222-222222222222",
          display_name: "Friend",
          avatar_url: null,
          current_level: 2,
        },
        {
          direction: "outgoing",
          friendship_id: "55555555-5555-4555-8555-555555555555",
          created_at: "2026-07-22T00:00:00Z",
          id: "66666666-6666-4666-8666-666666666666",
          display_name: "Pending Pal",
          avatar_url: null,
          current_level: 5,
        },
      ],
      error: null,
    }));
    mocks.createClient.mockResolvedValue({ rpc });

    const { GET } = await import("./requests/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("get_pending_friend_requests");
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(body.incoming).toEqual([
      {
        friendship_id: "44444444-4444-4444-8444-444444444444",
        created_at: "2026-07-23T00:00:00Z",
        user: {
          id: "22222222-2222-4222-8222-222222222222",
          display_name: "Friend",
          avatar_url: null,
          current_level: 2,
        },
      },
    ]);
    expect(body.outgoing).toEqual([
      {
        friendship_id: "55555555-5555-4555-8555-555555555555",
        created_at: "2026-07-22T00:00:00Z",
        user: {
          id: "66666666-6666-4666-8666-666666666666",
          display_name: "Pending Pal",
          avatar_url: null,
          current_level: 5,
        },
      },
    ]);
  });

  it("fails pending-request hydration when the projection fails", async () => {
    mocks.createClient.mockResolvedValue({
      rpc: vi.fn(async () => ({
        data: null,
        error: new Error("projection unavailable"),
      })),
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

  it("rejects malformed projection rows instead of trusting an unchecked cast", async () => {
    mocks.createClient.mockResolvedValue({
      rpc: vi.fn(async () => ({
        data: [
          {
            direction: "sideways",
            friendship_id: "not-a-uuid",
          },
        ],
        error: null,
      })),
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
