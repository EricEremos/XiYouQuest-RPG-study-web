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
});
