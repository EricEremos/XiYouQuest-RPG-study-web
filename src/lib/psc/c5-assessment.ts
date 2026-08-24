import { fetchWithRetry } from "@/lib/fetch-retry";

export const C5_ASSESSMENT_TIMEOUT_MS = 150_000;
export const C5_ASSESSMENT_TYPE = "xiyouquest_speaking_practice_signal";
export const C5_ASSESSMENT_VERSION = "xiyouquest-speaking-practice-v2";

export interface C5ScoreCategory {
  score: number;
  deduction: number;
  level: number;
  label: string;
  notes: string;
}

export interface C5AssessmentResponse {
  assessmentType: typeof C5_ASSESSMENT_TYPE;
  assessmentVersion: typeof C5_ASSESSMENT_VERSION;
  pronunciation: C5ScoreCategory;
  vocabGrammar: C5ScoreCategory;
  fluency: C5ScoreCategory;
  timePenalty: number;
  totalScore: number;
  normalizedScore: number;
  transcript: string;
  errorCount: number;
}

function isFiniteNumberInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function parseScoreCategory(
  value: unknown,
  scoreMaximum: number,
  deductionMaximum: number,
  levelMaximum: number,
): C5ScoreCategory {
  if (!value || typeof value !== "object") throw new Error("Invalid C5 assessment score category");
  const category = value as Record<string, unknown>;
  if (
    !isFiniteNumberInRange(category.score, 0, scoreMaximum) ||
    !isFiniteNumberInRange(category.deduction, 0, deductionMaximum) ||
    !isFiniteNumberInRange(category.level, 1, levelMaximum) ||
    typeof category.label !== "string" ||
    typeof category.notes !== "string"
  ) {
    throw new Error("Invalid C5 assessment score category");
  }
  return {
    score: category.score,
    deduction: category.deduction,
    level: category.level,
    label: category.label,
    notes: category.notes,
  };
}

export function parseC5AssessmentResponse(value: unknown): C5AssessmentResponse {
  if (!value || typeof value !== "object") throw new Error("Invalid C5 assessment response");
  const result = value as Record<string, unknown>;
  if (
    result.assessmentType !== C5_ASSESSMENT_TYPE ||
    result.assessmentVersion !== C5_ASSESSMENT_VERSION ||
    !isFiniteNumberInRange(result.timePenalty, 0, 30) ||
    !isFiniteNumberInRange(result.totalScore, 0, 30) ||
    !isFiniteNumberInRange(result.normalizedScore, 0, 100) ||
    !Number.isInteger(result.errorCount) ||
    (result.errorCount as number) < 0 ||
    typeof result.transcript !== "string"
  ) {
    throw new Error("Invalid C5 assessment response");
  }

  const pronunciation = parseScoreCategory(result.pronunciation, 20, 12, 6);
  const vocabGrammar = parseScoreCategory(result.vocabGrammar, 5, 5, 3);
  const fluency = parseScoreCategory(result.fluency, 5, 5, 3);
  if (
    pronunciation.score !== 20 - pronunciation.deduction ||
    vocabGrammar.score !== 5 - vocabGrammar.deduction ||
    fluency.score !== 5 - fluency.deduction
  ) {
    throw new Error("Invalid C5 assessment response");
  }
  const expectedTotalScore = Math.round(Math.max(0, Math.min(
    30,
    (20 - pronunciation.deduction) +
      (5 - vocabGrammar.deduction) +
      (5 - fluency.deduction) -
      result.timePenalty,
  )) * 10) / 10;
  const expectedNormalizedScore = Math.round((expectedTotalScore / 30) * 100);
  if (result.totalScore !== expectedTotalScore || result.normalizedScore !== expectedNormalizedScore) {
    throw new Error("Invalid C5 assessment response");
  }

  return {
    assessmentType: C5_ASSESSMENT_TYPE,
    assessmentVersion: C5_ASSESSMENT_VERSION,
    pronunciation,
    vocabGrammar,
    fluency,
    timePenalty: result.timePenalty,
    totalScore: result.totalScore,
    normalizedScore: result.normalizedScore,
    transcript: result.transcript,
    errorCount: result.errorCount as number,
  };
}

export async function requestC5Assessment(
  audioBlob: Blob,
  topic: string,
  ownerSignal?: AbortSignal,
): Promise<C5AssessmentResponse> {
  if (ownerSignal?.aborted) {
    throw new DOMException("C5 assessment cancelled", "AbortError");
  }
  const controller = new AbortController();
  const abortForOwner = () => controller.abort();
  ownerSignal?.addEventListener("abort", abortForOwner, { once: true });
  const timeout = setTimeout(() => controller.abort(), C5_ASSESSMENT_TIMEOUT_MS);

  try {
    const formData = new FormData();
    formData.append("audio", audioBlob, "recording.wav");
    formData.append("topic", topic);
    const response = await fetchWithRetry("/api/speech/c5-assess", {
      method: "POST",
      body: formData,
      signal: controller.signal,
    }, { maxRetries: 0 });
    if (!response.ok) throw new Error(`C5 assessment failed (${response.status})`);
    return parseC5AssessmentResponse(await response.json());
  } finally {
    clearTimeout(timeout);
    ownerSignal?.removeEventListener("abort", abortForOwner);
  }
}
