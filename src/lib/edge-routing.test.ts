import { beforeEach, describe, expect, it, vi } from "vitest";

const getAccessTokenMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth-token", () => ({
  getAccessToken: getAccessTokenMock,
}));

import { resolveEdgeRoute } from "./edge-routing";

describe("resolveEdgeRoute", () => {
  beforeEach(() => {
    getAccessTokenMock.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  });

  it("routes Companion Chat to its Edge Function", async () => {
    getAccessTokenMock.mockResolvedValue("test-token");

    await expect(resolveEdgeRoute("/api/chat/respond")).resolves.toEqual({
      url: "https://example.supabase.co/functions/v1/chat-respond",
      authHeader: "Bearer test-token",
    });
  });
});
