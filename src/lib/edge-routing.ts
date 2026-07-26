import { getAccessToken } from "@/lib/auth-token";

const EDGE_ROUTES: Record<string, string> = {
  "/api/ai/feedback": "ai-feedback",
  "/api/ai/insights": "ai-insights",
  "/api/ai/mock-exam-feedback": "ai-mock-exam-feedback",
  "/api/chat/generate-image": "chat-generate-image",
  "/api/chat/start": "chat-start",
  "/api/chat/respond": "chat-respond",
  // C5 records for 180 seconds. Its real-time ASR stream cannot initiate an
  // Edge response within Supabase's 150-second gateway limit, so it must use
  // the 300-second Next route instead.
  "/api/speech/assess": "speech-assess",
  "/api/learning/generate-plan": "learning-generate-plan",
  "/api/tts/speak": "tts-speak",
  "/api/tts/companion": "tts-companion",
};

/**
 * If the URL matches a migrated route, rewrite to Supabase Edge Function URL
 * and inject the auth token. Returns null if not an edge route.
 */
export async function resolveEdgeRoute(
  input: string | URL | Request,
): Promise<{ url: string; authHeader: string } | null> {
  // Extract the pathname from various input types
  let pathname: string;
  if (typeof input === "string") {
    // Could be a relative path like "/api/ai/feedback" or a full URL
    if (input.startsWith("/")) {
      pathname = input;
    } else {
      try {
        pathname = new URL(input).pathname;
      } catch {
        return null;
      }
    }
  } else if (input instanceof URL) {
    pathname = input.pathname;
  } else {
    pathname = new URL(input.url).pathname;
  }

  const edgeName = EDGE_ROUTES[pathname];
  if (!edgeName) return null;

  // Every edge route requires an authenticated user. If we can't obtain a
  // Better Auth token, fail fast with a clear signal to re-authenticate
  // rather than forwarding an empty `Bearer ` (which the function would
  // reject as an opaque 401).
  const token = await getAccessToken();
  if (!token) {
    throw new Error("Not authenticated. Please sign in again.");
  }

  return {
    url: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${edgeName}`,
    authHeader: `Bearer ${token}`,
  };
}
