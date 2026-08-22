export const CURRENT_PSC_MOCK_SCORE_VERSION = "psc-2021-v1" as const;
export const LEGACY_FIVE_COMPONENT_SCORE_VERSION = "legacy-five-component-v1" as const;

export type MockExamScoreVersion =
  | typeof CURRENT_PSC_MOCK_SCORE_VERSION
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
  componentNumber: PracticeComponentNumber;
  score: number;
}

export const CURRENT_PSC_MOCK_COMPONENTS: readonly MockExamComponent[] = [
  { number: 1, sourceComponentNumber: 1, name: "Monosyllabic Characters", chineseName: "读单音节字词", timeLimitSeconds: 210, points: 10 },
  { number: 2, sourceComponentNumber: 2, name: "Multisyllabic Words", chineseName: "读多音节词语", timeLimitSeconds: 150, points: 20 },
  { number: 3, sourceComponentNumber: 4, name: "Passage Reading", chineseName: "朗读短文", timeLimitSeconds: 240, points: 30 },
  { number: 4, sourceComponentNumber: 5, name: "Prompted Speaking", chineseName: "命题说话", timeLimitSeconds: 180, points: 40 },
];

export const LEGACY_FIVE_COMPONENTS: readonly MockExamComponent[] = [
  { number: 1, sourceComponentNumber: 1, name: "Monosyllabic Characters", chineseName: "读单音节字词", timeLimitSeconds: 210, points: 10 },
  { number: 2, sourceComponentNumber: 2, name: "Multisyllabic Words", chineseName: "读多音节词语", timeLimitSeconds: 150, points: 20 },
  { number: 3, sourceComponentNumber: 3, name: "Vocabulary & Grammar", chineseName: "选择判断", timeLimitSeconds: 180, points: 10 },
  { number: 4, sourceComponentNumber: 4, name: "Passage Reading", chineseName: "朗读短文", timeLimitSeconds: 240, points: 30 },
  { number: 5, sourceComponentNumber: 5, name: "Prompted Speaking", chineseName: "命题说话", timeLimitSeconds: 180, points: 30 },
];

export function getMockExamComponents(scoreVersion: MockExamScoreVersion): readonly MockExamComponent[] {
  return scoreVersion === CURRENT_PSC_MOCK_SCORE_VERSION
    ? CURRENT_PSC_MOCK_COMPONENTS
    : LEGACY_FIVE_COMPONENTS;
}

export function getMockExamComponent(
  scoreVersion: MockExamScoreVersion,
  componentNumber: number,
): MockExamComponent | undefined {
  return getMockExamComponents(scoreVersion).find((component) => component.number === componentNumber);
}

export function getMockExamComponentBySource(
  scoreVersion: MockExamScoreVersion,
  sourceComponentNumber: PracticeComponentNumber,
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
