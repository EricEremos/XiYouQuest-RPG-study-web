/**
 * Live end-to-end check of the real transcribeAudio() against iFlytek.
 *
 * Costs provider quota, so it is skipped unless ASR_LIVE_TEST=1 and credentials
 * are present. Run manually:
 *   ASR_LIVE_TEST=1 npx vitest run src/lib/iflytek-speech/asr-live.integration.test.ts
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import WebSocket from "ws";
import { beforeAll, describe, expect, it } from "vitest";

function loadEnvLocal(): void {
  const file = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^"|"$/g, "").trim();
    }
  }
}

loadEnvLocal();

const enabled =
  process.env.ASR_LIVE_TEST === "1" &&
  !!process.env.IFLYTEK_APP_ID &&
  !!process.env.IFLYTEK_API_KEY &&
  !!process.env.IFLYTEK_API_SECRET;

/** Synthesize Mandarin speech with iFlytek TTS to use as ASR input. */
function synthesize(text: string): Promise<Buffer> {
  const host = "tts-api-sg.xf-yun.com";
  const wsPath = "/v2/tts";
  const date = new Date().toUTCString();
  const signature = crypto
    .createHmac("sha256", process.env.IFLYTEK_API_SECRET!)
    .update(`host: ${host}\ndate: ${date}\nGET ${wsPath} HTTP/1.1`)
    .digest("base64");
  const authorization = Buffer.from(
    `api_key="${process.env.IFLYTEK_API_KEY}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`
  ).toString("base64");
  const url = `wss://${host}${wsPath}?authorization=${authorization}&date=${encodeURIComponent(date)}&host=${host}`;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const parts: Buffer[] = [];
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("tts timeout"));
    }, 30000);

    ws.on("open", () =>
      ws.send(
        JSON.stringify({
          common: { app_id: process.env.IFLYTEK_APP_ID },
          business: {
            aue: "raw",
            auf: "audio/L16;rate=16000",
            vcn: "xiaoyan",
            tte: "UTF8",
          },
          data: { status: 2, text: Buffer.from(text, "utf8").toString("base64") },
        })
      )
    );
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.code !== 0) {
        clearTimeout(timer);
        ws.close();
        return reject(new Error(`tts ${msg.code}: ${msg.message}`));
      }
      if (msg.data?.audio) parts.push(Buffer.from(msg.data.audio, "base64"));
      if (msg.data?.status === 2) {
        clearTimeout(timer);
        ws.close();
        resolve(Buffer.concat(parts));
      }
    });
    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

describe.skipIf(!enabled)("transcribeAudio (live iFlytek)", () => {
  let transcribeAudio: (b: Buffer) => Promise<{ transcript: string }>;

  beforeAll(async () => {
    ({ transcribeAudio } = await import("./asr-client"));
  });

  it("transcribes a short companion-chat utterance", async () => {
    const speech = await synthesize("你好，我想要一杯热咖啡。");
    const { transcript } = await transcribeAudio(speech);

    expect(transcript).toContain("咖啡");
    expect(transcript.length).toBeGreaterThan(5);
  }, 120_000);

  it("transcribes a 3-minute C5 recording without silent truncation", async () => {
    const passage = await synthesize(
      "我最尊敬的人是我的母亲，她一生勤劳善良。" +
        "小时候家里条件不好，她每天很早就起来准备早饭。" +
        "她常常告诉我，做人要诚实，做事要认真。"
    );
    const target = 180 * 32_000;
    const repeated = Buffer.concat(
      Array.from({ length: Math.ceil(target / passage.length) }, () => passage)
    ).subarray(0, target);

    const { transcript } = await transcribeAudio(repeated);

    // A single un-segmented IAT session returns code 0 but only ~33% of the
    // characters. Segmentation must recover far more than that.
    const singleSessionCeiling = 300;
    expect(transcript.length).toBeGreaterThan(singleSessionCeiling * 2);
  }, 300_000);
});
