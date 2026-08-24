import { calculateXP } from "@/lib/gamification/xp";
import type { MockExamComponentScore } from "./mock-exam-contract";

// In the current psc-2021-v2 contract, component 3 (选择判断) is the quiz;
// the exam runner scores it through calculateXP's isCorrect branch, while
// every other component uses the pronunciationScore banding.
const QUIZ_COMPONENT_NUMBER = 3;

/**
 * The maximum XP a legitimate client can award for a normalized mock exam
 * result. Mirrors the exam runner's per-component calculateXP calls (streak
 * is never above 1 during a mock exam, so the multiplier is always 1). A
 * client may report less (failed assessments award 0), never more.
 */
export function calculateMockExamXpCeiling(
  componentScores: readonly MockExamComponentScore[],
): number {
  return componentScores.reduce((total, { componentNumber, score }) => {
    const isPassing = score >= 60;
    const xpResult = componentNumber === QUIZ_COMPONENT_NUMBER
      ? calculateXP({ isCorrect: isPassing, currentStreak: isPassing ? 1 : 0 })
      : calculateXP({
        pronunciationScore: score,
        isCorrect: isPassing,
        currentStreak: isPassing ? 1 : 0,
      });
    return total + xpResult.totalXP;
  }, 0);
}
