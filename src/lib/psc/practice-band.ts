/**
 * XiYouQuest's own learner-feedback banding for weighted practice scores.
 *
 * This is deliberately not the PSC grade scale and must never be shown as an
 * official result, certification, eligibility decision, or prediction.
 */
export const XIYOUQUEST_PRACTICE_BAND_METADATA = {
  version: "xiyouquest-practice-band-v1",
  label: "XiYouQuest practice band",
} as const;

export type PracticeBand = {
  label: string;
  description: string;
};

export function getXiYouQuestPracticeBand(score: number): PracticeBand {
  if (score >= 97) return { label: "Mastery", description: "Consistently strong practice performance" };
  if (score >= 92) return { label: "Advanced", description: "Very strong practice performance" };
  if (score >= 87) return { label: "Strong", description: "Strong practice performance" };
  if (score >= 80) return { label: "Proficient", description: "Solid practice performance" };
  if (score >= 70) return { label: "Developing", description: "Developing practice performance" };
  if (score >= 60) return { label: "Foundation", description: "Build core practice skills" };
  return { label: "Starting point", description: "Start with core practice skills" };
}
