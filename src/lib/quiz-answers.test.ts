import { describe, expect, it } from "vitest";
import {
  getAcceptedOptionIndices,
  isAcceptedQuizAnswer,
  normalizeQuizAnswer,
  withConfiguredAcceptedAnswers,
  XQ02_ACCEPTED_ANSWER_BUNDLE,
} from "./quiz-answers";

describe("quiz answer acceptance", () => {
  it("normalizes punctuation and whitespace only", () => {
    expect(normalizeQuizAnswer(" 你能听懂吗？ ")).toBe(normalizeQuizAnswer("你能听懂吗"));
    expect(normalizeQuizAnswer("你能听懂吗")).not.toBe(normalizeQuizAnswer("你听不听得懂"));
  });

  it("records the configured bundle version and school-review boundary", () => {
    expect(XQ02_ACCEPTED_ANSWER_BUNDLE).toMatchObject({
      version: "xiyouquest-accepted-answers-v1",
      sourceScope: "xiyouquest_practice",
      reviewStatus: "school_teacher_review_pending",
    });
  });

  it("accepts both configured sentence forms", () => {
    const question = {
      options: ["你听得懂不懂？", "你听不听得懂？", "你能听懂吗？"],
      correctIndex: 1,
      acceptedAnswers: ["你听不听得懂？", "你能听懂吗？"],
    };
    expect(getAcceptedOptionIndices(question)).toEqual([1, 2]);
    expect(isAcceptedQuizAnswer(question, 1)).toBe(true);
    expect(isAcceptedQuizAnswer(question, 2)).toBe(true);
    expect(isAcceptedQuizAnswer(question, 0)).toBe(false);
  });

  it("accepts both configured dog classifiers", () => {
    const question = {
      options: ["条", "只", "头", "个", "匹"],
      correctIndex: 0,
      acceptedAnswers: ["条", "只"],
    };
    expect(getAcceptedOptionIndices(question)).toEqual([0, 1]);
  });

  it("enriches fallback or database questions from the versioned bundle without broad semantic matching", () => {
    const dogQuestion = withConfiguredAcceptedAnswers({
      prompt: "一（　）狗",
      options: ["条", "只", "头", "个", "匹"],
      correctIndex: 1,
    });
    expect(dogQuestion.acceptedAnswers).toEqual(["条", "只"]);

    const sentenceQuestion = withConfiguredAcceptedAnswers({
      prompt: "选择正确的句子",
      options: ["你听得懂不懂？", "你听不听得懂？", "你能听懂吗？"],
      correctIndex: 1,
    });
    expect(sentenceQuestion.acceptedAnswers).toEqual(["你听不听得懂？", "你能听懂吗？"]);

    const unrelatedQuestion = withConfiguredAcceptedAnswers({
      prompt: "选择正确的句子",
      options: ["我先走", "我走先"],
      correctIndex: 0,
    });
    expect(unrelatedQuestion.acceptedAnswers).toBeUndefined();
  });
});
