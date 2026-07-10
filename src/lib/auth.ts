// Server-side Better Auth instance. Mounted by the catch-all route at
// `app/api/auth/[...all]/route.ts`.
//
// Architecture notes (HKUST SSO migration — see docs/oidc-redirect-uris.md):
// - Sign-in is HKUST OIDC (Microsoft Entra, staff tenant) ONLY. No
//   email/password, no social providers.
// - Better Auth tables (user, session, account, verification, jwks) live in
//   the `better_auth` schema of the SAME Supabase Postgres that holds app
//   data. The `auth` schema is owned by (now-dormant) Supabase Auth and must
//   not be touched.
// - User ids are UUIDs (generateId below) so `public.profiles.id uuid` and
//   every `auth.uid() = user_id` RLS policy keep working: Supabase is
//   configured to trust this instance's JWKS (third-party auth), and
//   `auth.uid()` reads the JWT `sub` claim.
// - The jwt plugin signs ES256 — Supabase verifies RS256/ES256, NOT
//   better-auth's EdDSA default.

import { betterAuth } from "better-auth";
import { jwt, genericOAuth } from "better-auth/plugins";
import { APIError } from "better-auth/api";
import { createClient } from "@supabase/supabase-js";
import { Pool } from "pg";

import { SUPABASE_SERVICE_ROLE_KEY } from "@/lib/env";

const databaseUrl =
  process.env.BETTER_AUTH_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:54322/postgres";

// Session pooler (port 5432) required — Supavisor transaction mode does not
// reliably honor the search_path startup option.
const pool = new Pool({
  connectionString: databaseUrl,
  options: "-c search_path=better_auth,public",
});

// Single source of truth for the app's own origin: Better Auth's baseURL and
// the sole trustedOrigin (server-side backstop against crafted cross-origin
// callback / redirect URLs).
const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

// Fail fast in production if the session secret is missing — otherwise Better
// Auth generates a per-process secret and sessions break on every deploy.
if (process.env.NODE_ENV === "production" && !process.env.BETTER_AUTH_SECRET) {
  throw new Error(
    "BETTER_AUTH_SECRET is required in production. Generate with `openssl rand -base64 32`.",
  );
}

/**
 * Delete the Better Auth user row (and, via ON DELETE CASCADE, its sessions
 * and OAuth accounts). Used by the account-deletion route after it has removed
 * the user's application data. Replaces Supabase's `admin.auth.admin.deleteUser`.
 */
export async function deleteAuthUser(userId: string): Promise<void> {
  await pool.query('DELETE FROM better_auth."user" WHERE id = $1', [userId]);
}

const ALLOWED_EMAIL_DOMAINS = ["ust.hk", "connect.ust.hk"];

function isAllowedEmail(email: string): boolean {
  const domain = email.toLowerCase().split("@")[1] ?? "";
  return ALLOWED_EMAIL_DOMAINS.includes(domain);
}

// HKUST OIDC (Entra ID, staff tenant — students authenticate there too once
// ITSO assigns them). providerId "hkust" MUST match the redirect URI
// registered on the Entra app: {origin}/api/auth/oauth2/callback/hkust
// (same pattern as the sibling Meli app; see docs/oidc-redirect-uris.md).
// The slot is dormant until all three env vars exist, so builds and dev
// without credentials keep working.
const hkustProviders = [
  {
    providerId: "hkust",
    clientId: process.env.HKUST_XYQ_CLIENT_ID ?? "",
    // Public-client (PKCE) flow: HKUST's Entra apps authenticate with PKCE and
    // no client secret (same as the sibling Meli app). Better Auth only puts a
    // client_secret on the token request when this is non-empty
    // (@better-auth/core validate-authorization-code.mjs), so leaving it empty
    // performs a clean public-client exchange. Set HKUST_XYQ_CLIENT_SECRET only
    // if ITSO ever registers the app as confidential.
    clientSecret: process.env.HKUST_XYQ_CLIENT_SECRET ?? "",
    discoveryUrl: process.env.HKUST_DISCOVERY_URL ?? "",
    scopes: ["openid", "profile", "email"],
    // Required for the public-client flow and hardens against code
    // interception; Entra requires PKCE for public clients.
    pkce: true,
    // Always show the account picker — HKUST users commonly hold both a
    // personal/student and a staff Microsoft session in the same browser.
    authorizationUrlParams: { prompt: "select_account" },
    // Entra frequently omits the `email` claim; the address then arrives in
    // preferred_username. The domain gate below depends on this mapping.
    mapProfileToUser: (profile: Record<string, unknown>) => ({
      email: String(profile.email ?? profile.preferred_username ?? "")
        .toLowerCase(),
      name: String(profile.name ?? profile.preferred_username ?? "Learner"),
    }),
  },
  // Mount whenever the client id + discovery URL are present — the client
  // secret is optional (public-client PKCE).
].filter((p) => p.clientId && p.discoveryUrl);

export const auth = betterAuth({
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL,
  trustedOrigins: [baseURL],

  emailAndPassword: { enabled: false },

  advanced: {
    database: {
      // UUIDs keep `profiles.id uuid` and all `auth.uid() = user_id` RLS
      // policies valid — auth.uid() casts the JWT `sub` to uuid.
      generateId: () => crypto.randomUUID(),
    },
  },

  user: {
    // Used by the delete-account route: removes the better_auth user row and
    // cascades sessions/accounts after the route has cleaned up app tables.
    deleteUser: { enabled: true },
  },

  plugins: [
    // Issues ES256-signed JWTs and serves the JWKS at /api/auth/jwks.
    // Supabase's third-party auth is registered against that JWKS URL, and
    // PostgREST requires `role: "authenticated"` to apply RLS as a signed-in
    // user (anon otherwise).
    jwt({
      jwks: { keyPairConfig: { alg: "ES256" } },
      jwt: {
        definePayload: ({ user }) => ({
          role: "authenticated",
          email: user.email,
        }),
      },
    }),
    ...(hkustProviders.length
      ? [genericOAuth({ config: hkustProviders })]
      : []),
  ],

  databaseHooks: {
    user: {
      create: {
        // Domain gate — throwing here aborts the user row create in the same
        // transaction, so a rejected SSO sign-up leaves no orphan. This is
        // the only authorization we apply besides Entra's own app-assignment.
        before: async (user) => {
          if (!isAllowedEmail(user.email)) {
            throw new APIError("BAD_REQUEST", {
              message:
                "Only HKUST accounts (@ust.hk / @connect.ust.hk) can sign in.",
            });
          }
        },
        // Replaces the old `on_auth_user_created` DB trigger: create the
        // public.profiles row keyed on the SAME uuid. The existing
        // `on_profile_created` trigger then unlocks the default characters.
        // If the profile insert fails we delete the just-created better_auth
        // user so the account can retry cleanly (no half-provisioned state).
        after: async (user) => {
          try {
            await pool.query(
              `INSERT INTO public.profiles (id, display_name)
               VALUES ($1, $2)
               ON CONFLICT (id) DO NOTHING`,
              [user.id, user.name ?? user.email.split("@")[0]],
            );
          } catch (error) {
            try {
              await pool.query(
                'DELETE FROM better_auth."user" WHERE id = $1',
                [user.id],
              );
            } catch (cleanupError) {
              console.error(
                "[auth] failed to remove orphan better_auth user after profile insert failure",
                cleanupError,
              );
            }
            throw error;
          }

          // Fire-and-forget account_created achievement (was in the old
          // Supabase OAuth callback). Service-role client: there is no user
          // JWT yet at user-creation time.
          try {
            const admin = createClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              SUPABASE_SERVICE_ROLE_KEY(),
            );
            const { checkAndUnlockAchievements } = await import(
              "@/lib/achievements/check"
            );
            await checkAndUnlockAchievements(admin, user.id, {
              type: "account_created",
            });
          } catch (error) {
            console.error("[auth] account_created achievement check failed", error);
          }
        },
      },
    },
  },
});
