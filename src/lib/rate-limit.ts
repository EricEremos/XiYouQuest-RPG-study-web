// Fixed-window, per-process rate limiter. Each serverless instance keeps its
// own window, so limits are best-effort abuse damping (enumeration, scripted
// polling), not a strict global quota. Keys should include the user id so one
// account cannot exhaust another account's budget.

interface RateLimitWindow {
  count: number;
  resetAt: number;
}

const MAX_TRACKED_KEYS = 10_000;

const windows = new Map<string, RateLimitWindow>();

function pruneExpired(now: number): void {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) {
      windows.delete(key);
    }
  }
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): boolean {
  if (windows.size >= MAX_TRACKED_KEYS) {
    pruneExpired(now);
    // Still full after pruning: evict the oldest windows so the map has a
    // hard upper bound. An evicted key simply restarts its window, which is
    // acceptable for best-effort damping (keys are per authenticated user,
    // so filling the map requires that many distinct accounts).
    for (const staleKey of windows.keys()) {
      if (windows.size < MAX_TRACKED_KEYS) {
        break;
      }
      windows.delete(staleKey);
    }
  }

  const existing = windows.get(key);
  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (existing.count >= limit) {
    return false;
  }

  windows.set(key, { ...existing, count: existing.count + 1 });
  return true;
}
