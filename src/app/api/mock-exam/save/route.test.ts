import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { createClient, getSessionUser } = vi.hoisted(() => ({
  createClient: vi.fn(),
  getSessionUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient, getSessionUser }));

import { POST } from "./route";

const currentComponentScores = [
  { componentNumber: 1, score: 100, points: 0 },
  { componentNumber: 2, score: 80, points: 0 },
  { componentNumber: 3, score: 60, points: 0 },
  { componentNumber: 4, score: 40, points: 0 },
];

function request(body: object) {
  return new NextRequest("https://preview.example.test/api/mock-exam/save", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("mock exam result persistence", () => {
  it("rejects a current result with a legacy-only component before it reaches Supabase", async () => {
    const insert = vi.fn();
    createClient.mockResolvedValue({ from: vi.fn(() => ({ insert })) });
    getSessionUser.mockResolvedValue({ id: "verified-user" });

    const response = await POST(request({
      totalScore: 60,
      practiceBand: "Mastery",
      scoreVersion: "psc-2021-v1",
      componentScores: [...currentComponentScores.slice(0, 3), { componentNumber: 5, score: 40, points: 0 }],
      durationSeconds: 600,
      totalXp: 10,
    }));

    expect(response.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });

  it("derives persisted points, total, and practice band from the selected PSC contract", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: "saved-result" }, error: null });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    createClient.mockResolvedValue({ from: vi.fn(() => ({ insert })) });
    getSessionUser.mockResolvedValue({ id: "verified-user" });

    const response = await POST(request({
      totalScore: 60,
      practiceBand: "Mastery",
      scoreVersion: "psc-2021-v1",
      componentScores: currentComponentScores,
      durationSeconds: 600,
      totalXp: 10,
    }));

    expect(response.status).toBe(200);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      total_score: 60,
      grade: "Foundation",
      component_scores: [
        { componentNumber: 1, score: 100, points: 10, scoreVersion: "psc-2021-v1" },
        { componentNumber: 2, score: 80, points: 16, scoreVersion: "psc-2021-v1" },
        { componentNumber: 3, score: 60, points: 18, scoreVersion: "psc-2021-v1" },
        { componentNumber: 4, score: 40, points: 16, scoreVersion: "psc-2021-v1" },
      ],
    }));
  });
});
