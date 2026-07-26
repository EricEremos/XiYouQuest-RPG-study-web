import { beforeEach, describe, expect, it, vi } from "vitest";

const webSocketState = vi.hoisted(() => ({
  instances: [] as Array<{
    emit: (event: string, ...args: unknown[]) => void;
    sent: string[];
  }>,
}));

vi.mock("@/lib/env", () => ({
  IFLYTEK_APP_ID: () => "test-app-id",
  IFLYTEK_API_KEY: () => "test-api-key",
  IFLYTEK_API_SECRET: () => "test-api-secret",
}));

vi.mock("ws", () => {
  class MockWebSocket {
    static OPEN = 1;
    readyState = MockWebSocket.OPEN;
    bufferedAmount = 0;
    sent: string[] = [];
    private handlers = new Map<
      string,
      Array<(...args: unknown[]) => void>
    >();

    constructor() {
      webSocketState.instances.push(this);
    }

    on(event: string, handler: (...args: unknown[]) => void) {
      const handlers = this.handlers.get(event) ?? [];
      handlers.push(handler);
      this.handlers.set(event, handlers);
    }

    emit(event: string, ...args: unknown[]) {
      for (const handler of this.handlers.get(event) ?? []) {
        handler(...args);
      }
    }

    send(payload: string) {
      this.sent.push(payload);
      const frame = JSON.parse(payload);
      if (frame.data.status === 2) {
        this.emit(
          "message",
          Buffer.from(JSON.stringify({ code: 0, data: { status: 2 } })),
        );
      }
    }

    close() {
      this.readyState = 3;
    }
  }

  return { default: MockWebSocket };
});

import {
  ASR_MAX_PCM_BYTES as NODE_ASR_MAX_PCM_BYTES,
  calculateAsrTimeoutMs as calculateNodeAsrTimeoutMs,
  transcribeAudio as transcribeNodeAudio,
} from "./asr-client";
import {
  ASR_FRAME_INTERVAL_MS,
  ASR_MAX_PCM_BYTES as EDGE_ASR_MAX_PCM_BYTES,
  calculateAsrTimeoutMs as calculateEdgeAsrTimeoutMs,
  createAsrAudioFrames,
} from "../../../supabase/functions/_shared/iflytek-asr-frames";

describe("iFLYTEK ASR streaming protocol", () => {
  beforeEach(() => {
    webSocketState.instances.length = 0;
  });

  it("streams a short Companion recording in 1,280-byte frames and sends the mandatory final frame", () => {
    const frames = createAsrAudioFrames(new Uint8Array(6_400));
    const statuses = frames.map((frame) => frame.status);
    const audioByteLengths = frames
      .filter((frame) => frame.status !== 2)
      .map((frame) => frame.audio.byteLength);

    expect(statuses[0]).toBe(0);
    expect(statuses.at(-1)).toBe(2);
    expect(statuses.slice(1, -1)).toEqual(
      Array(statuses.length - 2).fill(1),
    );
    expect(Math.max(...audioByteLengths)).toBeLessThanOrEqual(1_280);
    expect(ASR_FRAME_INTERVAL_MS).toBe(40);
  });

  it.each([
    [1, [0, 2], [1]],
    [1_280, [0, 2], [1_280]],
    [1_281, [0, 1, 2], [1_280, 1]],
  ])(
    "preserves first/final states at the %i-byte boundary",
    (byteLength, expectedStatuses, expectedAudioByteLengths) => {
      const frames = createAsrAudioFrames(new Uint8Array(byteLength));

      expect(frames.map((frame) => frame.status)).toEqual(expectedStatuses);
      expect(
        frames
          .filter((frame) => frame.status !== 2)
          .map((frame) => frame.audio.byteLength),
      ).toEqual(expectedAudioByteLengths);
    },
  );

  it("budgets enough time to stream a three-minute C5 recording in both runtimes", () => {
    const pcmByteLength = 180 * 32_000;
    const terminalFrameOffsetMs =
      Math.ceil(pcmByteLength / 1_280) * ASR_FRAME_INTERVAL_MS;
    const nodeTimeoutMs = calculateNodeAsrTimeoutMs(pcmByteLength);
    const edgeTimeoutMs = calculateEdgeAsrTimeoutMs(pcmByteLength);

    expect(nodeTimeoutMs).toBeGreaterThan(terminalFrameOffsetMs);
    expect(edgeTimeoutMs).toBe(nodeTimeoutMs);
    expect(EDGE_ASR_MAX_PCM_BYTES).toBe(NODE_ASR_MAX_PCM_BYTES);
  });

  it("rejects empty and over-limit PCM before opening a WebSocket", () => {
    expect(() => calculateNodeAsrTimeoutMs(0)).toThrow("empty PCM");
    expect(() => calculateEdgeAsrTimeoutMs(0)).toThrow("empty PCM");
    expect(() => createAsrAudioFrames(new Uint8Array(0))).toThrow("empty PCM");
    expect(() =>
      calculateNodeAsrTimeoutMs(NODE_ASR_MAX_PCM_BYTES + 1),
    ).toThrow("200-second limit");
    expect(() =>
      calculateEdgeAsrTimeoutMs(EDGE_ASR_MAX_PCM_BYTES + 1),
    ).toThrow("200-second limit");
  });

  it("rejects a header-only WAV before opening a WebSocket", async () => {
    const wavHeader = Buffer.alloc(44);
    wavHeader.write("RIFF");

    await expect(transcribeNodeAudio(wavHeader)).rejects.toThrow("empty PCM");
    expect(webSocketState.instances).toHaveLength(0);
  });

  it("sends separate first and final frames through the Node transport", async () => {
    vi.useFakeTimers();
    try {
      const transcription = transcribeNodeAudio(Buffer.alloc(1));
      const socket = webSocketState.instances[0];

      socket.emit("open");
      await vi.runAllTimersAsync();
      await expect(transcription).resolves.toEqual({ transcript: "" });

      expect(socket.sent.map((payload) => JSON.parse(payload).data.status))
        .toEqual([0, 2]);
      expect(JSON.parse(socket.sent[0])).toMatchObject({
        common: { app_id: "test-app-id" },
        business: {
          language: "zh_cn",
          domain: "ist_open",
          accent: "mandarin",
        },
        data: {
          status: 0,
          audio: "AA==",
        },
      });
      expect(JSON.parse(socket.sent[1])).toEqual({ data: { status: 2 } });
    } finally {
      vi.useRealTimers();
    }
  });
});
