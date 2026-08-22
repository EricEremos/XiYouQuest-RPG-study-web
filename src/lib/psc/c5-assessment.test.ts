import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchWithRetry } = vi.hoisted(() => ({ fetchWithRetry: vi.fn() }));

vi.mock("@/lib/fetch-retry", () => ({ fetchWithRetry }));

import {
  C5_ASSESSMENT_TYPE,
  C5_ASSESSMENT_VERSION,
  parseC5AssessmentResponse,
  requestC5Assessment,
} from "./c5-assessment";

const validResponse = {
  assessmentType: C5_ASSESSMENT_TYPE,
  assessmentVersion: C5_ASSESSMENT_VERSION,
  pronunciation: { score: 16, deduction: 4, level: 4, label: "Good", notes: "Clear" },
  vocabGrammar: { score: 4, deduction: 1, level: 2, label: "Developing", notes: "Accurate" },
  fluency: { score: 4, deduction: 1, level: 2, label: "Developing", notes: "Steady" },
  timePenalty: 1,
  totalScore: 23,
  normalizedScore: 77,
  transcript: "我喜欢学习中文。",
  errorCount: 1,
};

describe("C5 assessment contract", () => {
  beforeEach(() => {
    fetchWithRetry.mockReset();
  });

  it("accepts only a complete PSC-aligned response", () => {
    expect(parseC5AssessmentResponse(validResponse)).toEqual(validResponse);
  });

  it("rejects an out-of-range score even when the server returned success", () => {
    expect(() => parseC5AssessmentResponse({ ...validResponse, normalizedScore: 101 }))
      .toThrow("Invalid C5 assessment response");
  });

  it("rejects internally inconsistent category and aggregate scores", () => {
    expect(() => parseC5AssessmentResponse({ ...validResponse, totalScore: 24, normalizedScore: 80 }))
      .toThrow("Invalid C5 assessment response");
    expect(() => parseC5AssessmentResponse({
      ...validResponse,
      pronunciation: { ...validResponse.pronunciation, score: 17 },
    })).toThrow("Invalid C5 assessment response");
  });

  it("posts audio once through the shared no-retry contract", async () => {
    fetchWithRetry.mockResolvedValue(new Response(JSON.stringify(validResponse), { status: 200 }));

    await expect(requestC5Assessment(new Blob(["audio"]), "旅行")).resolves.toEqual(validResponse);

    expect(fetchWithRetry).toHaveBeenCalledOnce();
    expect(fetchWithRetry).toHaveBeenCalledWith(
      "/api/speech/c5-assess",
      expect.objectContaining({ method: "POST", body: expect.any(FormData), signal: expect.any(AbortSignal) }),
      { maxRetries: 0 },
    );
  });

  it("does not start a request when its owner has already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(requestC5Assessment(new Blob(["audio"]), "旅行", controller.signal))
      .rejects.toMatchObject({ name: "AbortError" });

    expect(fetchWithRetry).not.toHaveBeenCalled();
  });
});
