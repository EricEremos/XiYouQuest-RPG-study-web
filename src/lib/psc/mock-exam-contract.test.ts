import { describe, expect, it } from "vitest";
import {
  CURRENT_PSC_MOCK_COMPONENTS,
  CURRENT_PSC_MOCK_SCORE_VERSION,
  HISTORICAL_FOUR_COMPONENT_SCORE_VERSION,
  calculateMockExamWeightedTotal,
  getMockExamComponentBySource,
  hasConsistentMockExamTotal,
  inferHistoricalMockExamContract,
  normalizeMockExamResult,
} from "./mock-exam-contract";

describe("current PSC mock-exam contract", () => {
  it("uses all five formal PSC components with the 2021 allocation and timings", () => {
    expect(CURRENT_PSC_MOCK_COMPONENTS.map((component) => component.number)).toEqual([1, 2, 3, 4, 5]);
    expect(CURRENT_PSC_MOCK_COMPONENTS.map((component) => component.points)).toEqual([10, 20, 10, 30, 30]);
    expect(CURRENT_PSC_MOCK_COMPONENTS.map((component) => component.timeLimitSeconds)).toEqual([210, 150, 180, 240, 180]);
    expect(CURRENT_PSC_MOCK_COMPONENTS.reduce((total, component) => total + component.points, 0)).toBe(100);
  });

  it("maps the formal selection, reading, and speaking components to C3, C4, and C5", () => {
    expect(getMockExamComponentBySource(CURRENT_PSC_MOCK_SCORE_VERSION, 3)?.number).toBe(3);
    expect(getMockExamComponentBySource(CURRENT_PSC_MOCK_SCORE_VERSION, 4)?.number).toBe(4);
    expect(getMockExamComponentBySource(CURRENT_PSC_MOCK_SCORE_VERSION, 5)?.number).toBe(5);
  });

  it("weights formal C5 as thirty percent of the XiYouQuest practice total", () => {
    expect(calculateMockExamWeightedTotal(CURRENT_PSC_MOCK_SCORE_VERSION, [
      { componentNumber: 1, score: 100 },
      { componentNumber: 2, score: 100 },
      { componentNumber: 3, score: 100 },
      { componentNumber: 4, score: 100 },
      { componentNumber: 5, score: 50 },
    ])).toBe(85);
  });

  it("rejects duplicate, missing, or mixed-version component results", () => {
    expect(normalizeMockExamResult(CURRENT_PSC_MOCK_SCORE_VERSION, [
      { componentNumber: 1, score: 100, scoreVersion: CURRENT_PSC_MOCK_SCORE_VERSION },
      { componentNumber: 2, score: 100, scoreVersion: CURRENT_PSC_MOCK_SCORE_VERSION },
      { componentNumber: 3, score: 100, scoreVersion: CURRENT_PSC_MOCK_SCORE_VERSION },
      { componentNumber: 4, score: 50, scoreVersion: CURRENT_PSC_MOCK_SCORE_VERSION },
      { componentNumber: 4, score: 50, scoreVersion: CURRENT_PSC_MOCK_SCORE_VERSION },
    ])).toBeNull();
    expect(normalizeMockExamResult(CURRENT_PSC_MOCK_SCORE_VERSION, [
      { componentNumber: 1, score: 100, scoreVersion: CURRENT_PSC_MOCK_SCORE_VERSION },
      { componentNumber: 2, score: 100, scoreVersion: CURRENT_PSC_MOCK_SCORE_VERSION },
      { componentNumber: 3, score: 100, scoreVersion: CURRENT_PSC_MOCK_SCORE_VERSION },
      { componentNumber: 4, score: 50, scoreVersion: CURRENT_PSC_MOCK_SCORE_VERSION },
      { componentNumber: 5, score: 50, scoreVersion: "legacy-five-component-v1" },
    ])).toBeNull();
    expect(normalizeMockExamResult(CURRENT_PSC_MOCK_SCORE_VERSION, [
      { componentNumber: 1, score: 100, scoreVersion: CURRENT_PSC_MOCK_SCORE_VERSION },
      { componentNumber: 2, score: 100, scoreVersion: CURRENT_PSC_MOCK_SCORE_VERSION },
      { componentNumber: 3, score: 100, scoreVersion: "legacy-five-component-v1" },
      { componentNumber: 4, score: 50, scoreVersion: CURRENT_PSC_MOCK_SCORE_VERSION },
      { componentNumber: 5, score: 50, scoreVersion: CURRENT_PSC_MOCK_SCORE_VERSION },
    ])).toBeNull();
  });

  it("derives current PSC points and total instead of trusting client allocations", () => {
    const normalized = normalizeMockExamResult(CURRENT_PSC_MOCK_SCORE_VERSION, [
      { componentNumber: 1, score: 100, scoreVersion: CURRENT_PSC_MOCK_SCORE_VERSION },
      { componentNumber: 2, score: 80, scoreVersion: CURRENT_PSC_MOCK_SCORE_VERSION },
      { componentNumber: 3, score: 60, scoreVersion: CURRENT_PSC_MOCK_SCORE_VERSION },
      { componentNumber: 4, score: 40, scoreVersion: CURRENT_PSC_MOCK_SCORE_VERSION },
      { componentNumber: 5, score: 20, scoreVersion: CURRENT_PSC_MOCK_SCORE_VERSION },
    ]);

    expect(normalized).toEqual({
      totalScore: 50,
      componentScores: [
        { componentNumber: 1, score: 100, points: 10, scoreVersion: CURRENT_PSC_MOCK_SCORE_VERSION },
        { componentNumber: 2, score: 80, points: 16, scoreVersion: CURRENT_PSC_MOCK_SCORE_VERSION },
        { componentNumber: 3, score: 60, points: 6, scoreVersion: CURRENT_PSC_MOCK_SCORE_VERSION },
        { componentNumber: 4, score: 40, points: 12, scoreVersion: CURRENT_PSC_MOCK_SCORE_VERSION },
        { componentNumber: 5, score: 20, points: 6, scoreVersion: CURRENT_PSC_MOCK_SCORE_VERSION },
      ],
    });
    expect(hasConsistentMockExamTotal(50, normalized!)).toBe(true);
    expect(hasConsistentMockExamTotal(1, normalized!)).toBe(false);
  });

  it("preserves the old four-section source-number history without relabeling it as current", () => {
    expect(inferHistoricalMockExamContract([
      { componentNumber: 1 },
      { componentNumber: 2 },
      { componentNumber: 4 },
      { componentNumber: 5 },
    ])).toEqual({
      scoreVersion: HISTORICAL_FOUR_COMPONENT_SCORE_VERSION,
      storedNumbersAreSourceNumbers: true,
    });
  });
});
