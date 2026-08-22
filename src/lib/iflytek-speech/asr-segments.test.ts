import { describe, expect, it } from "vitest";
import {
  findQuietSplit,
  hasWavHeader,
  segmentPcm,
  stripWavHeader,
} from "./asr-segments";
import { PCM_BYTES_PER_SECOND, getAsrProviderConfig } from "./asr-config";

const SECOND = PCM_BYTES_PER_SECOND;

/** Build PCM of `seconds` at a constant amplitude. */
function tone(seconds: number, amplitude = 6000): Uint8Array {
  const samples = Math.round((seconds * SECOND) / 2);
  const pcm = new Uint8Array(samples * 2);
  const view = new DataView(pcm.buffer);
  for (let i = 0; i < samples; i++) {
    view.setInt16(i * 2, i % 2 === 0 ? amplitude : -amplitude, true);
  }
  return pcm;
}

function silence(seconds: number): Uint8Array {
  return new Uint8Array(Math.round(seconds * SECOND));
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

describe("stripWavHeader", () => {
  it("drops the 44-byte RIFF header when present", () => {
    const payload = tone(0.1);
    const withHeader = new Uint8Array(44 + payload.length);
    withHeader.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
    withHeader.set(payload, 44);

    expect(hasWavHeader(withHeader)).toBe(true);
    expect(stripWavHeader(withHeader)).toEqual(payload);
  });

  it("leaves headerless PCM untouched", () => {
    const raw = tone(0.1);
    expect(hasWavHeader(raw)).toBe(false);
    expect(stripWavHeader(raw)).toEqual(raw);
  });

  it("does not mistake short PCM for a header", () => {
    const tiny = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
    expect(hasWavHeader(tiny)).toBe(false);
    expect(stripWavHeader(tiny)).toEqual(tiny);
  });
});

describe("segmentPcm", () => {
  const { maxSegmentBytes } = getAsrProviderConfig("iat");

  it("returns no segments for empty audio", () => {
    expect(segmentPcm(new Uint8Array(0), maxSegmentBytes)).toEqual([]);
  });

  it("keeps a short companion-chat utterance as one session", () => {
    const short = tone(4);
    const segments = segmentPcm(short, maxSegmentBytes);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual(short);
  });

  it("keeps audio exactly at the limit as one session", () => {
    const exact = tone(55);
    expect(exact.length).toBe(maxSegmentBytes);
    expect(segmentPcm(exact, maxSegmentBytes)).toHaveLength(1);
  });

  it("splits a 180s C5 recording into multiple sessions", () => {
    const long = tone(180);
    const segments = segmentPcm(long, maxSegmentBytes);
    expect(segments.length).toBeGreaterThan(1);
  });

  it("never emits a segment above the limit", () => {
    for (const seconds of [56, 70, 110, 180, 300]) {
      const segments = segmentPcm(tone(seconds), maxSegmentBytes);
      for (const seg of segments) {
        expect(seg.length).toBeLessThanOrEqual(maxSegmentBytes);
        expect(seg.length).toBeGreaterThan(0);
      }
    }
  });

  it("loses no audio: segments concatenate back to the input", () => {
    const long = tone(180);
    const rejoined = concat(segmentPcm(long, maxSegmentBytes));

    // Byte-wise compare rather than toEqual: deep-equality on multi-megabyte
    // typed arrays is slow enough to trip the default test timeout.
    expect(rejoined.length).toBe(long.length);
    let firstMismatch = -1;
    for (let i = 0; i < long.length; i++) {
      if (rejoined[i] !== long[i]) {
        firstMismatch = i;
        break;
      }
    }
    expect(firstMismatch).toBe(-1);
  });

  it("emits sample-aligned segments so int16 frames are never split", () => {
    const segments = segmentPcm(tone(180), maxSegmentBytes);
    for (const seg of segments) {
      expect(seg.length % 2).toBe(0);
    }
  });

  it("cuts inside a pause rather than mid-speech", () => {
    // Speech, a 0.5s gap starting at 8s, then more speech. Limit is 10s, so the
    // 3s search window (7s..10s) contains the gap.
    const pcm = concat([tone(8), silence(0.5), tone(16.5)]);
    const limit = 10 * SECOND;

    const splitAt = findQuietSplit(pcm, 0, limit);

    expect(splitAt).toBeGreaterThanOrEqual(8 * SECOND);
    expect(splitAt).toBeLessThanOrEqual(8.5 * SECOND);
  });

  it("still advances when the audio has no quiet point", () => {
    // Uniform loudness: no pause to find, must fall back and still terminate.
    const segments = segmentPcm(tone(200), maxSegmentBytes);
    expect(segments.length).toBeGreaterThan(1);
    expect(concat(segments).length).toBe(200 * SECOND);
  });
});

describe("getAsrProviderConfig", () => {
  it("targets licensed IAT by default", () => {
    const config = getAsrProviderConfig();
    expect(config.host).toBe("iat-api-sg.xf-yun.com");
    expect(config.path).toBe("/v2/iat");
    expect(config.business.domain).toBe("iat");
  });

  it("caps IAT sessions below the ~60s silent-truncation threshold", () => {
    expect(getAsrProviderConfig("iat").maxSegmentBytes).toBeLessThan(
      60 * SECOND
    );
  });

  it("still describes IST for a one-line revert if it is re-licensed", () => {
    const ist = getAsrProviderConfig("ist");
    expect(ist.host).toBe("ist-api-sg.xf-yun.com");
    expect(ist.business.domain).toBe("ist_open");
  });
});
