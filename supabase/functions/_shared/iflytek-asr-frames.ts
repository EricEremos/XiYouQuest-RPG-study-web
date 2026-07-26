export const ASR_FRAME_INTERVAL_MS = 40;
const ASR_FRAME_SIZE = 1_280;

export type AsrAudioFrame =
  | { status: 0 | 1; audio: Uint8Array }
  | { status: 2 };

export function createAsrAudioFrames(
  pcmData: Uint8Array,
): AsrAudioFrame[] {
  const frames: AsrAudioFrame[] = [];

  for (let offset = 0; offset < pcmData.length; offset += ASR_FRAME_SIZE) {
    frames.push({
      status: offset === 0 ? 0 : 1,
      audio: pcmData.subarray(
        offset,
        Math.min(offset + ASR_FRAME_SIZE, pcmData.length),
      ),
    });
  }

  frames.push({ status: 2 });
  return frames;
}
