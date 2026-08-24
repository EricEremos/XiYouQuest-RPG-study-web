type MultiAnswerQuestion = {
  options: string[];
  correctIndex: number;
  acceptedAnswers?: string[];
};

type AcceptedAnswerDecision = {
  prompt: string;
  acceptedAnswers: readonly string[];
};

export const XQ02_ACCEPTED_ANSWER_BUNDLE = {
  version: "xiyouquest-accepted-answers-v1",
  sourceScope: "xiyouquest_practice",
  reviewStatus: "school_teacher_review_pending",
  decisions: [
    { prompt: "一狗", acceptedAnswers: ["条", "只"] },
    { prompt: "选择正确的句子", acceptedAnswers: ["你听不听得懂？", "你能听懂吗？"] },
  ] satisfies readonly AcceptedAnswerDecision[],
} as const;

const CONFIGURED_ANSWERS_BY_PROMPT = new Map<string, readonly string[]>(
  XQ02_ACCEPTED_ANSWER_BUNDLE.decisions.map(({ prompt, acceptedAnswers }) => [
    normalizeQuizAnswer(prompt),
    acceptedAnswers,
  ])
);

export function normalizeQuizAnswer(value: string): string {
  return value.normalize("NFKC").replace(/[\s\p{P}]/gu, "").toLocaleLowerCase("zh-CN");
}

export function getAcceptedOptionIndices(question: MultiAnswerQuestion): number[] {
  if (!question.acceptedAnswers?.length) return [question.correctIndex];

  const accepted = new Set(question.acceptedAnswers.map(normalizeQuizAnswer));
  const indices = question.options
    .map((option, index) => accepted.has(normalizeQuizAnswer(option)) ? index : -1)
    .filter((index) => index >= 0);

  return indices.length > 0 ? indices : [question.correctIndex];
}

export function isAcceptedQuizAnswer(question: MultiAnswerQuestion, optionIndex: number): boolean {
  return getAcceptedOptionIndices(question).includes(optionIndex);
}

export function withConfiguredAcceptedAnswers<T extends MultiAnswerQuestion & { prompt: string }>(
  question: T
): T & { acceptedAnswers?: string[] } {
  if (question.acceptedAnswers?.length) return question;

  const normalizedPrompt = normalizeQuizAnswer(question.prompt);
  const configuredAnswers = CONFIGURED_ANSWERS_BY_PROMPT.get(normalizedPrompt);
  if (!configuredAnswers) return question;

  const optionValues = new Set(question.options.map(normalizeQuizAnswer));
  const acceptedAnswers = configuredAnswers.filter((answer) => optionValues.has(normalizeQuizAnswer(answer)));
  return acceptedAnswers.length > 1 ? { ...question, acceptedAnswers } : question;
}
