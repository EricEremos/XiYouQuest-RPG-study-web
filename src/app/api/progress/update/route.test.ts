import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { createClient, getSessionUser } = vi.hoisted(() => ({
  createClient: vi.fn(),
  getSessionUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient, getSessionUser }));

vi.mock("@/lib/achievements/check", () => ({
  checkAndUnlockAchievements: vi.fn(),
}));

import { POST } from "./route";

const requestBody = {
  characterId: "7f00df0d-3790-4c5a-995e-68f63f3d7de8",
  attemptId: "6f00df0d-3790-4c5a-995e-68f63f3d7de8",
  component: 4,
  score: 80,
  xpEarned: 10,
  durationSeconds: 0,
  questionsAttempted: 1,
  questionsCorrect: 1,
  bestStreak: 1,
};

describe("progress update attempt idempotency", () => {
  it("returns the prior result before any new progress mutation for the same attempt", async () => {
    const existingAttempt = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(),
    };
    existingAttempt.select.mockReturnValue(existingAttempt);
    existingAttempt.eq.mockReturnValue(existingAttempt);
    existingAttempt.maybeSingle.mockResolvedValue({ data: { id: "existing-session" }, error: null });
    const supabase = {
      from: vi.fn(() => existingAttempt),
      rpc: vi.fn(),
    };
    createClient.mockResolvedValue(supabase);
    getSessionUser.mockResolvedValue({ id: "verified-user", email: "learner@connect.ust.hk" });

    const response = await POST(new NextRequest("https://preview.example.test/api/progress/update", {
      method: "POST",
      body: JSON.stringify(requestBody),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ alreadyRecorded: true, newAchievements: [] });
    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(existingAttempt.eq).toHaveBeenNthCalledWith(1, "user_id", "verified-user");
    expect(existingAttempt.eq).toHaveBeenNthCalledWith(2, "client_attempt_id", requestBody.attemptId);
  });
});
