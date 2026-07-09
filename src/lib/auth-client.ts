// Client-side Better Auth helper. Imported by React components.
// - `jwtClient` adds `authClient.token()`, which returns the ES256 JWT that
//   Supabase (PostgREST/Storage/Edge Functions) accepts via third-party auth.
// - `genericOAuthClient` types `authClient.signIn.oauth2({ providerId })`
//   used by the "Sign in with HKUST" button.
// baseURL is omitted so Better Auth defaults to window.location.origin —
// correct same-origin behavior on localhost, cle-xyq-dev, and cle-xyq alike.

import { createAuthClient } from "better-auth/react";
import { jwtClient, genericOAuthClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [jwtClient(), genericOAuthClient()],
});

export const { useSession, signIn, signOut } = authClient;
