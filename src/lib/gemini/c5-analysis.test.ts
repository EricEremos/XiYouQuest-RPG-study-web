import { describe, expect, it } from "vitest";
import { parseC5Analysis } from "./client";

const validAnalysis = JSON.stringify({
  vocabularyLevel: 1,
  vocabularyNotes: "Clear standard vocabulary.",
  fluencyLevel: 2,
  fluencyNotes: "A few pauses but coherent delivery.",
  contentRelevance: "The response stays on topic.",
});

describe("parseC5Analysis", () => {
  it("returns a complete valid practice analysis", () => {
    expect(parseC5Analysis(validAnalysis)).toEqual({
      vocabularyLevel: 1,
      vocabularyNotes: "Clear standard vocabulary.",
      fluencyLevel: 2,
      fluencyNotes: "A few pauses but coherent delivery.",
      contentRelevance: "The response stays on topic.",
    });
  });

  it("rejects missing or out-of-range assessment fields", () => {
    expect(() => parseC5Analysis(JSON.stringify({
      vocabularyLevel: 4,
      vocabularyNotes: "Clear standard vocabulary.",
      fluencyLevel: 2,
      fluencyNotes: "A few pauses but coherent delivery.",
      contentRelevance: "The response stays on topic.",
    }))).toThrow("Invalid C5 analysis level");

    expect(() => parseC5Analysis(JSON.stringify({
      vocabularyLevel: 1,
      vocabularyNotes: "",
      fluencyLevel: 2,
      fluencyNotes: "A few pauses but coherent delivery.",
      contentRelevance: "The response stays on topic.",
    }))).toThrow("Invalid C5 analysis field: vocabularyNotes");
  });

  it("rejects unexpected fields instead of accepting model narrative", () => {
    expect(() => parseC5Analysis(JSON.stringify({
      ...JSON.parse(validAnalysis),
      officialScore: 30,
    }))).toThrow("Invalid C5 analysis fields");

    expect(() => parseC5Analysis(`Model output:\n${validAnalysis}`)).toThrow();
  });
});
