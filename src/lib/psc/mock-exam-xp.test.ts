import { describe, expect, it } from "vitest";
import { calculateMockExamXpCeiling } from "./mock-exam-xp";

describe("calculateMockExamXpCeiling", () => {
  it("awards pronunciation components by score band: perfect 10, good 5, attempted 2", () => {
    expect(calculateMockExamXpCeiling([
      { componentNumber: 1, score: 90 },
      { componentNumber: 2, score: 60 },
      { componentNumber: 4, score: 59.9 },
      { componentNumber: 5, score: 0 },
    ])).toBe(10 + 5 + 2 + 2);
  });

  it("awards the quiz component full XP at a passing score and attempted XP below it", () => {
    expect(calculateMockExamXpCeiling([{ componentNumber: 3, score: 60 }])).toBe(10);
    expect(calculateMockExamXpCeiling([{ componentNumber: 3, score: 89 }])).toBe(10);
    expect(calculateMockExamXpCeiling([{ componentNumber: 3, score: 59 }])).toBe(2);
  });

  it("caps a full perfect current-contract exam at 50 XP", () => {
    expect(calculateMockExamXpCeiling([
      { componentNumber: 1, score: 100 },
      { componentNumber: 2, score: 100 },
      { componentNumber: 3, score: 100 },
      { componentNumber: 4, score: 100 },
      { componentNumber: 5, score: 100 },
    ])).toBe(50);
  });
});
