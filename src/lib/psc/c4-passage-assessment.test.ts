import { describe, expect, it, vi } from "vitest";
import { assessC4Passage } from "./c4-passage-assessment";

describe("assessC4Passage", () => {
  it("propagates an unavailable assessment instead of manufacturing a zero score", async () => {
    const requestAssessment = vi.fn().mockRejectedValue(new Error("Assessment failed (503)"));

    await expect(
      assessC4Passage(new Blob(["audio"]), "第一句。第二句。", requestAssessment),
    ).rejects.toThrow("Assessment failed (503)");
  });

  it("returns sentence scores only from a successful assessment response", async () => {
    const result = await assessC4Passage(
      new Blob(["audio"]),
      "你好。再见。",
      vi.fn().mockResolvedValue({
        pronunciationScore: 80,
        words: [
          { word: "你好", accuracyScore: 90, errorType: "none" },
          { word: "再见", accuracyScore: 70, errorType: "none" },
        ],
      }),
    );

    expect(result).toMatchObject({
      score: 80,
      sentenceScores: [
        { sentence: "你好。", score: 90 },
        { sentence: "再见。", score: 70 },
      ],
    });
  });

  it("uses authoritative sentence scores and never renders zeroes for an empty word list", async () => {
    const withAuthoritativeSentences = await assessC4Passage(
      new Blob(["audio"]),
      "你好。再见。",
      vi.fn().mockResolvedValue({
        pronunciationScore: 80,
        words: [],
        sentences: [
          { content: "你好。", score: 91 },
          { content: "再见。", score: 69 },
        ],
      }),
    );
    const withoutSentenceDetails = await assessC4Passage(
      new Blob(["audio"]),
      "你好。再见。",
      vi.fn().mockResolvedValue({ pronunciationScore: 80, words: [] }),
    );

    expect(withAuthoritativeSentences.sentenceScores).toEqual([
      { sentence: "你好。", score: 91 },
      { sentence: "再见。", score: 69 },
    ]);
    expect(withoutSentenceDetails.sentenceScores).toEqual([
      { sentence: "你好。", score: 80 },
      { sentence: "再见。", score: 80 },
    ]);
  });

  it("rejects a malformed successful response instead of recording an untrusted score", async () => {
    await expect(
      assessC4Passage(
        new Blob(["audio"]),
        "你好。",
        vi.fn().mockResolvedValue({
          pronunciationScore: 120,
          words: [],
        }),
      ),
    ).rejects.toThrow("Invalid C4 assessment response");
  });
});
