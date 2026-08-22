import { describe, expect, it } from "vitest";
import {
  CURRENT_PSC_MOCK_COMPONENTS,
  CURRENT_PSC_MOCK_SCORE_VERSION,
  calculateMockExamWeightedTotal,
  getMockExamComponentBySource,
  hasConsistentMockExamTotal,
  inferHistoricalMockExamContract,
  normalizeMockExamResult,
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

  it("rejects a duplicate, missing, or legacy-only component from a current PSC result", () => {
    expect(normalizeMockExamResult(CURRENT_PSC_MOCK_SCORE_VERSION, [
      { componentNumber: 1, score: 100 },
      { componentNumber: 2, score: 100 },
      { componentNumber: 3, score: 100 },
      { componentNumber: 3, score: 50 },
    ])).toBeNull();
    expect(normalizeMockExamResult(CURRENT_PSC_MOCK_SCORE_VERSION, [
      { componentNumber: 1, score: 100 },
      { componentNumber: 2, score: 100 },
      { componentNumber: 3, score: 100 },
      { componentNumber: 5, score: 50 },
    ])).toBeNull();
  });

  it("derives current PSC points and total instead of trusting client allocations", () => {
    const normalized = normalizeMockExamResult(CURRENT_PSC_MOCK_SCORE_VERSION, [
      { componentNumber: 1, score: 100 },
      { componentNumber: 2, score: 80 },
      { componentNumber: 3, score: 60 },
      { componentNumber: 4, score: 40 },
    ]);

    expect(normalized).toEqual({
      totalScore: 60,
      componentScores: [
        { componentNumber: 1, score: 100, points: 10, scoreVersion: CURRENT_PSC_MOCK_SCORE_VERSION },
        { componentNumber: 2, score: 80, points: 16, scoreVersion: CURRENT_PSC_MOCK_SCORE_VERSION },
        { componentNumber: 3, score: 60, points: 18, scoreVersion: CURRENT_PSC_MOCK_SCORE_VERSION },
        { componentNumber: 4, score: 40, points: 16, scoreVersion: CURRENT_PSC_MOCK_SCORE_VERSION },
      ],
    });
    expect(hasConsistentMockExamTotal(60, normalized!)).toBe(true);
    expect(hasConsistentMockExamTotal(1, normalized!)).toBe(false);
  });

  it("recognizes the old four-section source-number history without relabeling speaking as legacy C5", () => {
    expect(inferHistoricalMockExamContract([
      { componentNumber: 1 },
      { componentNumber: 2 },
      { componentNumber: 4 },
      { componentNumber: 5 },
    ])).toEqual({
      scoreVersion: CURRENT_PSC_MOCK_SCORE_VERSION,
      storedNumbersAreSourceNumbers: true,
    });
  });
});
