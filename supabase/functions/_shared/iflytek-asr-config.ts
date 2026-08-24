/**
 * iFlytek ASR provider selection (Deno port of src/lib/iflytek-speech/asr-config.ts).
 *
 * IST (Real-time ASR, `ist-api-sg.xf-yun.com/v2/ist`) is NOT licensed on the
 * current iFlytek app. Every request reaches the license checker and is refused
 * with `code 11200 "licc failed"` in ~400ms, regardless of business params:
 * all six documented `domain` values, both `dwa` casings, and minimal parameter
 * sets were probed. TTS, ISE, and IAT authorize fine on the same credentials,
 * so this is a per-capability entitlement gap, not an auth or protocol fault.
 *
 * IAT (Short Form ASR) is licensed and verified end to end. Switch back to
 * "ist" in one line if the Real-time ASR entitlement is restored.
 */
export type AsrProvider = "iat" | "ist";

export const ASR_PROVIDER: AsrProvider = "iat";

export const PCM_BYTES_PER_SECOND = 32_000; // 16kHz, 16-bit, mono

export interface AsrProviderConfig {
  readonly host: string;
  readonly path: string;
  readonly business: Readonly<Record<string, unknown>>;
  /**
   * Audio bytes to send per WebSocket session. IAT accepts roughly 60s of audio
   * and then silently truncates: it still returns `code 0` with a partial
   * transcript and no error, so anything longer must be split across sessions.
   * A 180s clip in one session yielded 33% of the expected characters.
   */
  readonly maxSegmentBytes: number;
}

const IAT_CONFIG: AsrProviderConfig = {
  host: "iat-api-sg.xf-yun.com",
  path: "/v2/iat",
  business: {
    language: "zh_cn",
    domain: "iat",
    accent: "mandarin",
    // Max permitted silence before iFlytek's VAD ends the session. Kept at the
    // documented ceiling so a student pausing to think is not cut off mid-answer.
    vad_eos: 10_000,
    dwa: "wpgs", // streaming results with rpl/rg dynamic correction
    ptt: 1, // punctuation
  },
  maxSegmentBytes: 55 * PCM_BYTES_PER_SECOND,
};

const IST_CONFIG: AsrProviderConfig = {
  host: "ist-api-sg.xf-yun.com",
  path: "/v2/ist",
  business: {
    language: "zh_cn",
    domain: "ist_open",
    accent: "mandarin",
    dwa: "wpgs",
    punc: 1,
  },
  // IST handles multi-hour streams; cap well above any recording this app makes.
  maxSegmentBytes: 200 * PCM_BYTES_PER_SECOND,
};

export function getAsrProviderConfig(
  provider: AsrProvider = ASR_PROVIDER,
): AsrProviderConfig {
  return provider === "ist" ? IST_CONFIG : IAT_CONFIG;
}
