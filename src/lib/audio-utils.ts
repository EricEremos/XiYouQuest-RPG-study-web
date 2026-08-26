/**
 * Shared WAV encoding utilities.
 * Used by AudioRecorder (client) and SpeakingSession (client) for PCM WAV capture.
 */

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

export function getPcmWavDurationSeconds(audio: Uint8Array): number | null {
  if (audio.length < 44) return null;

  const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength);
  const hasMarker = (offset: number, marker: string) =>
    marker.split("").every((character, index) =>
      view.getUint8(offset + index) === character.charCodeAt(0),
    );

  if (
    !hasMarker(0, "RIFF") ||
    !hasMarker(8, "WAVE") ||
    !hasMarker(12, "fmt ") ||
    !hasMarker(36, "data") ||
    view.getUint32(16, true) !== 16 ||
    view.getUint16(20, true) !== 1 ||
    view.getUint16(22, true) !== 1 ||
    view.getUint32(24, true) !== 16_000 ||
    view.getUint32(28, true) !== 32_000 ||
    view.getUint16(32, true) !== 2 ||
    view.getUint16(34, true) !== 16
  ) {
    return null;
  }

  const dataLength = view.getUint32(40, true);
  if (dataLength === 0 || dataLength !== audio.length - 44 || dataLength % 2 !== 0) {
    return null;
  }

  return dataLength / 32_000;
}

export function encodeWAV(samples: Float32Array, sampleRate: number): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataLength = samples.length * (bitsPerSample / 8);
  const headerLength = 44;
  const buffer = new ArrayBuffer(headerLength + dataLength);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, "WAVE");

  // fmt sub-chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // subchunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data sub-chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataLength, true);

  // Write PCM samples (clamp to int16 range)
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}
