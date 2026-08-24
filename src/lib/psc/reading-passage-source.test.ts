import { describe, expect, it } from "vitest";
import {
  getReadingPassageSource,
  XIYOUQUEST_ORIGINAL_READING_SOURCE,
} from "./reading-passage-source";

describe("Component 4 reading-passage provenance", () => {
  it("labels an explicitly versioned school source as school-provided practice", () => {
    expect(
      getReadingPassageSource({
        source_scope: "school_provided_public_use",
        source_title: "PSC reading collection",
        source_version: "2026-08",
      }),
    ).toEqual({
      label: "School-provided practice source: PSC reading collection (2026-08)",
      isSchoolProvided: true,
    });
  });

  it("does not infer school approval from partial or unknown metadata", () => {
    expect(
      getReadingPassageSource({ source_scope: "school_provided_public_use", source_title: "PSC reading collection" }),
    ).toEqual({
      label: "XiYouQuest practice passage — source record pending; not an official PSC reading text.",
      isSchoolProvided: false,
    });
  });

  it("keeps fallback content visibly XiYouQuest-owned practice", () => {
    expect(XIYOUQUEST_ORIGINAL_READING_SOURCE).toEqual({
      label: "XiYouQuest original practice passage — not an official PSC reading text.",
      isSchoolProvided: false,
    });
  });
});
