import { describe, expect, it } from "vitest";
import { chatGenerateImageSchema, progressUpdateSchema } from "./validations";

describe("chat image generation validation", () => {
  const sessionId = "6f00df0d-3790-4c5a-995e-68f63f3d7de8";

  it("accepts only a session identifier and rejects a conversation payload", () => {
    expect(chatGenerateImageSchema.safeParse({ sessionId }).success).toBe(true);
    expect(
      chatGenerateImageSchema.safeParse({
        sessionId,
        conversationSummary: "private learner conversation",
      }).success,
    ).toBe(false);
  });
});

describe("practice-progress validation", () => {
  const attemptId = "7f00df0d-3790-4c5a-995e-68f63f3d7de8";
  const payload = {
    characterId: "6f00df0d-3790-4c5a-995e-68f63f3d7de8",
    component: 5,
    score: 72,
    xpEarned: 10,
    durationSeconds: 180,
    questionsAttempted: 1,
    questionsCorrect: 1,
    bestStreak: 1,
  };

  it("accepts the aggregate C5 progress payload", () => {
    expect(progressUpdateSchema.safeParse(payload).success).toBe(true);
    expect(progressUpdateSchema.safeParse({ ...payload, attemptId }).success).toBe(true);
  });

  it("rejects raw transcript or audio fields rather than silently stripping them", () => {
    expect(
      progressUpdateSchema.safeParse({
        ...payload,
        transcript: "learner speech",
      }).success,
    ).toBe(false);
    expect(
      progressUpdateSchema.safeParse({
        ...payload,
        audio: "not-audio-storage-field",
      }).success,
    ).toBe(false);
  });
});
