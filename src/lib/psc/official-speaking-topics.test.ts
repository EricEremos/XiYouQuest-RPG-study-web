import { describe, expect, it } from "vitest";
import {
  getSupplementarySpeakingTopics,
  OFFICIAL_PSC_SPEAKING_TOPICS,
  OFFICIAL_PSC_SPEAKING_TOPICS_METADATA,
} from "./official-speaking-topics";
import { OFFICIAL_PSC_SPEAKING_TOPICS as EDGE_OFFICIAL_PSC_SPEAKING_TOPICS } from "../../../supabase/functions/_shared/official-speaking-topics";

describe("official PSC speaking topics", () => {
  it("keeps the official bank at exactly 50 unique topics", () => {
    expect(OFFICIAL_PSC_SPEAKING_TOPICS).toHaveLength(50);
    expect(new Set(OFFICIAL_PSC_SPEAKING_TOPICS).size).toBe(50);
  });

  it("pins the controlled bank to its effective public-source revision", () => {
    expect(OFFICIAL_PSC_SPEAKING_TOPICS_METADATA).toEqual({
      version: "psc-speaking-topics-2024-01-01",
      effectiveFrom: "2024-01-01",
      sourceUrl: "https://www.xjbz.gov.cn/xjbz/c101441/202309/67e808035ee44f4bbf71e51ba00c0a91.shtml",
      sourceTitle: "普通话水平测试用话题50则〖2024年1月1日起使用〗",
    });
  });

  it("keeps the Edge assessment topic bank identical to the application bank", () => {
    expect(EDGE_OFFICIAL_PSC_SPEAKING_TOPICS).toEqual(OFFICIAL_PSC_SPEAKING_TOPICS);
  });

  it("separates non-official database topics as supplementary practice", () => {
    expect(
      getSupplementarySpeakingTopics([
        OFFICIAL_PSC_SPEAKING_TOPICS[0],
        "我的校园生活",
        "我的校园生活",
      ])
    ).toEqual(["我的校园生活"]);
  });
});
