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

describe("social lookup route", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockReset();
    mocks.createAdminClient.mockReset();
    mocks.getSessionUser.mockReset();
    mocks.getSessionUser.mockResolvedValue(currentUser);
  });

  it("rejects malformed profile lookup rows from service-role projection", async () => {
    const adminQuery = query({
      data: {
        id: "11111111-1111-4111-8111-111111111111",
        display_name: "Current Student",
        avatar_url: null,
        current_level: "high",
        friend_code: "STU123",
      },
      error: null,
    });

    mocks.createAdminClient.mockReturnValue({
      from: vi.fn(() => adminQuery),
    });
    mocks.createClient.mockResolvedValue({
      from: vi.fn(() => query({ data: [], error: null })),
    });

    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const { GET } = await import("./lookup/route");
    const response = await GET(request("/lookup?code=STU123"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Lookup failed" });
    consoleError.mockRestore();
  });
});
