export type MockExamScoreVersion = "psc-2021-v1" | "legacy-five-component-v1";

export interface MockExamComponentScore {
  componentNumber: number;
  score: number;
  scoreVersion: MockExamScoreVersion;
}

interface MockExamComponent {
  number: number;
  points: number;
}

export interface NormalizedMockExamResult {
  totalScore: number;
}

const COMPONENTS: Record<MockExamScoreVersion, readonly MockExamComponent[]> = {
  "psc-2021-v1": [
    { number: 1, points: 10 },
    { number: 2, points: 20 },
    { number: 3, points: 30 },
    { number: 4, points: 40 },
  ],
  "legacy-five-component-v1": [
    { number: 1, points: 10 },
    { number: 2, points: 20 },
    { number: 3, points: 10 },
    { number: 4, points: 30 },
    { number: 5, points: 30 },
  ],
};

function roundToSingleDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

export function normalizeMockExamResult(
  scoreVersion: MockExamScoreVersion,
  componentScores: readonly MockExamComponentScore[],
): NormalizedMockExamResult | null {
  const expectedComponents = COMPONENTS[scoreVersion];
  if (componentScores.length !== expectedComponents.length) return null;

  const submittedByNumber = new Map<number, MockExamComponentScore>();
  for (const componentScore of componentScores) {
    if (
      !Number.isFinite(componentScore.score)
      || componentScore.score < 0
      || componentScore.score > 100
      || componentScore.scoreVersion !== scoreVersion
      || submittedByNumber.has(componentScore.componentNumber)
    ) {
      return null;
    }
    submittedByNumber.set(componentScore.componentNumber, componentScore);
  }

  let totalScore = 0;
  for (const component of expectedComponents) {
    const submitted = submittedByNumber.get(component.number);
    if (!submitted) return null;
    totalScore += submitted.score * (component.points / 100);
  }

  return { totalScore: roundToSingleDecimal(totalScore) };
}

export function hasConsistentMockExamTotal(
  submittedTotal: number,
  normalizedResult: NormalizedMockExamResult,
): boolean {
  return Number.isFinite(submittedTotal)
    && Math.abs(submittedTotal - normalizedResult.totalScore) < 0.05;
}
