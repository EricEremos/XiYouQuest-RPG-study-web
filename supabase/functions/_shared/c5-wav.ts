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
