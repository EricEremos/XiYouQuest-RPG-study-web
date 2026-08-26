import { describe, expect, it } from "vitest";
import {
  hasConsistentMockExamTotal,
  normalizeMockExamResult,
} from "../../../supabase/functions/_shared/mock-exam-contract";

describe("Supabase mock-exam feedback contract", () => {
  it("matches the current five-component PSC total and rejects invalid score contracts", () => {
    const normalized = normalizeMockExamResult("psc-2021-v2", [
      { componentNumber: 1, score: 100, scoreVersion: "psc-2021-v2" },
      { componentNumber: 2, score: 80, scoreVersion: "psc-2021-v2" },
      { componentNumber: 3, score: 60, scoreVersion: "psc-2021-v2" },
      { componentNumber: 4, score: 40, scoreVersion: "psc-2021-v2" },
      { componentNumber: 5, score: 20, scoreVersion: "psc-2021-v2" },
    ]);

    expect(normalized).toEqual({ totalScore: 50 });
    expect(hasConsistentMockExamTotal(50, normalized!)).toBe(true);
    expect(normalizeMockExamResult("psc-2021-v2", [
      { componentNumber: 1, score: 100, scoreVersion: "psc-2021-v2" },
      { componentNumber: 2, score: 80, scoreVersion: "psc-2021-v2" },
      { componentNumber: 3, score: 60, scoreVersion: "psc-2021-v2" },
      { componentNumber: 4, score: 40, scoreVersion: "psc-2021-v2" },
      { componentNumber: 4, score: 20, scoreVersion: "psc-2021-v2" },
    ])).toBeNull();
    expect(normalizeMockExamResult("psc-2021-v2", [
      { componentNumber: 1, score: 100, scoreVersion: "psc-2021-v2" },
      { componentNumber: 2, score: 80, scoreVersion: "psc-2021-v2" },
      { componentNumber: 3, score: 60, scoreVersion: "psc-2021-v2" },
      { componentNumber: 4, score: 40, scoreVersion: "psc-2021-v2" },
      { componentNumber: 5, score: 20, scoreVersion: "legacy-five-component-v1" },
    ])).toBeNull();
  });
});
