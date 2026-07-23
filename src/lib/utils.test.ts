import { describe, expect, it, vi } from "vitest";
import { randomizeAnswerPositions } from "@/lib/utils";

describe("randomizeAnswerPositions", () => {
  it("keeps answer order stable across server and client when given the same session seed", () => {
    const question = {
      id: "question-1",
      options: ["A", "B", "C", "D"],
      correctIndex: 2,
    };

    const random = vi
      .spyOn(Math, "random")
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.9)
      .mockReturnValueOnce(0.9)
      .mockReturnValueOnce(0.9);

    const serverRender = randomizeAnswerPositions(question, "quiz-session-42");
    const clientHydration = randomizeAnswerPositions(question, "quiz-session-42");

    expect(clientHydration).toEqual(serverRender);
    random.mockRestore();
  });
});
