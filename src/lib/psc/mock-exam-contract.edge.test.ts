import { describe, expect, it } from "vitest";
import {
  hasConsistentMockExamTotal,
  normalizeMockExamResult,
} from "../../../supabase/functions/_shared/mock-exam-contract";

describe("Supabase mock-exam feedback contract", () => {
  it("matches the current PSC four-component total and rejects a legacy-only C5", () => {
    const normalized = normalizeMockExamResult("psc-2021-v1", [
      { componentNumber: 1, score: 100 },
      { componentNumber: 2, score: 80 },
      { componentNumber: 3, score: 60 },
      { componentNumber: 4, score: 40 },
    ]);

    expect(normalized).toEqual({ totalScore: 60 });
    expect(hasConsistentMockExamTotal(60, normalized!)).toBe(true);
    expect(normalizeMockExamResult("psc-2021-v1", [
      { componentNumber: 1, score: 100 },
      { componentNumber: 2, score: 80 },
      { componentNumber: 3, score: 60 },
      { componentNumber: 5, score: 40 },
    ])).toBeNull();
  });
});
