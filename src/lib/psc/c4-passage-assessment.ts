import { calculateXP } from "@/lib/gamification/xp";

export interface C4AssessmentWord {
  word: string;
  accuracyScore: number;
  errorType: string;
}

export interface C4AssessmentResponse {
  pronunciationScore: number;
  words: C4AssessmentWord[];
}

export interface C4PassageAssessment {
  score: number;
  xpEarned: number;
  sentenceScores: { sentence: string; score: number }[];
}

export type C4AssessmentRequest = (
  blob: Blob,
  referenceText: string,
  category: "read_chapter",
) => Promise<unknown>;

export function parseC4AssessmentResponse(value: unknown): C4AssessmentResponse {
  if (!value || typeof value !== "object") throw new Error("Invalid C4 assessment response");
  const result = value as Record<string, unknown>;
  if (
    typeof result.pronunciationScore !== "number" ||
    !Number.isFinite(result.pronunciationScore) ||
    result.pronunciationScore < 0 ||
    result.pronunciationScore > 100 ||
    !Array.isArray(result.words)
  ) {
    throw new Error("Invalid C4 assessment response");
  }
  const words = result.words.map((word) => {
    if (!word || typeof word !== "object") throw new Error("Invalid C4 assessment word");
    const candidate = word as Record<string, unknown>;
    if (
      typeof candidate.word !== "string" ||
      candidate.word.length === 0 ||
      typeof candidate.accuracyScore !== "number" ||
      !Number.isFinite(candidate.accuracyScore) ||
      candidate.accuracyScore < 0 ||
      candidate.accuracyScore > 100 ||
      typeof candidate.errorType !== "string"
    ) {
      throw new Error("Invalid C4 assessment word");
    }
    return {
      word: candidate.word,
      accuracyScore: candidate.accuracyScore,
      errorType: candidate.errorType,
    };
  });
  return { pronunciationScore: result.pronunciationScore, words };
}

export function splitIntoC4Sentences(content: string): string[] {
  return content.split(/(?<=[。！？；])/g).filter((sentence) => sentence.trim().length > 0);
}

export function computeC4SentenceScores(
  passageContent: string,
  words: C4AssessmentWord[],
): { sentence: string; score: number }[] {
  const sentences = splitIntoC4Sentences(passageContent);
  let wordIndex = 0;

  return sentences.map((sentence) => {
    const rawSentence = sentence.replace(/[。！？；，、：\u201C\u201D\u2018\u2019（）《》\s]/g, "");
    let consumed = 0;
    let sentenceTotal = 0;
    let sentenceWordCount = 0;

    while (consumed < rawSentence.length && wordIndex < words.length) {
      const word = words[wordIndex];
      if (consumed + word.word.length > rawSentence.length + 1) break;
      consumed += word.word.length;
      sentenceTotal += word.accuracyScore;
      sentenceWordCount++;
      wordIndex++;
    }

    return {
      sentence,
      score: sentenceWordCount > 0 ? Math.round(sentenceTotal / sentenceWordCount) : 0,
    };
  });
}

export async function assessC4Passage(
  audioBlob: Blob,
  referenceText: string,
  requestAssessment: C4AssessmentRequest,
): Promise<C4PassageAssessment> {
  const apiResult = parseC4AssessmentResponse(
    await requestAssessment(audioBlob, referenceText, "read_chapter"),
  );
  const score = apiResult.pronunciationScore;
  const xpResult = calculateXP({
    pronunciationScore: score,
    isCorrect: score >= 60,
    currentStreak: score >= 60 ? 1 : 0,
  });

  return {
    score,
    xpEarned: xpResult.totalXP,
    sentenceScores: computeC4SentenceScores(referenceText, apiResult.words),
  };
}
