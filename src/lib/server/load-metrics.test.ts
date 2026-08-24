import { afterEach, describe, expect, it, vi } from "vitest";

import { measureServerQuery } from "./load-metrics";

describe("measureServerQuery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records a duration and success metadata when a server query succeeds", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const result = await measureServerQuery("MainQuest.quest_progress", Promise.resolve({ error: null }));

    expect(result).toMatchObject({ result: { error: null } });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(info).toHaveBeenCalledWith("[LoadMetric] MainQuest.quest_progress succeeded", {
      durationMs: expect.any(Number),
    });
  });

  it("records a duration and safe error metadata when a server query returns an error", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await measureServerQuery(
      "Characters.profile",
      Promise.resolve({ error: { code: "PGRST116", message: "profile unavailable" } })
    );

    expect(result).toMatchObject({
      result: { error: { code: "PGRST116", message: "profile unavailable" } },
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(error).toHaveBeenCalledWith("[LoadMetric] Characters.profile failed", {
      durationMs: expect.any(Number),
      code: "PGRST116",
    });
  });
});
