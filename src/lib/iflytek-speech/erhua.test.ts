import { describe, expect, it } from "vitest";
import { normalizeErhua } from "./client";

describe("normalizeErhua", () => {
  it("treats an erhua suffix as part of the preceding syllable", () => {
    expect(normalizeErhua("拐弯儿 花儿")).toBe("拐弯 花");
  });

  it("does not change a response where the optional suffix was omitted", () => {
    expect(normalizeErhua("拐弯 花")).toBe("拐弯 花");
  });

  it("preserves 儿 when it is an independent syllable", () => {
    expect(normalizeErhua("女儿 婴儿 儿童")).toBe("女儿 婴儿 儿童");
  });
});
