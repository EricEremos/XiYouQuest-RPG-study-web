import { describe, expect, it } from "vitest";

import { checkRateLimit } from "./rate-limit";

describe("checkRateLimit", () => {
  it("allows requests up to the limit inside one window", () => {
    const key = "test:allows-up-to-limit";
    expect(checkRateLimit(key, 3, 60_000, 1_000)).toBe(true);
    expect(checkRateLimit(key, 3, 60_000, 1_001)).toBe(true);
    expect(checkRateLimit(key, 3, 60_000, 1_002)).toBe(true);
    expect(checkRateLimit(key, 3, 60_000, 1_003)).toBe(false);
  });

  it("resets the budget after the window elapses", () => {
    const key = "test:resets-after-window";
    expect(checkRateLimit(key, 1, 60_000, 1_000)).toBe(true);
    expect(checkRateLimit(key, 1, 60_000, 2_000)).toBe(false);
    expect(checkRateLimit(key, 1, 60_000, 61_001)).toBe(true);
  });

  it("tracks keys independently", () => {
    expect(checkRateLimit("test:key-a", 1, 60_000, 1_000)).toBe(true);
    expect(checkRateLimit("test:key-b", 1, 60_000, 1_000)).toBe(true);
    expect(checkRateLimit("test:key-a", 1, 60_000, 1_001)).toBe(false);
  });

  it("hard-bounds tracked keys by pruning and evicting the oldest windows", () => {
    const now = 5_000;
    expect(checkRateLimit("evict:0", 1, 60_000, now)).toBe(true);
    expect(checkRateLimit("evict:0", 1, 60_000, now + 1)).toBe(false);

    // Fill the tracker past its capacity with live windows; the oldest
    // entries (including evict:0) are pruned or evicted along the way.
    for (let index = 1; index <= 10_000; index += 1) {
      checkRateLimit(`evict:${index}`, 1, 60_000, now + 2);
    }

    // The evicted key restarts its window instead of staying blocked.
    expect(checkRateLimit("evict:0", 1, 60_000, now + 3)).toBe(true);
  });
});
