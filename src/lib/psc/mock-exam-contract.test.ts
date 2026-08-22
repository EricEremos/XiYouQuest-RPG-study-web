import { describe, expect, it } from "vitest";
import {
  CURRENT_PSC_MOCK_COMPONENTS,
  CURRENT_PSC_MOCK_SCORE_VERSION,
  calculateMockExamWeightedTotal,
  getMockExamComponentBySource,
} from "./mock-exam-contract";

describe("current PSC mock-exam contract", () => {
  it("uses the current four public components with the official allocation and timings", () => {
    expect(CURRENT_PSC_MOCK_COMPONENTS.map((component) => component.number)).toEqual([1, 2, 3, 4]);
    expect(CURRENT_PSC_MOCK_COMPONENTS.map((component) => component.points)).toEqual([10, 20, 30, 40]);
    expect(CURRENT_PSC_MOCK_COMPONENTS.map((component) => component.timeLimitSeconds)).toEqual([210, 150, 240, 180]);
    expect(CURRENT_PSC_MOCK_COMPONENTS.reduce((total, component) => total + component.points, 0)).toBe(100);
  });

  it("reuses the established reading and speaking practice routes without exposing legacy numbering", () => {
    expect(getMockExamComponentBySource(CURRENT_PSC_MOCK_SCORE_VERSION, 4)?.number).toBe(3);
    expect(getMockExamComponentBySource(CURRENT_PSC_MOCK_SCORE_VERSION, 5)?.number).toBe(4);
  });

  it("weights current public C4 as forty percent of the XiYouQuest practice total", () => {
    expect(calculateMockExamWeightedTotal(CURRENT_PSC_MOCK_SCORE_VERSION, [
      { componentNumber: 1, score: 100 },
      { componentNumber: 2, score: 100 },
      { componentNumber: 3, score: 100 },
      { componentNumber: 4, score: 50 },
    ])).toBe(80);
  });
});
