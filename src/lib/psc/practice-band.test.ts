import { describe, expect, it } from "vitest";
import {
  getXiYouQuestPracticeBand,
  XIYOUQUEST_PRACTICE_BAND_METADATA,
} from "./practice-band";

describe("XiYouQuest practice bands", () => {
  it("uses an application-owned, versioned scale at every boundary", () => {
    expect(XIYOUQUEST_PRACTICE_BAND_METADATA).toEqual({
      version: "xiyouquest-practice-band-v1",
      label: "XiYouQuest practice band",
    });
    expect(getXiYouQuestPracticeBand(97).label).toBe("Mastery");
    expect(getXiYouQuestPracticeBand(92).label).toBe("Advanced");
    expect(getXiYouQuestPracticeBand(87).label).toBe("Strong");
    expect(getXiYouQuestPracticeBand(80).label).toBe("Proficient");
    expect(getXiYouQuestPracticeBand(70).label).toBe("Developing");
    expect(getXiYouQuestPracticeBand(60).label).toBe("Foundation");
    expect(getXiYouQuestPracticeBand(59.9).label).toBe("Starting point");
  });
});
