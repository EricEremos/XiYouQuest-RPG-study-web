import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
const { mockGetUserMedia, mockSetLearningActive, mockFetchWithRetry } = vi.hoisted(() => ({
  mockGetUserMedia: vi.fn(),
  mockSetLearningActive: vi.fn(),
  mockFetchWithRetry: vi.fn(),
}));

import { SpeakingSession } from "./speaking-session";

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

vi.mock("@/components/shared/achievement-toast", () => ({
  useAchievementToast: () => ({ showAchievementToasts: vi.fn() }),
}));

vi.mock("@/components/shared/bgm-provider", () => ({
  useBGM: () => ({ setLearningActive: mockSetLearningActive }),
}));

vi.mock("@/lib/dialogue", () => ({
  getDialogue: () => "Practice guidance",
}));

vi.mock("@/lib/fetch-retry", () => ({
  fetchWithRetry: mockFetchWithRetry,
}));

vi.mock("@/lib/gamification/xp", () => ({
  calculateXP: () => ({ totalXP: 0 }),
}));

vi.mock("@/lib/speaking-guides", () => ({
  getSpeakingGuide: () => ({ label: "Guide", template: "Practice structure", tips: [] }),
}));

vi.mock("@/lib/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/utils")>()),
  shuffle: <T,>(items: T[]) => items,
}));

function installAudioContextMock() {
  globalThis.AudioContext = vi.fn(function MockAudioContext() {
    return {
      state: "running",
      close: vi.fn(),
      destination: {},
      createMediaStreamSource: vi.fn(() => ({ connect: vi.fn() })),
      createAnalyser: vi.fn(() => ({
        fftSize: 256,
        getByteTimeDomainData: vi.fn(),
        connect: vi.fn(),
      })),
      createScriptProcessor: vi.fn(() => ({
        onaudioprocess: null,
        connect: vi.fn(),
      })),
      createGain: vi.fn(() => ({
        gain: { value: 0 },
        connect: vi.fn(),
      })),
    };
  }) as unknown as typeof AudioContext;
}

describe("SpeakingSession", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      value: { getUserMedia: mockGetUserMedia },
      writable: true,
      configurable: true,
    });
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    installAudioContextMock();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("automatically stops and submits assessment at the three-minute limit", async () => {
    const stopTrack = vi.fn();
    mockGetUserMedia.mockResolvedValue({
      getTracks: () => [{ stop: stopTrack }],
    });
    mockFetchWithRetry.mockResolvedValue({ ok: false, status: 503 });

    render(
      <SpeakingSession
        topics={["Test topic"]}
        character={{
          name: "Test companion",
          personalityPrompt: "",
          voiceId: "",
          expressions: {},
        }}
        component={5}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Speak about: Test topic" }));
    fireEvent.click(screen.getByRole("button", { name: "Start Speaking" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(screen.getByRole("button", { name: "Stop Recording" })).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(180_000);
    });

    expect(stopTrack).toHaveBeenCalledOnce();
    expect(screen.getByText("Assessment data unavailable. Please try again.")).toBeTruthy();
    expect(mockSetLearningActive).toHaveBeenLastCalledWith(false);
  });
});
