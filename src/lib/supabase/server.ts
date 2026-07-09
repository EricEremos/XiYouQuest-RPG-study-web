import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";

/**
 * Server-side Supabase client for the current request.
 *
 * After the HKUST SSO migration, auth is Better Auth (not Supabase Auth), so
 * there are no `sb-*` session cookies. Instead we attach the request user's
 * Better Auth JWT via the `accessToken` option: Supabase is configured to
 * trust our JWKS (third-party auth), so PostgREST/Storage evaluate RLS with
 * `auth.uid()` = the JWT `sub`. Unauthenticated requests send no token and are
 * treated as `anon` (public-read policies still work).
 */
export async function createClient() {
  const requestHeaders = await headers();
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      accessToken: async () => {
        const result = await auth.api.getToken({ headers: requestHeaders });
        return result?.token ?? null;
      },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export interface SessionUser {
  id: string;
  email: string;
}

/**
 * The authenticated user for the current request, or null. Replacement for
 * `supabase.auth.getUser()` — reads the Better Auth session cookie server-side.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user) return null;
  return { id: session.user.id, email: session.user.email };
}
