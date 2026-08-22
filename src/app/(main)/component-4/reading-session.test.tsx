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

function renderReadingSession(
  source: { label: string; isSchoolProvided: boolean },
  options: { characterId?: string; lpNodeId?: string } = {},
) {
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
      characterId={options.characterId}
      component={4}
      lpNodeId={options.lpNodeId}
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

    renderReadingSession(
      {
        label: "School-provided practice source: PSC reading collection (2026-08)",
        isSchoolProvided: true,
      },
      { characterId: "6f00df0d-3790-4c5a-995e-68f63f3d7de8" },
    );

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

  it("retries only Learning Path completion after C4 progress has been recorded", async () => {
    vi.stubGlobal("speechSynthesis", { cancel: vi.fn() });
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "6f00df0d-3790-4c5a-995e-68f63f3d7de8") });
    fetchWithRetry
      .mockResolvedValueOnce(new Response(JSON.stringify({
        pronunciationScore: 80,
        words: [{ word: "这是练习内容", accuracyScore: 80, errorType: "none" }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ feedback: "Good reading." }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ newAchievements: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response("Learning Path unavailable", { status: 500 }))
      .mockResolvedValueOnce(new Response("", { status: 200 }));

    renderReadingSession(
      {
        label: "School-provided practice source: PSC reading collection (2026-08)",
        isSchoolProvided: true,
      },
      {
        characterId: "7f00df0d-3790-4c5a-995e-68f63f3d7de8",
        lpNodeId: "8f00df0d-3790-4c5a-995e-68f63f3d7de8",
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Practice passage: Test passage" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit C4 recording" }));

    await screen.findByRole("alert");
    expect(fetchWithRetry.mock.calls.filter(([url]) => url === "/api/progress/update")).toHaveLength(1);
    const progressRequest = fetchWithRetry.mock.calls.find(([url]) => url === "/api/progress/update");
    expect(progressRequest).toBeDefined();
    expect(JSON.parse(progressRequest![1].body as string)).toMatchObject({
      attemptId: "6f00df0d-3790-4c5a-995e-68f63f3d7de8",
    });

    fireEvent.click(screen.getByRole("button", { name: "Retry Saving Progress" }));

    await waitFor(() => {
      expect(fetchWithRetry.mock.calls.filter(([url]) => url === "/api/learning/node/complete")).toHaveLength(2);
    });
    expect(fetchWithRetry.mock.calls.filter(([url]) => url === "/api/progress/update")).toHaveLength(1);
  });
});
