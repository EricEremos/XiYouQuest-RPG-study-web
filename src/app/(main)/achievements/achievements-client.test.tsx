import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AchievementsClient } from "./achievements-client";

describe("AchievementsClient", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ feed: [] }),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the rendered catalog size for the total and tier summaries", () => {
    render(
      <AchievementsClient
        achievements={[
          {
            id: "a1",
            key: "first",
            name: "First",
            description: "First achievement",
            emoji: "1",
            tier: "common",
            sort_order: 1,
          },
          {
            id: "a2",
            key: "second",
            name: "Second",
            description: "Second achievement",
            emoji: "2",
            tier: "rare",
            sort_order: 2,
          },
        ]}
        userAchievements={[]}
      />,
    );

    expect(screen.getByText("0 / 2")).toBeInTheDocument();
    expect(screen.getByText("0/1 Common")).toBeInTheDocument();
    expect(screen.getByText("0/1 Rare")).toBeInTheDocument();
  });
});
