import { describe, expect, it } from "vitest";
import { scopeOfficialReadingPassage } from "./reading-scope";

describe("scopeOfficialReadingPassage", () => {
  it("excludes parenthetical annotations and stops at the syllable limit", () => {
    const result = scopeOfficialReadingPassage("甲（注音）乙，丙丁。", 3);

    expect(result).toEqual({ text: "甲乙，丙", syllableCount: 3, truncated: true });
  });

  it("keeps punctuation without counting it as a syllable", () => {
    const result = scopeOfficialReadingPassage("甲，乙。", 400);

    expect(result).toEqual({ text: "甲，乙。", syllableCount: 2, truncated: false });
  });
});
