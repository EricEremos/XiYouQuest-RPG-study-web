import { z } from "npm:zod";
import {
  corsResponse,
  errorResponse,
} from "../_shared/cors.ts";
import { verifyUser } from "../_shared/verify-jwt.ts";
import {
  synthesizeAcademic,
  VALID_IFLYTEK_VOICES,
} from "../_shared/iflytek-tts.ts";

const schema = z.object({
  voiceId: z.string().min(1).max(50).refine(
    (v) => VALID_IFLYTEK_VOICES.has(v),
    { message: "Invalid voice ID" },
  ),
  text: z.string().min(1).max(500),
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse();

  const user = await verifyUser(req);
  if (!user) return errorResponse("Unauthorized", 401);

  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Invalid input: voiceId and text are required", 400);
    }
    const { voiceId, text } = parsed.data;

    const audioData = await synthesizeAcademic({ voiceId, text });
    const audioBuffer = Uint8Array.from(audioData).buffer;

    return new Response(audioBuffer, {
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "no-cache",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("[tts-companion] Error:", error instanceof Error ? error.message : error);
    return new Response(
      JSON.stringify({ error: "TTS temporarily unavailable" }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }
});
