import { describe, expect, it } from "vitest";
import { encodeWAV, getPcmWavDurationSeconds } from "./audio-utils";
import { getPcmWavDurationSeconds as getEdgePcmWavDurationSeconds } from "../../supabase/functions/_shared/c5-wav";

async function recordedWav(seconds: number): Promise<Uint8Array> {
  const wav = encodeWAV(new Float32Array(seconds * 16_000), 16_000);
  return new Uint8Array(await wav.arrayBuffer());
}

describe("XiYouQuest C5 WAV duration", () => {
  it("derives the same duration in the Node and Edge assessment paths", async () => {
    const audio = await recordedWav(3);

    expect(getPcmWavDurationSeconds(audio)).toBe(3);
    expect(getEdgePcmWavDurationSeconds(audio)).toBe(3);
  });

  it("rejects malformed audio in both assessment paths", async () => {
    const audio = await recordedWav(1);
    new DataView(audio.buffer, audio.byteOffset, audio.byteLength).setUint32(24, 8_000, true);

    expect(getPcmWavDurationSeconds(audio)).toBeNull();
    expect(getEdgePcmWavDurationSeconds(audio)).toBeNull();
  });
});
