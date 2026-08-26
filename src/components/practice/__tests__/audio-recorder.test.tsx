import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { AudioRecorder } from "../audio-recorder";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// Mock navigator.mediaDevices
const mockGetUserMedia = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(globalThis.navigator, "mediaDevices", {
    value: { getUserMedia: mockGetUserMedia },
    writable: true,
    configurable: true,
  });
});

// Mock AudioContext
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
    sampleRate: 16000,
  };
}) as unknown as typeof AudioContext;

describe("AudioRecorder", () => {
  const mockOnComplete = vi.fn();

  it("renders start recording button", () => {
    const { container } = render(<AudioRecorder onRecordingComplete={mockOnComplete} />);
    const button = container.querySelector("button");
    expect(button).toBeTruthy();
    expect(button?.textContent).toContain("Start Recording");
  });

  it("disables button when disabled prop is true", () => {
    const { container } = render(<AudioRecorder onRecordingComplete={mockOnComplete} disabled={true} />);
    const button = container.querySelector("button");
    expect(button?.disabled).toBe(true);
  });

  it("button has correct aria-label", () => {
    const { container } = render(<AudioRecorder onRecordingComplete={mockOnComplete} />);
    const button = container.querySelector('button[aria-label="Start recording"]');
    expect(button).toBeTruthy();
  });

  it("stops automatically at the configured recording limit", async () => {
    vi.useFakeTimers();
    const stopTrack = vi.fn();
    mockGetUserMedia.mockResolvedValue({
      getTracks: () => [{ stop: stopTrack }],
    });
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const { getByRole, getByText } = render(
      <AudioRecorder
        onRecordingComplete={mockOnComplete}
        maxDurationSeconds={180}
      />,
    );

    fireEvent.click(getByRole("button", { name: "Start recording" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(getByText("180 seconds remaining")).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(180_000);
    });

    expect(mockOnComplete).toHaveBeenCalledOnce();
    expect(stopTrack).toHaveBeenCalledOnce();
  });
});
