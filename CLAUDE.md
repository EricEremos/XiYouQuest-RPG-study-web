# CLAUDE.md

## Project Overview

XiYouQuest (西游Quest) — AI-powered PSC (Putonghua Proficiency Test) practice web app with Journey to the West character companions, real-time pronunciation scoring, RPG story campaign, and gamification. 7 practice components (C1-C5 official PSC + C6-C7 supplementary drills).

## Commands

```bash
npm run dev      # Dev server (localhost:3000)
npm run build    # Production build (Turbopack)
npm run lint     # ESLint
npm run test     # Vitest unit tests
```

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript (strict) · Supabase · Tailwind CSS 4 · shadcn/ui (New York style) · Vercel

## Auth Flow (3-layer — non-obvious)

1. **Middleware** (`middleware.ts`) refreshes Supabase session on every request
2. **`(main)/layout.tsx`** calls `getUser()`, redirects to `/login` if unauthenticated
3. **Pages** safely use `user!.id` without re-checking

API routes independently verify auth. Root `/` redirects based on auth state.

## External Services

All clients live in `src/lib/`. Env vars in `.env.local`:

| Service | Client file | Env vars |
|---------|------------|----------|
| Supabase | `supabase/client.ts`, `supabase/server.ts` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| iFlytek (ISE + ASR + TTS) | `iflytek-speech/client.ts`, `iflytek-speech/asr-client.ts`, `voice/client.ts` | `IFLYTEK_APP_ID`, `IFLYTEK_API_KEY`, `IFLYTEK_API_SECRET` |
| DeepSeek V4 Flash (via OpenRouter) | `gemini/client.ts` | `OPENROUTER_API_KEY` |

**Note:** The AI client file is still named `gemini/client.ts` (historical) but uses OpenRouter. Primary model: `deepseek/deepseek-v4-flash`. Fallback: `google/gemini-2.5-flash`. Exports: `generateFeedback()`, `analyzeC5Speaking()`, `chatConversation()`.

| Gemini 3.1 Flash (via OpenRouter) | `image-gen/client.ts` | `OPENROUTER_API_KEY` |

### iFlytek credentials (debugging gotcha)

iFlytek uses the **international Singapore endpoints** (`ise-api-sg.xf-yun.com`, `tts-api-sg.xf-yun.com`, `iat-api-sg.xf-yun.com`). Three traps that produce hard-to-read failures:

0. **ASR uses IAT, not IST, because IST is unlicensed on this app.** Requests to `ist-api-sg.xf-yun.com/v2/ist` (Real-time ASR) return `code 11200 "licc failed"` in ~400ms for every parameter combination: all six documented `domain` values, both `dwa` casings, minimal params. TTS/ISE/IAT authorize on the same credentials, so it is a per-capability entitlement gap, not auth. Note 11200 also fires when a capability's allowance is exhausted, and the iFlytek console still shows the service as activated in that state, so "nothing is switched off" does not contradict the error. Provider is a one-line switch: `ASR_PROVIDER` in `src/lib/iflytek-speech/asr-config.ts` and its Deno twin `supabase/functions/_shared/iflytek-asr-config.ts`.

   **IAT silently truncates past ~60s** — it returns `code 0` with a partial transcript and no error. A 180s C5 recording in one session yielded 33% of the expected characters. Long audio is therefore split below 60s by `asr-segments.ts`, cutting at the quietest point in a 3s window so a split does not land mid-syllable. Never send a long recording as a single IAT session. Burst upload (10KB chunks, unpaced) is ~7x faster than the docs' 40ms real-time pacing and iFlytek accepts it, so do not "correct" it to match the docs.
1. **`IFLYTEK_API_KEY` ↔ `IFLYTEK_API_SECRET` are easy to swap** — both are 32-char hex. If swapped, **every** iFlytek service (ISE/ASR/TTS) fails at the WebSocket handshake with HTTP `401 {"message":"HMAC signature cannot be verified: fail to retrieve credential"}`. Correct mapping: `api_key` is the lookup identifier sent in the `authorization` header; `api_secret` is the HMAC-SHA256 signing key. (`IFLYTEK_APP_ID` is the short ~8-char id, sent in the SSB frame after the socket opens.) To verify a credential set fast, replicate `buildIflytekWsUrl()` in a throwaway script and check whether the WS opens.
2. **All iFlytek + AI routes run as Supabase Edge Functions, so they read Supabase Edge secrets — NOT `.env.local`.** Even in local `npm run dev`, `/api/speech/*`, `/api/tts/*`, and `/api/chat/*` are rewritten to the deployed edge function by `fetchWithRetry` → `resolveEdgeRoute()`. So editing `.env.local` does **not** affect these routes anywhere; update the deployed secrets instead: `supabase secrets set IFLYTEK_API_KEY=… IFLYTEK_API_SECRET=… --project-ref <ref>`. No redeploy needed (env is read lazily per request via `Deno.env.get`), though a redeploy forces a cold start if a warm worker serves stale values.

**Client symptom:** the C2/C-series practice page logs `[Cn] Assessment API error: 500 {}` (empty body, because the edge function's non-2xx body isn't always JSON and `fetchWithRetry` retries 500s). Diagnose server-side via Supabase edge-function logs (`get_logs`), not the browser console.

## Edge Function Architecture

8 long-running API routes are deployed as Supabase Edge Functions (Deno runtime, 150s timeout) to avoid Vercel's 10s free-tier limit. Client-side routing is transparent via `fetchWithRetry` → `resolveEdgeRoute()`.

| Vercel Route | Edge Function | External APIs |
|---|---|---|
| `/api/ai/feedback` | `ai-feedback` | OpenRouter LLM |
| `/api/ai/insights` | `ai-insights` | OpenRouter LLM |
| `/api/ai/mock-exam-feedback` | `ai-mock-exam-feedback` | OpenRouter LLM |
| `/api/chat/generate-image` | `chat-generate-image` | OpenRouter Image + Storage |
| `/api/chat/start` | `chat-start` | OpenRouter LLM + iFlytek TTS |
| `/api/chat/respond` | `chat-respond` | iFlytek ASR+ISE + OpenRouter LLM |
| `/api/learning/generate-plan` | `learning-generate-plan` | OpenRouter LLM + DB |
| `/api/speech/c5-assess` | `speech-c5-assess` | iFlytek ASR+ISE + OpenRouter LLM |

- **Routing:** `src/lib/edge-routing.ts` maps paths → edge URLs + injects Supabase auth token. `fetchWithRetry` calls this before any request.
- **Shared code:** `supabase/functions/_shared/` contains Deno ports of AI, iFlytek, image-gen, scoring, chat-prompt, and validation modules.
- **Auth:** Edge functions receive `Authorization: Bearer <token>` header, create per-request Supabase client. `--no-verify-jwt` used at deploy (auth handled internally).
- **Deno specifics:** `npm:` specifiers (not bare imports), `Deno.env.get()`, Web Crypto API, native WebSocket, `Uint8Array` instead of `Buffer`.
- **tsconfig.json** excludes `supabase/functions` from Next.js type checking.

## Key Patterns & Gotchas

- **Path alias:** `@/*` maps to `./src/*`
- **`next.config.ts`** externalizes `ws` — required for iFlytek WebSocket clients (TTS, ISE, ASR) running server-side
- **iFlytek auth:** key/secret are swappable and the live routes use Supabase Edge secrets, not `.env.local` — see [iFlytek credentials gotcha](#iflytek-credentials-debugging-gotcha) above before touching speech/TTS env
- **Component pages** are server components that fetch data via `Promise.all`, then render heavy client components via `next/dynamic`
- **`fetchWithRetry`** wrapper: all 24+ client-side API calls use automatic retry for transient failures. Automatically routes migrated endpoints to Supabase Edge Functions via `resolveEdgeRoute()`.
- **AI retry logic:** 3 retries with exponential backoff (1s, 2s, 4s + jitter), falls back to canned Chinese/English messages on total failure
- **Achievement checks are event-driven** — action endpoints return `newAchievements` array for toast display via React Context
- **Loading skeletons** (`loading.tsx`) exist for every route under `(main)/`
- **Audio format:** all speech recording/TTS uses PCM 16kHz 16-bit mono (WAV header auto-stripped before sending to iFlytek)
- **Database:** types in `src/types/database.ts`, component columns accept values 1-7. Migrations via Supabase MCP (`apply_migration`)
- **Quest battle state machine:** intro → stage_select → story → battle → victory/defeat (see `src/lib/quest/`)
- **Companion chat state machine:** select_companion → select_scenario → chatting → summary (see `src/app/(main)/companion-chat/`)
- **UI theme:** pixel-art retro with Chinese-ink aesthetic — theme vars in `globals.css`, utility classes like `pixel-border`, `chinese-frame`, `chinese-corner`

## File Organization

```
src/components/ui/          # shadcn/ui primitives
src/components/shared/      # Custom reusable components
src/components/practice/    # AudioRecorder, practice sessions
src/components/quest/       # 12 battle/story RPG components
src/components/character/   # Character display, gallery
src/lib/                    # All business logic and external service clients
src/types/                  # TypeScript types (database.ts, gamification.ts, etc.)
public/img/                 # Sprites, backgrounds, boss art (spaces in folder names)
supabase/functions/         # Deno edge functions (deployed to Supabase)
supabase/functions/_shared/ # Shared Deno modules (AI, iFlytek, scoring, etc.)
```
