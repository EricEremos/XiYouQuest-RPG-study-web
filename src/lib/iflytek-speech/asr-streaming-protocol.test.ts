import { describe, expect, it } from "vitest";
import {
  ASR_FRAME_INTERVAL_MS,
  createAsrAudioFrames,
} from "../../../supabase/functions/_shared/iflytek-asr-frames";

describe("iFLYTEK ASR streaming protocol", () => {
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
});
