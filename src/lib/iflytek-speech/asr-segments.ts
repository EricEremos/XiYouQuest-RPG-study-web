/**
 * Pure PCM helpers for ASR: WAV header stripping and session segmentation.
 *
 * Operates on Uint8Array so the identical logic can be shared by the Node
 * client (Buffer extends Uint8Array) and the Deno edge port.
 *
 * PCM is 16kHz, 16-bit, mono little-endian throughout this app.
 */

const WAV_HEADER_BYTES = 44;
const BYTES_PER_SAMPLE = 2;

/** 20ms analysis frame used to locate a quiet point to cut on. */
const RMS_FRAME_BYTES = 640;

/**
 * How far back from a hard segment boundary to hunt for a quiet point. Cutting
 * mid-syllable loses characters at the seam: an arbitrary 55s cut turned
 * "他常常告诉我" into "他常常告".
 */
const SPLIT_SEARCH_BYTES = 3 * 32_000;

export function hasWavHeader(audioData: Uint8Array): boolean {
  return (
    audioData.length >= WAV_HEADER_BYTES &&
    audioData[0] === 0x52 && // R
    audioData[1] === 0x49 && // I
    audioData[2] === 0x46 && // F
    audioData[3] === 0x46 // F
  );
}

/** Returns the PCM payload, dropping a RIFF/WAV header when one is present. */
export function stripWavHeader(audioData: Uint8Array): Uint8Array {
  return hasWavHeader(audioData)
    ? audioData.subarray(WAV_HEADER_BYTES)
    : audioData;
}

/** Mean absolute amplitude of the 16-bit samples in [start, end). */
function frameLoudness(pcm: Uint8Array, start: number, end: number): number {
  let total = 0;
  let count = 0;
  for (let i = start; i + 1 < end; i += BYTES_PER_SAMPLE) {
    // little-endian int16
    const raw = pcm[i] | (pcm[i + 1] << 8);
    const sample = raw >= 0x8000 ? raw - 0x10000 : raw;
    total += Math.abs(sample);
    count += 1;
  }
  return count === 0 ? 0 : total / count;
}

/**
 * Pick a split offset at or before `hardEnd`, preferring the quietest 20ms
 * frame within the search window so the cut lands in a pause rather than
 * mid-word. Always returns a sample-aligned offset strictly greater than
 * `start`, so segmentation cannot stall.
 */
export function findQuietSplit(
  pcm: Uint8Array,
  start: number,
  hardEnd: number,
): number {
  const searchStart = Math.max(start + RMS_FRAME_BYTES, hardEnd - SPLIT_SEARCH_BYTES);
  if (hardEnd - searchStart < RMS_FRAME_BYTES) {
    return alignToSample(hardEnd, start);
  }

  let quietestOffset = hardEnd;
  let quietestLoudness = Number.POSITIVE_INFINITY;

  for (let frame = searchStart; frame + RMS_FRAME_BYTES <= hardEnd; frame += RMS_FRAME_BYTES) {
    const loudness = frameLoudness(pcm, frame, frame + RMS_FRAME_BYTES);
    if (loudness < quietestLoudness) {
      quietestLoudness = loudness;
      // Cut in the middle of the quiet frame.
      quietestOffset = frame + RMS_FRAME_BYTES / 2;
    }
  }

  return alignToSample(quietestOffset, start);
}

function alignToSample(offset: number, floor: number): number {
  const aligned = offset - (offset % BYTES_PER_SAMPLE);
  return Math.max(aligned, floor + BYTES_PER_SAMPLE);
}

/**
 * Split PCM into chunks no larger than `maxSegmentBytes`, cutting at quiet
 * points. Audio that already fits returns as a single segment, so the common
 * short-utterance path is unchanged.
 */
export function segmentPcm(
  pcm: Uint8Array,
  maxSegmentBytes: number,
): Uint8Array[] {
  if (pcm.length === 0) return [];
  if (pcm.length <= maxSegmentBytes) return [pcm];

  const segments: Uint8Array[] = [];
  let offset = 0;

  while (offset < pcm.length) {
    const remaining = pcm.length - offset;
    if (remaining <= maxSegmentBytes) {
      segments.push(pcm.subarray(offset));
      break;
    }

    const hardEnd = offset + maxSegmentBytes;
    const splitAt = Math.min(findQuietSplit(pcm, offset, hardEnd), pcm.length);
    segments.push(pcm.subarray(offset, splitAt));
    offset = splitAt;
  }

  return segments;
}
