import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getSessionUser, quickCompletion } = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  quickCompletion: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ getSessionUser }));
vi.mock("@/lib/gemini/client", () => ({ quickCompletion }));

import { POST } from "./route";

const currentComponentResults = [
  { componentNumber: 1, score: 100 },
  { componentNumber: 2, score: 80 },
  { componentNumber: 3, score: 60 },
  { componentNumber: 4, score: 40 },
];

function request(body: object) {
  return new NextRequest("https://preview.example.test/api/ai/mock-exam-feedback", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("mock exam feedback contract", () => {
  it("rejects a current PSC payload that includes a legacy-only component", async () => {
    getSessionUser.mockResolvedValue({ id: "verified-user" });

    const response = await POST(request({
      componentResults: [...currentComponentResults.slice(0, 3), { componentNumber: 5, score: 40 }],
      totalScore: 60,
      practiceBand: "Mastery",
      scoreVersion: "psc-2021-v1",
    }));

    expect(response.status).toBe(400);
    expect(quickCompletion).not.toHaveBeenCalled();
  });

  it("uses the contract-derived total and XiYouQuest practice band in feedback", async () => {
    getSessionUser.mockResolvedValue({ id: "verified-user" });
    quickCompletion.mockResolvedValue("feedback");

    const response = await POST(request({
      componentResults: currentComponentResults,
      totalScore: 60,
      practiceBand: "Mastery",
      scoreVersion: "psc-2021-v1",
    }));

    expect(response.status).toBe(200);
    expect(quickCompletion).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining("Total: 60/100, Practice band: Foundation"),
      500,
    );
  });
});
