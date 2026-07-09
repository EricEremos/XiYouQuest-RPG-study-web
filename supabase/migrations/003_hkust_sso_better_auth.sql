-- ============================================================================
-- HKUST SSO migration: Supabase Auth  ->  Better Auth (Microsoft Entra OIDC)
-- ============================================================================
-- Auth now lives in Better Auth. Its tables sit in a dedicated `better_auth`
-- schema of THIS same database. `public.profiles` is decoupled from
-- Supabase's `auth.users`; user ids remain UUIDs so every existing
-- `auth.uid() = user_id` RLS policy keeps working (Supabase third-party auth
-- reads the Better Auth JWT `sub`). All pre-existing users are removed.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Better Auth schema + tables
--    (mirrors `npx @better-auth/cli generate`; user.id is a TEXT column that
--     holds a UUID string — cast to uuid by auth.uid() at query time.)
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS better_auth;

CREATE TABLE IF NOT EXISTS better_auth."user" (
  "id" text NOT NULL PRIMARY KEY,
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL,
  "image" text,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS better_auth."session" (
  "id" text NOT NULL PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  "token" text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL,
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES better_auth."user" ("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS better_auth."account" (
  "id" text NOT NULL PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES better_auth."user" ("id") ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope" text,
  "password" text,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS better_auth."verification" (
  "id" text NOT NULL PRIMARY KEY,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS better_auth."jwks" (
  "id" text NOT NULL PRIMARY KEY,
  "publicKey" text NOT NULL,
  "privateKey" text NOT NULL,
  "createdAt" timestamptz NOT NULL,
  "expiresAt" timestamptz
);

CREATE INDEX IF NOT EXISTS "session_userId_idx" ON better_auth."session" ("userId");
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON better_auth."account" ("userId");
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON better_auth."verification" ("identifier");

-- ---------------------------------------------------------------------------
-- 2. Decouple public.profiles from Supabase Auth
--    - drop the auth.users -> profiles provisioning trigger (replaced by the
--      Better Auth `user.create.after` hook in src/lib/auth.ts)
--    - drop the FK from profiles.id to auth.users(id)
--    - drop the now-unused discord_id column (Discord login removed)
--    The `on_profile_created` trigger (unlock default characters) is KEPT.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Drop the profiles.id -> auth.users(id) FK by discovering its real name,
-- rather than assuming the default `profiles_id_fkey` (an earlier migration
-- may have named it differently; a wrong assumption would silently leave the
-- FK in place and block `DELETE FROM auth.users` below).
DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT con.conname INTO fk_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  JOIN pg_class fref ON fref.oid = con.confrelid
  JOIN pg_namespace fnsp ON fnsp.oid = fref.relnamespace
  WHERE con.contype = 'f'
    AND nsp.nspname = 'public'
    AND rel.relname = 'profiles'
    AND fnsp.nspname = 'auth'
    AND fref.relname = 'users';
  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', fk_name);
  END IF;
END $$;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS discord_id;

-- ---------------------------------------------------------------------------
-- 3. Remove all pre-existing users and their data (users are disposable).
--    TRUNCATE ... CASCADE follows every ON DELETE CASCADE FK from profiles
--    (progress, characters, practice, chat, learning, quests, friendships,
--     achievements, mock exams, ...). Public content tables are untouched.
-- ---------------------------------------------------------------------------
TRUNCATE public.profiles CASCADE;
DELETE FROM auth.users;

-- ---------------------------------------------------------------------------
-- 4. RLS is intentionally UNCHANGED. Policies keep using `auth.uid() = <col>`;
--    with Supabase third-party auth configured against the Better Auth JWKS,
--    auth.uid() resolves to the JWT `sub` (the UUID user id). Storage bucket
--    policies (avatars, chat-images) likewise keep working unchanged.
-- ---------------------------------------------------------------------------
