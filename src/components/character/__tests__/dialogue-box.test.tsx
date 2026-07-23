import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DialogueBox } from "../dialogue-box";

afterEach(() => {
  cleanup();
});

describe("DialogueBox", () => {
  it("renders the character name", () => {
    render(<DialogueBox text="Hello!" characterName="Sun Wukong (孙悟空)" />);
    expect(screen.getByText("Sun Wukong (孙悟空)")).toBeInTheDocument();
  });

  it("shows the full text immediately", () => {
    render(<DialogueBox text="Hello world!" characterName="Sun Wukong (孙悟空)" />);
    expect(screen.getByText("Hello world!")).toBeInTheDocument();
  });

  it("shows the full text immediately even when legacy typing props are passed", () => {
    render(
      <DialogueBox
        text="Hello world!"
        characterName="Sun Wukong (孙悟空)"
        isTyping={true}
        typingSpeed={50}
      />
    );
    expect(screen.getByText("Hello world!")).toBeInTheDocument();
    // No typewriter artifacts: neither a Skip control nor a cursor underscore.
    expect(screen.queryByText(/Skip/)).not.toBeInTheDocument();
    expect(screen.queryByText("_")).not.toBeInTheDocument();
  });

  it("announces dialogue changes politely from a stable live region", () => {
    render(<DialogueBox text="New line" characterName="Sun Wukong (孙悟空)" />);
    const liveRegion = screen.getByText("New line").closest("[aria-live]");
    expect(liveRegion).not.toBeNull();
    expect(liveRegion).toHaveAttribute("aria-live", "polite");
  });
});
