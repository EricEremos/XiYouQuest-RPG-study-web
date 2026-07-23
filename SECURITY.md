# XiYouQuest Security Posture

This document records how XiYouQuest satisfies the HKUST ITSO **Minimum Security
Standard** (Application Systems and SaaS on Cloud) and the **Application Development
Guidelines**. It describes the controls that exist in the codebase and the live Supabase
project today, organised by security domain, with a requirement-by-requirement mapping
at the end.

- **Data classification:** High-Risk. XiYouQuest stores student personal records and
  Putonghua (PSC) practice history, protected by the Personal Data (Privacy) Ordinance,
  so the strictest column of the Minimum Security Standard applies. A separate external
  (non-HKUST) user population is planned; its identity and data rules are to be agreed
  with CLE before it ships.
- **Reporting a vulnerability:** email the maintainer and HKUST ITSO
  (`cchelp@ust.hk` / `seccomp@ust.hk`). Do not open a public issue for a security bug.

---

## 1. Authentication and identity

XiYouQuest authenticates through **HKUST OIDC (Microsoft Entra ID)** using the
self-hosted **Better Auth** library. Email/password is disabled and there are no social
providers, satisfying the ITSO requirement to use University authentication
infrastructure.

- **Tenant-pinned, signature-verified OIDC.** Sign-in uses Microsoft's multi-tenant
  `/organizations/` endpoint so one application serves staff (`@ust.hk`) and students
  (`@connect.ust.hk`), who reside in two separate Entra tenants. The `getUserInfo` step
  in `src/lib/auth.ts` selects the tenant from the id_token `tid`, rejects any `tid`
  outside the HKUST tenant allow-list, and verifies the id_token signature against that
  tenant's JWKS with the `issuer`, `audience`, and algorithm pinned. Only tokens minted
  by HKUST's own tenants are accepted.
- **Email-domain authorization on every sign-in,** enforced both during the OIDC exchange
  and in the user-creation hook (in the same transaction as the profile insert, so a
  rejected sign-up leaves no orphaned identity).
- **UUID identities.** Better Auth issues UUID user ids and signs ES256 JWTs (served at
  `/api/auth/jwks`); Supabase edge functions verify these tokens directly against that
  JWKS before serving any request.
- **Boot-time secret validation:** the Better Auth database URL and session secret fail
  fast in production if absent.

## 2. Access control: Row-Level Security

Authorization is enforced at two layers: every server entry point verifies the Better
Auth session before touching data, and Row-Level Security guards every table against
any path that is not session-verified.

- **Row-Level Security is enabled on every `public` table** (profiles, chat sessions and
  messages, practice sessions and details, progress, characters owned, quest progress,
  mock-exam results, learning plans and nodes, friendships, achievements). Per-user tables
  scope with `auth.uid() = user_id`; shared content tables (characters, scenarios,
  expressions) are read-only reference data.
- **Every API route and server component authenticates first.** Supabase third-party
  auth only trusts the JWKS of five named providers (Clerk, Firebase, Auth0, Cognito,
  WorkOS), so PostgREST cannot verify Better Auth JWTs directly; in the 2026-07 audit
  this made every user-scoped query fail with 401. The Next.js server therefore verifies
  the Better Auth session itself (`getSessionUser()` in `src/lib/supabase/server.ts`)
  and then queries with the service-role key, keeping every query scoped to the verified
  session user id. Requests with no session receive an anon-key client, which RLS
  restricts to public reference data. Browsers never talk to PostgREST or Storage
  directly: profile and avatar mutations go through validated API routes.
- **Privileged database functions self-authorize.** The `SECURITY DEFINER` gamification
  functions accept a call only from the service role (whose callers have already
  session-verified the user and pass the verified id as `p_user_id`) or from an end-user
  JWT whose `auth.uid()` matches `p_user_id` (migration 005). Their execute grant is
  limited to the `authenticated` and `service_role` roles (the anonymous role cannot
  call them).
- **Storage is owner-scoped.** In the `avatars` and `chat-images` buckets a signed-in
  user can list and upload only within their own `{userId}/…` folder. Public image
  display continues to work through the public object URL (public buckets do not consult
  these policies for object reads), while cross-user or anonymous listing is not possible.
- **Account deletion is self-scoped:** the delete-account route operates only on the
  caller's own id, removing that user's rows and storage in foreign-key-safe order before
  the identity itself.

## 3. Transport, input validation, and untrusted data

Satisfies the requirements for HTTPS/TLS, input validation, and anti-CSRF protection.

- **TLS everywhere** (Vercel, Supabase). The auth proxy redirects unauthenticated page
  requests and returns 401 for unauthenticated API requests. Security headers and a
  Content-Security-Policy are configured at the framework layer.
- **Schema validation on every API route** (`src/lib/validations.ts`) using Zod: UUIDs,
  numeric ranges, enumerated actions, bounded string lengths, and a bounded voice-id
  format for text-to-speech.
- **No SQL injection surface:** all queries use the Supabase query builder
  (parameterized); profile search escapes ILIKE wildcards before use.
- **Audio uploads** are size-bounded; speech is sent to iFlytek for scoring and is not
  stored.
- **Anti-CSRF:** Better Auth session cookies are `SameSite=Lax` and `HttpOnly`, and Better
  Auth validates the request origin against a trusted-origins list, so a cross-site page
  cannot drive a state-changing request with the session cookie.
- **LLM prompt handling:** end-user chat content is placed in the user-message position;
  system prompts are built from operator-controlled character and scenario records, not
  from end-user input.

## 4. Secrets and cryptography

Satisfies the requirement for secure credential management and encryption of sensitive
data.

- Configuration is by environment variable; no secrets are committed to source control
  (only example templates are tracked). The Supabase service-role key is read only through
  a server-only accessor and is used solely on trusted server paths, never on the client.
- All transport is TLS; user data at rest is held in Supabase Postgres under Row-Level
  Security.

## 5. Cloud sub-processors (for the PIA and privacy notice)

Supabase (Mumbai region), Vercel, OpenRouter, Google Gemini (fallback), and iFlytek
(mainland China, for Putonghua audio scoring) process data outside Hong Kong. Audio is
transient (scored, not stored), but the mainland processing path must still be disclosed
under the PDPO. These processors must appear in the privacy notice and the Personal Data
Privacy Impact Assessment.

## 6. Requirement mapping

### Minimum Security Standard: Application Systems

| ITSO requirement | How XiYouQuest meets it |
|---|---|
| Secure data transport (HTTPS) | TLS everywhere (Vercel, Supabase) |
| Application development (OWASP) | Zod validation, parameterized queries, security headers/CSP, SameSite cookies + origin check |
| Access control on sensitive functions | Row-Level Security on all user tables; per-route auth; self-authorizing RPCs; owner-scoped storage |
| Encryption of sensitive data | TLS in transit; data at rest under RLS; service-role key server-only |

### Minimum Security Standard: SaaS on Cloud

| ITSO requirement | How XiYouQuest meets it |
|---|---|
| Credential management / SSO | HKUST OIDC (Entra), tenant-pinned; email/password disabled |
| Transport encryption (TLS) | Enforced by Vercel and Supabase |
| Logging for forensic use | Supabase platform logs; per-user rows are attributable via `auth.uid()` |
| Data management | Self-scoped account deletion removes user data and storage |

### Application Development Guidelines

| Guideline | How XiYouQuest meets it |
|---|---|
| Design against OWASP Top 10 | Framework protections plus the controls in sections 1-4 |
| Access control on sensitive locations | Row-Level Security + per-route auth (section 2) |
| Encrypt sensitive data in transit | TLS throughout (section 3) |
| Validate all user input | Zod at every API boundary; UUID, range, and length bounds (section 3) |
| Anti-CSRF protection | SameSite `HttpOnly` session cookie + origin validation (section 3) |
| Remove test data / accounts before production | No email/password path; login is HKUST OIDC only |
| Disable legacy SSL | Managed platforms enforce modern TLS only |

### Owned in the ITSO compliance register (operational, not application code)

CITARS registration, the Personal Data Privacy Impact Assessment, the Cloud Service
Provider checklist, the ITSO web-application vulnerability scan, multi-factor
authentication on provider admin accounts, a tested backup/restore runbook, and the
external-user identity and data rules are tracked with CLE and ITSO rather than in this
repository.

> Note: Supabase Auth's leaked-password protection is not enabled because Supabase Auth's
> password path is not used; authentication is HKUST OIDC only, so no password store sits
> in the login path.
