"use client";

import { authClient } from "@/lib/auth-client";

// Better Auth JWTs are short-lived (~15 min). Cache the token in memory and
// refresh a little before expiry so long-lived client pages don't start
// hitting 401s from Supabase mid-session.

interface CachedToken {
  token: string;
  // epoch ms after which we should refetch (expiry minus a safety skew)
  refreshAfter: number;
}

let cache: CachedToken | null = null;
let inflight: Promise<string | null> | null = null;

const REFRESH_SKEW_MS = 60_000; // refetch 60s before the token actually expires

function decodeExpMs(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    );
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

async function fetchToken(): Promise<string | null> {
  const { data } = await authClient.token();
  const token = data?.token ?? null;
  if (!token) {
    cache = null;
    return null;
  }
  const expMs = decodeExpMs(token);
  cache = {
    token,
    // If the exp is unparseable, cache only briefly (30s) rather than trusting
    // an unknown-lifetime token for minutes; a revoked/rotated token then gets
    // refetched quickly instead of returning 401s for the full window.
    refreshAfter: expMs ? expMs - REFRESH_SKEW_MS : Date.now() + 30_000,
  };
  return token;
}

/**
 * Returns a valid Better Auth JWT for Supabase requests, or null if the user
 * is not signed in. De-dupes concurrent callers and refreshes near expiry.
 */
export async function getAccessToken(): Promise<string | null> {
  if (cache && Date.now() < cache.refreshAfter) return cache.token;
  if (inflight) return inflight;
  inflight = fetchToken().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Clears the cached token (call on sign-out). */
export function clearAccessToken(): void {
  cache = null;
}
