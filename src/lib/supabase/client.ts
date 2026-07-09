import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { getAccessToken } from "@/lib/auth-token";

/**
 * Browser-side Supabase client.
 *
 * After the HKUST SSO migration, the client attaches the current Better Auth
 * JWT (fetched via `authClient.token()`, cached until near expiry) so that
 * direct table/storage queries run under the signed-in user's RLS. See
 * `@/lib/auth-token`.
 */
export function createClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      accessToken: async () => (await getAccessToken()) ?? null,
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
