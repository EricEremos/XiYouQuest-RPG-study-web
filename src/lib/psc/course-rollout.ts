export const SCHOOL_PROVIDED_PUBLIC_USE = "school_provided_public_use" as const;

export type CourseId = "LANG1511" | "LANG1512" | "LANG1513" | "LANG1514" | "LANG1515";

export type CourseRolloutRecord = {
  courseId: CourseId;
  sourceScope: typeof SCHOOL_PROVIDED_PUBLIC_USE;
  sourceFiles: readonly string[];
  sourceTerm: "Fall 2026" | "Spring 2026";
  weeklyRows: number;
  objectives: number;
  vocabularyRows: number;
  grammarRows: number;
  learnerContentStatus: "REVIEW_HOLD_NOT_IMPORTABLE";
  learnerContentDisposition: "metadata_candidates_only" | "unavailable";
  holds: readonly string[];
  textbookCandidates?: number;
  teacherListCandidates?: number;
  unavailableLessons?: readonly number[];
};

export const COURSE_ROLLOUT_RECORDS: readonly CourseRolloutRecord[] = [
  {
    courseId: "LANG1511",
    sourceScope: SCHOOL_PROVIDED_PUBLIC_USE,
    sourceFiles: [
      "Syllabus-LANG1511-Fall2026.pdf",
      "LANG1511_Teacher_Content_Review_R7_teacher-clean-current.xlsx",
    ],
    sourceTerm: "Fall 2026",
    weeklyRows: 13,
    objectives: 105,
    vocabularyRows: 301,
    grammarRows: 74,
    learnerContentStatus: "REVIEW_HOLD_NOT_IMPORTABLE",
    learnerContentDisposition: "metadata_candidates_only",
    holds: ["recorded_teacher_decisions", "four_lexical_holds"],
  },
  {
    courseId: "LANG1512",
    sourceScope: SCHOOL_PROVIDED_PUBLIC_USE,
    sourceFiles: [
      "Syllabus-LANG1512-Spring2026.pdf",
      "LANG1512_Teacher_Content_Review_R13_teacher-semantic-final.xlsx",
    ],
    sourceTerm: "Spring 2026",
    weeklyRows: 13,
    objectives: 53,
    vocabularyRows: 219,
    grammarRows: 58,
    learnerContentStatus: "REVIEW_HOLD_NOT_IMPORTABLE",
    learnerContentDisposition: "metadata_candidates_only",
    holds: ["fall_term_applicability", "lesson_17_18_sequence", "academic_mapping_review"],
  },
  {
    courseId: "LANG1513",
    sourceScope: SCHOOL_PROVIDED_PUBLIC_USE,
    sourceFiles: [
      "Syllabus-LANG1513-Spring2026.pdf",
      "LANG1513_Teacher_Content_Review_R1.xlsx",
    ],
    sourceTerm: "Spring 2026",
    weeklyRows: 13,
    objectives: 49,
    vocabularyRows: 222,
    grammarRows: 39,
    learnerContentStatus: "REVIEW_HOLD_NOT_IMPORTABLE",
    learnerContentDisposition: "metadata_candidates_only",
    holds: ["fall_term_applicability", "teacher_review", "no_course_equivalence_claim"],
  },
  {
    courseId: "LANG1514",
    sourceScope: SCHOOL_PROVIDED_PUBLIC_USE,
    sourceFiles: [
      "Syllabus-LANG1514-Spring2026.pdf",
      "LANG1514_Teacher_Content_Review_R6_teacher-semantic-office-online.xlsx",
      "02_Vocabulary_LANG1514.xlsx",
    ],
    sourceTerm: "Spring 2026",
    weeklyRows: 13,
    objectives: 49,
    vocabularyRows: 217,
    grammarRows: 29,
    learnerContentStatus: "REVIEW_HOLD_NOT_IMPORTABLE",
    learnerContentDisposition: "metadata_candidates_only",
    textbookCandidates: 248,
    teacherListCandidates: 389,
    holds: ["candidate_source_comparison", "fall_term_applicability", "academic_approval"],
  },
  {
    courseId: "LANG1515",
    sourceScope: SCHOOL_PROVIDED_PUBLIC_USE,
    sourceFiles: ["LANG1515_Teacher_Content_Review_R1.xlsx"],
    sourceTerm: "Spring 2026",
    weeklyRows: 13,
    objectives: 6,
    vocabularyRows: 135,
    grammarRows: 23,
    learnerContentStatus: "REVIEW_HOLD_NOT_IMPORTABLE",
    learnerContentDisposition: "unavailable",
    unavailableLessons: [6, 12, 14, 16, 21, 22],
    holds: ["missing_approved_lessons", "fall_term_applicability", "teacher_review"],
  },
];

export function getCourseRolloutRecord(courseId: CourseId): CourseRolloutRecord {
  const record = COURSE_ROLLOUT_RECORDS.find((candidate) => candidate.courseId === courseId);
  if (!record) {
    throw new Error(`Unknown XiYouQuest course rollout record: ${courseId}`);
  }
  return record;
}

export function isCourseLearnerContentImportable(courseId: CourseId): boolean {
  return getCourseRolloutRecord(courseId).learnerContentStatus !== "REVIEW_HOLD_NOT_IMPORTABLE";
}
