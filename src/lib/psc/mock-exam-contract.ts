export const CURRENT_PSC_MOCK_SCORE_VERSION = "psc-2021-v2" as const;
export const HISTORICAL_FOUR_COMPONENT_SCORE_VERSION = "psc-2021-v1" as const;
export const LEGACY_FIVE_COMPONENT_SCORE_VERSION = "legacy-five-component-v1" as const;

export type MockExamScoreVersion =
  | typeof CURRENT_PSC_MOCK_SCORE_VERSION
  | typeof HISTORICAL_FOUR_COMPONENT_SCORE_VERSION
  | typeof LEGACY_FIVE_COMPONENT_SCORE_VERSION;

export type PracticeComponentNumber = 1 | 2 | 3 | 4 | 5;

export interface MockExamComponent {
  number: PracticeComponentNumber;
  sourceComponentNumber: PracticeComponentNumber;
  name: string;
  chineseName: string;
  timeLimitSeconds: number;
  points: number;
}

export interface MockExamComponentScore {
  componentNumber: number;
  score: number;
}

export interface SubmittedMockExamComponentScore extends MockExamComponentScore {
  scoreVersion: MockExamScoreVersion;
}

export interface PersistedMockExamComponentScore extends MockExamComponentScore {
  points: number;
  scoreVersion: MockExamScoreVersion;
}

export interface NormalizedMockExamResult {
  totalScore: number;
  componentScores: PersistedMockExamComponentScore[];
}

export interface HistoricalMockExamComponentScore {
  componentNumber: number;
  scoreVersion?: MockExamScoreVersion;
}

export interface HistoricalMockExamContract {
  scoreVersion: MockExamScoreVersion;
  storedNumbersAreSourceNumbers: boolean;
}

export const CURRENT_PSC_MOCK_COMPONENTS: readonly MockExamComponent[] = [
  { number: 1, sourceComponentNumber: 1, name: "Monosyllabic Characters", chineseName: "读单音节字词", timeLimitSeconds: 210, points: 10 },
  { number: 2, sourceComponentNumber: 2, name: "Multisyllabic Words", chineseName: "读多音节词语", timeLimitSeconds: 150, points: 20 },
  { number: 3, sourceComponentNumber: 3, name: "Selection & Judgment", chineseName: "选择判断", timeLimitSeconds: 180, points: 10 },
  { number: 4, sourceComponentNumber: 4, name: "Passage Reading", chineseName: "朗读短文", timeLimitSeconds: 240, points: 30 },
  { number: 5, sourceComponentNumber: 5, name: "Prompted Speaking", chineseName: "命题说话", timeLimitSeconds: 180, points: 30 },
];

export const HISTORICAL_FOUR_COMPONENTS: readonly MockExamComponent[] = [
  { number: 1, sourceComponentNumber: 1, name: "Monosyllabic Characters", chineseName: "读单音节字词", timeLimitSeconds: 210, points: 10 },
  { number: 2, sourceComponentNumber: 2, name: "Multisyllabic Words", chineseName: "读多音节词语", timeLimitSeconds: 150, points: 20 },
  { number: 3, sourceComponentNumber: 4, name: "Passage Reading", chineseName: "朗读短文", timeLimitSeconds: 240, points: 30 },
  { number: 4, sourceComponentNumber: 5, name: "Prompted Speaking", chineseName: "命题说话", timeLimitSeconds: 180, points: 40 },
];

export const LEGACY_FIVE_COMPONENTS: readonly MockExamComponent[] = [
  { number: 1, sourceComponentNumber: 1, name: "Monosyllabic Characters", chineseName: "读单音节字词", timeLimitSeconds: 210, points: 10 },
  { number: 2, sourceComponentNumber: 2, name: "Multisyllabic Words", chineseName: "读多音节词语", timeLimitSeconds: 150, points: 20 },
  { number: 3, sourceComponentNumber: 3, name: "Selection & Judgment", chineseName: "选择判断", timeLimitSeconds: 180, points: 10 },
  { number: 4, sourceComponentNumber: 4, name: "Passage Reading", chineseName: "朗读短文", timeLimitSeconds: 240, points: 30 },
  { number: 5, sourceComponentNumber: 5, name: "Prompted Speaking", chineseName: "命题说话", timeLimitSeconds: 180, points: 30 },
];

export function getMockExamComponents(scoreVersion: MockExamScoreVersion): readonly MockExamComponent[] {
  if (scoreVersion === CURRENT_PSC_MOCK_SCORE_VERSION) {
    return CURRENT_PSC_MOCK_COMPONENTS;
  }
  if (scoreVersion === HISTORICAL_FOUR_COMPONENT_SCORE_VERSION) {
    return HISTORICAL_FOUR_COMPONENTS;
  }
  return LEGACY_FIVE_COMPONENTS;
}

export function getMockExamComponent(
  scoreVersion: MockExamScoreVersion,
  componentNumber: number,
): MockExamComponent | undefined {
  return getMockExamComponents(scoreVersion).find((component) => component.number === componentNumber);
}

export function getMockExamComponentBySource(
  scoreVersion: MockExamScoreVersion,
  sourceComponentNumber: number,
): MockExamComponent | undefined {
  return getMockExamComponents(scoreVersion).find(
    (component) => component.sourceComponentNumber === sourceComponentNumber,
  );
}

export function calculateMockExamWeightedTotal(
  scoreVersion: MockExamScoreVersion,
  componentScores: readonly MockExamComponentScore[],
): number {
  return componentScores.reduce((total, componentScore) => {
    const component = getMockExamComponent(scoreVersion, componentScore.componentNumber);
    return total + componentScore.score * ((component?.points ?? 0) / 100);
  }, 0);
}

function roundToSingleDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

export function normalizeMockExamResult(
  scoreVersion: MockExamScoreVersion,
  componentScores: readonly SubmittedMockExamComponentScore[],
): NormalizedMockExamResult | null {
  const expectedComponents = getMockExamComponents(scoreVersion);
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

  const normalizedScores: PersistedMockExamComponentScore[] = [];
  for (const component of expectedComponents) {
    const submitted = submittedByNumber.get(component.number);
    if (!submitted) return null;
    normalizedScores.push({
      componentNumber: component.number,
      score: submitted.score,
      points: roundToSingleDecimal(submitted.score * (component.points / 100)),
      scoreVersion,
    });
  }

  return {
    totalScore: roundToSingleDecimal(calculateMockExamWeightedTotal(scoreVersion, normalizedScores)),
    componentScores: normalizedScores,
  };
}

export function hasConsistentMockExamTotal(
  submittedTotal: number,
  normalizedResult: NormalizedMockExamResult,
): boolean {
  return Number.isFinite(submittedTotal)
    && Math.abs(submittedTotal - normalizedResult.totalScore) < 0.05;
}

export function inferHistoricalMockExamContract(
  componentScores: readonly HistoricalMockExamComponentScore[],
): HistoricalMockExamContract {
  const versions = new Set(componentScores.map((score) => score.scoreVersion).filter(Boolean));
  if (versions.size === 1) {
    return {
      scoreVersion: [...versions][0] as MockExamScoreVersion,
      storedNumbersAreSourceNumbers: false,
    };
  }

  const componentNumbers = [...new Set(componentScores.map((score) => score.componentNumber))]
    .sort((left, right) => left - right)
    .join(",");
  if (componentNumbers === "1,2,4,5") {
    return {
      scoreVersion: HISTORICAL_FOUR_COMPONENT_SCORE_VERSION,
      storedNumbersAreSourceNumbers: true,
    };
  }

  return {
    scoreVersion: LEGACY_FIVE_COMPONENT_SCORE_VERSION,
    storedNumbersAreSourceNumbers: false,
  };
}
