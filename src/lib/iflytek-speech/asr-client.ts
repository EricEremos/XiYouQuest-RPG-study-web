import crypto from "crypto";
import WebSocket from "ws";
import { IFLYTEK_APP_ID, IFLYTEK_API_KEY, IFLYTEK_API_SECRET } from "@/lib/env";
import { ASR_TIMEOUT_MS } from "@/lib/constants";

const ASR_HOST = "ist-api-sg.xf-yun.com";
const ASR_PATH = "/v2/ist";
const ASR_FRAME_SIZE = 1_280;
const ASR_FRAME_INTERVAL_MS = 40;
const ASR_FINAL_RESPONSE_GRACE_MS = 30_000;
export const ASR_PCM_BYTES_PER_SECOND = 32_000;
export const ASR_MAX_PCM_BYTES = 200 * ASR_PCM_BYTES_PER_SECOND;
export const COMPANION_MAX_PCM_BYTES =
  60 * ASR_PCM_BYTES_PER_SECOND;

export interface AsrTranscriptionResult {
  transcript: string;
}

export function getPcmByteLength(audioBuffer: Uint8Array): number {
  const hasWavHeader =
    audioBuffer.length >= 44 &&
    audioBuffer[0] === 0x52 &&
    audioBuffer[1] === 0x49 &&
    audioBuffer[2] === 0x46 &&
    audioBuffer[3] === 0x46;
  return audioBuffer.length - (hasWavHeader ? 44 : 0);
}

export function isCompanionAudioWithinLimit(
  audioBuffer: Uint8Array,
): boolean {
  const pcmByteLength = getPcmByteLength(audioBuffer);
  return pcmByteLength > 0 && pcmByteLength <= COMPANION_MAX_PCM_BYTES;
}

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
    ASR_TIMEOUT_MS,
    streamingDurationMs + ASR_FINAL_RESPONSE_GRACE_MS,
  );
}

// ---------- Auth ----------

function buildAsrWsUrl(): string {
  const date = new Date().toUTCString();
  const signatureOrigin = `host: ${ASR_HOST}\ndate: ${date}\nGET ${ASR_PATH} HTTP/1.1`;
  const hmac = crypto.createHmac("sha256", IFLYTEK_API_SECRET());
  hmac.update(signatureOrigin);
  const signature = hmac.digest("base64");
  const authorizationOrigin = `api_key="${IFLYTEK_API_KEY()}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = Buffer.from(authorizationOrigin).toString("base64");
  return `wss://${ASR_HOST}${ASR_PATH}?authorization=${authorization}&date=${encodeURIComponent(date)}&host=${ASR_HOST}`;
}

// ---------- Main transcription ----------

/**
 * Transcribe audio using iFlytek Real-time ASR (IST) via WebSocket.
 *
 * Protocol:
 *   1. First frame: business params + first audio chunk (status=0)
 *   2. Continuation frames: audio chunks (status=1)
 *   3. Final frame: no audio payload (status=2)
 *   4. Server sends JSON results with word segments; status=2 = final result
 *
 * Handles dynamic correction: `pgs: "rpl"` replaces segment, `pgs: "apd"` appends.
 */
export async function transcribeAudio(audioBuffer: Buffer): Promise<AsrTranscriptionResult> {
  // Strip WAV header if present (44-byte RIFF header)
  const pcmData = audioBuffer.subarray(
    audioBuffer.length - getPcmByteLength(audioBuffer),
  );

  const timeoutMs = calculateAsrTimeoutMs(pcmData.length);
  const wsUrl = buildAsrWsUrl();

  return new Promise((resolve, reject) => {
    let settled = false;
    const startTime = Date.now();

    // Track segments by sequence number for dynamic correction
    const segments: Map<number, string> = new Map();

    console.log(
      `[ASR] pcm=${pcmData.length} bytes (${Math.round(pcmData.length / 32000)}s audio)`
    );

    const ws = new WebSocket(wsUrl);

    const finish = (transcript: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      console.log(`[ASR] completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s, transcript length=${transcript.length}`);
      resolve({ transcript });
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    };

    const timer = setTimeout(() => {
      ws.close();
      fail(new Error(`iFlytek ASR timeout (${timeoutMs / 1000}s)`));
    }, timeoutMs);

    ws.on("open", () => {
      const BUFFER_HIGH_WATER = 65536;
      let offset = 0;

      const sendNextFrame = () => {
        if (settled || ws.readyState !== WebSocket.OPEN) return;

        if (ws.bufferedAmount > BUFFER_HIGH_WATER) {
          if (ws.readyState === WebSocket.OPEN) {
            setTimeout(sendNextFrame, 5);
          }
          return;
        }

        if (offset >= pcmData.length) {
          ws.send(JSON.stringify({ data: { status: 2 } }));
          return;
        }

        const end = Math.min(offset + ASR_FRAME_SIZE, pcmData.length);
        const chunk = pcmData.subarray(offset, end);
        const isFirst = offset === 0;

        const frame: Record<string, unknown> = {
          data: {
            status: isFirst ? 0 : 1,
            format: "audio/L16;rate=16000",
            encoding: "raw",
            audio: chunk.toString("base64"),
          },
        };

        // First frame includes common + business params
        if (isFirst) {
          frame.common = { app_id: IFLYTEK_APP_ID() };
          frame.business = {
            language: "zh_cn",
            domain: "ist_open",
            accent: "mandarin",
            dwa: "wpgs",
            punc: 1,
          };
        }

        ws.send(JSON.stringify(frame));
        offset = end;
        setTimeout(sendNextFrame, ASR_FRAME_INTERVAL_MS);
      };

      sendNextFrame();
    });

    ws.on("message", (data: WebSocket.Data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (msg.code !== 0) {
        ws.close();
        fail(new Error(`iFlytek ASR error ${msg.code}: ${msg.message || ""}`));
        return;
      }

      const result = msg.data?.result;
      if (result) {
        // Extract text from word segments
        const sn = result.sn as number;
        const pgs = result.pgs as string | undefined;
        const ws_data = result.ws as Array<{ cw: Array<{ w: string }> }> | undefined;

        if (ws_data) {
          const text = ws_data.map((item) => item.cw.map((cw) => cw.w).join("")).join("");

          if (pgs === "rpl") {
            // Replace: clear segments in the replace range, then set new
            const rg = result.rg as [number, number] | undefined;
            if (rg) {
              for (let i = rg[0]; i <= rg[1]; i++) {
                segments.delete(i);
              }
            }
            segments.set(sn, text);
          } else {
            // Append (confirmed segment)
            segments.set(sn, text);
          }
        }
      }

      // status=2 means final result
      if (msg.data?.status === 2) {
        ws.close();
        // Concatenate all segments in order
        const sortedKeys = Array.from(segments.keys()).sort((a, b) => a - b);
        const transcript = sortedKeys.map((k) => segments.get(k)!).join("");
        finish(transcript);
      }
    });

    ws.on("error", (err) => {
      fail(err instanceof Error ? err : new Error(String(err)));
    });

    ws.on("close", () => {
      if (!settled) {
        // If we have segments, build transcript from what we have
        if (segments.size > 0) {
          const sortedKeys = Array.from(segments.keys()).sort((a, b) => a - b);
          const transcript = sortedKeys.map((k) => segments.get(k)!).join("");
          finish(transcript);
        } else {
          fail(new Error("iFlytek ASR: closed without result"));
        }
      }
    });
  });
}
