import crypto from "crypto";
import WebSocket from "ws";
import { IFLYTEK_APP_ID, IFLYTEK_API_KEY, IFLYTEK_API_SECRET } from "@/lib/env";
import { ASR_TIMEOUT_MS } from "@/lib/constants";
import {
  getAsrProviderConfig,
  PCM_BYTES_PER_SECOND,
} from "./asr-config";
import { segmentPcm, stripWavHeader } from "./asr-segments";

export const ASR_PCM_BYTES_PER_SECOND = PCM_BYTES_PER_SECOND;
export const ASR_MAX_PCM_BYTES = 200 * ASR_PCM_BYTES_PER_SECOND;
export const COMPANION_MAX_PCM_BYTES = 60 * ASR_PCM_BYTES_PER_SECOND;
// The recorder auto-stops on a setTimeout, so a legitimate recording can
// overshoot the nominal cap by scheduling jitter (mirrors C5_DURATION_TOLERANCE_SECONDS).
export const COMPANION_TOLERANCE_PCM_BYTES = 1 * ASR_PCM_BYTES_PER_SECOND;

export interface AsrTranscriptionResult {
  transcript: string;
}

export function getPcmByteLength(audioData: Uint8Array): number {
  return stripWavHeader(audioData).length;
}

export function isCompanionAudioWithinLimit(
  audioData: Uint8Array,
): boolean {
  const pcmByteLength = getPcmByteLength(audioData);
  return (
    pcmByteLength > 0 &&
    pcmByteLength <= COMPANION_MAX_PCM_BYTES + COMPANION_TOLERANCE_PCM_BYTES
  );
}

export function calculateAsrTimeoutMs(pcmByteLength: number): number {
  if (pcmByteLength <= 0) {
    throw new Error("iFlytek ASR: empty PCM audio");
  }
  if (pcmByteLength > ASR_MAX_PCM_BYTES) {
    throw new Error("iFlytek ASR: audio exceeds 200-second limit");
  }

  return ASR_TIMEOUT_MS;
}

// ---------- Auth ----------

function buildAsrWsUrl(host: string, path: string): string {
  const date = new Date().toUTCString();
  const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`;
  const hmac = crypto.createHmac("sha256", IFLYTEK_API_SECRET());
  hmac.update(signatureOrigin);
  const signature = hmac.digest("base64");
  const authorizationOrigin = `api_key="${IFLYTEK_API_KEY()}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = Buffer.from(authorizationOrigin).toString("base64");
  return `wss://${host}${path}?authorization=${authorization}&date=${encodeURIComponent(date)}&host=${host}`;
}

// ---------- Single session ----------

/**
 * Transcribe one segment over a single WebSocket session.
 *
 * Protocol:
 *   1. First frame: common + business params, status=0
 *   2. Continuation frames: audio, status=1
 *   3. Terminal frame: status=2 with empty audio
 *   4. Server streams JSON results; data.status=2 is the final result
 *
 * Dynamic correction: `pgs: "rpl"` replaces segments in range `rg`, otherwise append.
 *
 * The terminal frame is always sent separately rather than piggybacked on the
 * last audio chunk. A segment small enough to fit one chunk is both first and
 * last, and a combined frame would have to pick one status, leaving the session
 * unterminated until the timeout.
 */
function transcribeSegment(pcmData: Uint8Array): Promise<string> {
  const { host, path, business } = getAsrProviderConfig();
  const wsUrl = buildAsrWsUrl(host, path);

  return new Promise((resolve, reject) => {
    let settled = false;
    const startTime = Date.now();

    // Track segments by sequence number for dynamic correction
    const segments: Map<number, string> = new Map();

    const buildTranscript = (): string =>
      Array.from(segments.keys())
        .sort((a, b) => a - b)
        .map((k) => segments.get(k)!)
        .join("");

    const ws = new WebSocket(wsUrl);

    const finish = (transcript: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(transcript);
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    };

    const timer = setTimeout(() => {
      ws.close();
      fail(new Error(`iFlytek ASR timeout (${ASR_TIMEOUT_MS / 1000}s)`));
    }, ASR_TIMEOUT_MS);

    ws.on("open", () => {
      // Burst upload in 10KB chunks with backpressure. Bursting is ~7x faster
      // than the docs' 40ms real-time pacing and iFlytek accepts it.
      const CHUNK_SIZE = 10240;
      const BUFFER_HIGH_WATER = 65536;
      let offset = 0;

      const sendTerminalFrame = () => {
        if (settled || ws.readyState !== WebSocket.OPEN) return;
        ws.send(
          JSON.stringify({
            data: {
              status: 2,
              format: "audio/L16;rate=16000",
              encoding: "raw",
              audio: "",
            },
          })
        );
      };

      const sendChunks = () => {
        if (settled || ws.readyState !== WebSocket.OPEN) return;

        while (offset < pcmData.length) {
          if (ws.bufferedAmount > BUFFER_HIGH_WATER) {
            setTimeout(sendChunks, 5);
            return;
          }

          const end = Math.min(offset + CHUNK_SIZE, pcmData.length);
          const isFirst = offset === 0;

          const frame: Record<string, unknown> = {
            data: {
              status: isFirst ? 0 : 1,
              format: "audio/L16;rate=16000",
              encoding: "raw",
              audio: Buffer.from(
                pcmData.buffer,
                pcmData.byteOffset + offset,
                end - offset
              ).toString("base64"),
            },
          };

          if (isFirst) {
            frame.common = { app_id: IFLYTEK_APP_ID() };
            frame.business = business;
          }

          ws.send(JSON.stringify(frame));
          offset = end;
        }

        sendTerminalFrame();
      };

      sendChunks();
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
        const sn = result.sn as number;
        const pgs = result.pgs as string | undefined;
        const ws_data = result.ws as Array<{ cw: Array<{ w: string }> }> | undefined;

        if (ws_data) {
          const text = ws_data.map((item) => item.cw.map((cw) => cw.w).join("")).join("");

          if (pgs === "rpl") {
            const rg = result.rg as [number, number] | undefined;
            if (rg) {
              for (let i = rg[0]; i <= rg[1]; i++) {
                segments.delete(i);
              }
            }
          }
          segments.set(sn, text);
        }
      }

      if (msg.data?.status === 2) {
        ws.close();
        console.log(
          `[ASR] segment done in ${((Date.now() - startTime) / 1000).toFixed(1)}s`
        );
        finish(buildTranscript());
      }
    });

    ws.on("error", (err) => {
      fail(err instanceof Error ? err : new Error(String(err)));
    });

    ws.on("close", () => {
      // Salvage a partial transcript rather than failing the whole request.
      if (!settled) {
        if (segments.size > 0) {
          finish(buildTranscript());
        } else {
          fail(new Error("iFlytek ASR: closed without result"));
        }
      }
    });
  });
}

// ---------- Main transcription ----------

/**
 * Transcribe audio using iFlytek ASR, splitting long recordings across sessions.
 *
 * See `asr-config.ts` for why this targets IAT rather than IST, and for the
 * silent-truncation behaviour that makes segmentation necessary.
 */
export async function transcribeAudio(
  audioBuffer: Buffer
): Promise<AsrTranscriptionResult> {
  const pcmData = stripWavHeader(audioBuffer);
  calculateAsrTimeoutMs(pcmData.length);

  const { maxSegmentBytes } = getAsrProviderConfig();
  const chunks = segmentPcm(pcmData, maxSegmentBytes);

  console.log(
    `[ASR] pcm=${pcmData.length} bytes (${Math.round(pcmData.length / 32000)}s audio), ${chunks.length} session(s)`
  );

  const startTime = Date.now();
  const transcripts: string[] = [];

  // Sequential: iFlytek bills and rate-limits per concurrent session, and
  // ordering matters for the stitched transcript.
  for (const chunk of chunks) {
    transcripts.push(await transcribeSegment(chunk));
  }

  const transcript = transcripts.join("");
  console.log(
    `[ASR] completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s, transcript length=${transcript.length}`
  );

  return { transcript };
}
