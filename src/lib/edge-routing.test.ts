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

  it("keeps the 180-second C5 assessment on the Next route", async () => {
    await expect(resolveEdgeRoute("/api/speech/c5-assess")).resolves.toBeNull();
    expect(getAccessTokenMock).not.toHaveBeenCalled();
  });

  it("continues routing Companion Chat to its Edge Function", async () => {
    getAccessTokenMock.mockResolvedValue("test-token");

    await expect(resolveEdgeRoute("/api/chat/respond")).resolves.toEqual({
      url: "https://example.supabase.co/functions/v1/chat-respond",
      authHeader: "Bearer test-token",
    });
  });
});
