import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ReadingSession } from "./reading-session";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/character/character-display", () => ({
  CharacterDisplay: () => <div />,
}));

vi.mock("@/components/character/dialogue-box", () => ({
  DialogueBox: () => <div />,
}));

vi.mock("@/components/practice/audio-recorder", () => ({
  AudioRecorder: () => <div />,
}));

vi.mock("@/components/shared/achievement-toast", () => ({
  useAchievementToast: () => ({ showAchievementToasts: vi.fn() }),
}));

vi.mock("@/components/shared/audio-settings", () => ({
  useAudioSettings: () => ({
    applyTtsVolume: vi.fn(),
    applyUtteranceVolume: vi.fn(),
  }),
}));

vi.mock("@/lib/dialogue", () => ({
  getDialogue: () => "Practice guidance",
}));

vi.mock("@/lib/fetch-retry", () => ({
  fetchWithRetry: vi.fn(),
}));

vi.mock("@/lib/gamification/xp", () => ({
  calculateXP: () => ({ totalXP: 0 }),
}));

const character = {
  name: "Test companion",
  personalityPrompt: "",
  voiceId: "",
  expressions: {},
};

function renderReadingSession(source: { label: string; isSchoolProvided: boolean }) {
  return render(
    <ReadingSession
      passages={[
        {
          id: "passage-1",
          title: "Test passage",
          content: "这是练习内容。",
          passageNumber: null,
          syllableCount: 6,
          source,
        },
      ]}
      character={character}
      component={4}
    />,
  );
}

describe("ReadingSession provenance label", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps a complete school-provided source label visible after a learner selects the passage", () => {
    vi.stubGlobal("speechSynthesis", { cancel: vi.fn() });

    renderReadingSession({
      label: "School-provided practice source: PSC reading collection (2026-08)",
      isSchoolProvided: true,
    });

    const sourceLabel = "School-provided practice source: PSC reading collection (2026-08)";
    expect(screen.getAllByText(sourceLabel)).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Practice passage: Test passage" }));

    expect(screen.getByRole("heading", { name: "Test passage" })).toBeInTheDocument();
    expect(screen.getByText(sourceLabel)).toBeInTheDocument();
  });

  it("renders the non-official XiYouQuest fallback when provenance is incomplete", () => {
    vi.stubGlobal("speechSynthesis", { cancel: vi.fn() });

    renderReadingSession({
      label: "XiYouQuest practice passage — source record pending; not an official PSC reading text.",
      isSchoolProvided: false,
    });

    expect(
      screen.getByText("XiYouQuest practice passage — source record pending; not an official PSC reading text."),
    ).toBeInTheDocument();
  });
});
