export const ASR_FRAME_INTERVAL_MS = 40;
const ASR_FRAME_SIZE = 1_280;
const ASR_MIN_TIMEOUT_MS = 120_000;
const ASR_FINAL_RESPONSE_GRACE_MS = 30_000;
export const ASR_MAX_PCM_BYTES = 200 * 32_000;

export type AsrAudioFrame =
  | { status: 0 | 1; audio: Uint8Array }
  | { status: 2 };

export function calculateAsrTimeoutMs(pcmByteLength: number): number {
  if (pcmByteLength <= 0) {
    throw new Error("iFlytek ASR: empty PCM audio");
  }
  if (pcmByteLength > ASR_MAX_PCM_BYTES) {
    throw new Error("iFlytek ASR: audio exceeds 200-second limit");
  }

  const audioFrameCount = Math.ceil(pcmByteLength / ASR_FRAME_SIZE);
  const streamingDurationMs = audioFrameCount * ASR_FRAME_INTERVAL_MS;
  return Math.max(
    ASR_MIN_TIMEOUT_MS,
    streamingDurationMs + ASR_FINAL_RESPONSE_GRACE_MS,
  );
}

export function createAsrAudioFrames(
  pcmData: Uint8Array,
): AsrAudioFrame[] {
  calculateAsrTimeoutMs(pcmData.byteLength);
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
