import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IntroScreen } from "./intro-screen";
import { StoryScreen } from "./story-screen";

afterEach(cleanup);

describe("quest narrative controls", () => {
  it("provides an explicit keyboard-focusable control while the introduction is advancing", () => {
    render(<IntroScreen onComplete={vi.fn()} />);

    const continueButton = screen.getByRole("button", {
      name: /continue story/i,
    });
    expect(continueButton).toBeVisible();

    fireEvent.click(continueButton);
    expect(
      screen.getByRole("button", { name: /continue story/i }),
    ).toBeVisible();
  });

  it("provides an explicit keyboard-focusable control while a stage story is advancing", () => {
    render(
      <StoryScreen stage={1} onContinue={vi.fn()} onBack={vi.fn()} />,
    );

    expect(
      screen.getByRole("button", { name: /continue story/i }),
    ).toBeVisible();
  });
});
