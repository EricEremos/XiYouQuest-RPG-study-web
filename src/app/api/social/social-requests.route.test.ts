import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  currentUser,
  query,
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

describe("social requests route", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockReset();
    mocks.createAdminClient.mockReset();
    mocks.getSessionUser.mockReset();
    mocks.getSessionUser.mockResolvedValue(currentUser);
  });

  it("uses the server-only client to resolve profiles for authorized pending requests", async () => {
    const incoming = query({
      data: [
        {
          id: "44444444-4444-4444-8444-444444444444",
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
    expect(incoming.limit).toHaveBeenCalledWith(200);
    expect(outgoing.limit).toHaveBeenCalledWith(200);
    expect(adminClient.from).toHaveBeenCalledWith("profiles");
    expect(body.incoming[0].user.display_name).toBe("Friend");
  });

  it("fails pending-request hydration when the authorized profile projection fails", async () => {
    const incoming = query({
      data: [
        {
          id: "44444444-4444-4444-8444-444444444444",
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

  it("rejects malformed pending request rows before hydration", async () => {
    const incoming = query({
      data: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          requester_id: "not-a-uuid",
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
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const { GET } = await import("./requests/route");
    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to fetch requests",
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("rejects malformed request profile rows from service-role hydration", async () => {
    const incoming = query({
      data: [
        {
          id: "44444444-4444-4444-8444-444444444444",
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
              current_level: null,
            },
          ],
          error: null,
        }),
      ),
    };

    mocks.createClient.mockResolvedValue(userClient);
    mocks.createAdminClient.mockReturnValue(adminClient);
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
