import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReadingSession } from "./reading-session";

const { fetchWithRetry } = vi.hoisted(() => ({ fetchWithRetry: vi.fn() }));

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
  AudioRecorder: ({ onRecordingComplete }: { onRecordingComplete: (audio: Blob) => void }) => (
    <button type="button" onClick={() => onRecordingComplete(new Blob(["audio"]))}>
      Submit C4 recording
    </button>
  ),
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
  fetchWithRetry,
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
  beforeEach(() => {
    fetchWithRetry.mockReset();
  });

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

  it("does not save progress after a malformed successful C4 assessment response", async () => {
    vi.stubGlobal("speechSynthesis", { cancel: vi.fn() });
    fetchWithRetry.mockResolvedValue(
      new Response(JSON.stringify({ pronunciationScore: 120, words: [] }), { status: 200 }),
    );

    renderReadingSession({
      label: "School-provided practice source: PSC reading collection (2026-08)",
      isSchoolProvided: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "Practice passage: Test passage" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit C4 recording" }));

    await waitFor(() => expect(fetchWithRetry).toHaveBeenCalledOnce());
    expect(fetchWithRetry).not.toHaveBeenCalledWith(
      "/api/progress/update",
      expect.anything(),
    );
  });
});
