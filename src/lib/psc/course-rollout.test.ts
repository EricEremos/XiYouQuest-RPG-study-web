import { describe, expect, it } from "vitest";

import {
  COURSE_ROLLOUT_RECORDS,
  getCourseRolloutRecord,
  isCourseLearnerContentImportable,
  SCHOOL_PROVIDED_PUBLIC_USE,
} from "./course-rollout";

describe("school course rollout registry", () => {
  it("records all supplied courses as school-public-use curriculum evidence without importing learner content", () => {
    expect(COURSE_ROLLOUT_RECORDS.map((record) => record.courseId)).toEqual([
      "LANG1511",
      "LANG1512",
      "LANG1513",
      "LANG1514",
      "LANG1515",
    ]);

    for (const record of COURSE_ROLLOUT_RECORDS) {
      expect(record.sourceScope).toBe(SCHOOL_PROVIDED_PUBLIC_USE);
      expect(record.sourceFiles.length).toBeGreaterThan(0);
      expect(record.learnerContentStatus).toBe("REVIEW_HOLD_NOT_IMPORTABLE");
      expect(isCourseLearnerContentImportable(record.courseId)).toBe(false);
    }
  });

  it("retains the LANG1514 candidate-review boundary", () => {
    expect(getCourseRolloutRecord("LANG1514")).toMatchObject({
      sourceTerm: "Spring 2026",
      vocabularyRows: 217,
      textbookCandidates: 248,
      teacherListCandidates: 389,
      learnerContentDisposition: "metadata_candidates_only",
    });
  });

  it("makes LANG1515's missing lessons unavailable rather than substituting content", () => {
    expect(getCourseRolloutRecord("LANG1515")).toMatchObject({
      learnerContentDisposition: "unavailable",
      unavailableLessons: [6, 12, 14, 16, 21, 22],
    });
  });
});
