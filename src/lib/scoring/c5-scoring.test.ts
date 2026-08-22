import { describe, expect, it } from "vitest";
import { calculateC5Score, calculateTimePenalty } from "./c5-scoring";

describe("XiYouQuest C5 PSC-aligned practice duration scoring", () => {
  it.each([
    [180, 0],
    [179, 1],
    [160, 1],
    [159, 2],
    [140, 2],
    [139, 3],
    [120, 3],
    [119, 4],
    [90, 4],
    [89, 5],
    [60, 5],
    [59, 6],
    [31, 6],
    [30, 30],
  ])("applies the configured practice duration band at %i seconds", (seconds, expected) => {
    expect(calculateTimePenalty(seconds)).toBe(expected);
  });

  it("scores speech of 30 seconds or less as zero", () => {
    const result = calculateC5Score({
      iseResult: {
        accuracyScore: 100,
        fluencyScore: 100,
        completenessScore: 100,
        pronunciationScore: 100,
        toneScore: 100,
        words: [],
      },
      geminiAnalysis: {
        vocabularyLevel: 1,
        vocabularyNotes: "Standard",
        fluencyLevel: 1,
        fluencyNotes: "Fluent",
        contentRelevance: "Relevant",
      },
      spokenDurationSeconds: 30,
      transcript: "测试",
    });

    expect(result.totalScore).toBe(0);
    expect(result.normalizedScore).toBe(0);
  });
});
