import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";

const MIGRATION_DIRECTORY = join(process.cwd(), "supabase", "migrations");

export const repairMigration = readFileSync(
  join(
    MIGRATION_DIRECTORY,
    "20260723082001_repair_default_companions_and_achievement_catalog.sql",
  ),
  "utf8",
);

export const canonicalMigration = readFileSync(
  join(
    MIGRATION_DIRECTORY,
    "20260724123000_canonicalize_achievements_and_default_companion.sql",
  ),
  "utf8",
);

export const PROFILE_WITHOUT_SELECTION =
  "00000000-0000-4000-8000-000000000001";
export const PROFILE_WITH_SELECTION =
  "00000000-0000-4000-8000-000000000002";
export const NEW_PROFILE = "00000000-0000-4000-8000-000000000003";
export const STARTER_CHARACTER = "10000000-0000-4000-8000-000000000001";
export const UNLOCKED_CHARACTER = "10000000-0000-4000-8000-000000000002";
export const SECOND_DEFAULT_CHARACTER =
  "10000000-0000-4000-8000-000000000003";

const roleFixtureSql = `
  CREATE ROLE anon;
  CREATE ROLE authenticated;
  CREATE ROLE service_role BYPASSRLS;

  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid()
  RETURNS UUID
  LANGUAGE SQL
  STABLE
  AS $$
    SELECT NULLIF(
      current_setting('request.jwt.claim.sub', true),
      ''
    )::UUID
  $$;
`;

const baseFixtureSql = `
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

  CREATE TABLE public.profiles (
    id UUID PRIMARY KEY,
    display_name TEXT NOT NULL
  );

  CREATE TABLE public.characters (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    unlock_cost_xp INTEGER NOT NULL DEFAULT 0,
    is_default BOOLEAN NOT NULL DEFAULT false
  );

  CREATE TABLE public.user_characters (
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    character_id UUID NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
    unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_selected BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (user_id, character_id)
  );

  INSERT INTO public.profiles (id, display_name)
  VALUES
    ('${PROFILE_WITHOUT_SELECTION}', 'Missing Default'),
    ('${PROFILE_WITH_SELECTION}', 'Existing Selection');

  INSERT INTO public.characters (id, name, unlock_cost_xp, is_default)
  VALUES
    ('${STARTER_CHARACTER}', 'Starter', 0, true),
    ('${UNLOCKED_CHARACTER}', 'Unlocked Later', 100, false);

  INSERT INTO public.user_characters (
    user_id,
    character_id,
    unlocked_at,
    is_selected
  )
  VALUES (
    '${PROFILE_WITH_SELECTION}',
    '${UNLOCKED_CHARACTER}',
    '2026-01-02T00:00:00Z',
    true
  );

  CREATE FUNCTION public.handle_unlock_defaults()
  RETURNS TRIGGER AS $$
  BEGIN
    INSERT INTO public.user_characters (user_id, character_id, is_selected)
    SELECT NEW.id, c.id, true
    FROM public.characters c
    WHERE c.is_default = true;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER;

  CREATE TRIGGER on_profile_created
    AFTER INSERT ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_unlock_defaults();
`;

export const preExistingAchievementSchemaSql = `
  CREATE TABLE public.achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    emoji TEXT NOT NULL,
    tier TEXT NOT NULL CHECK (tier IN ('common', 'uncommon', 'rare', 'epic')),
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE public.user_achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    achievement_id UUID NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
    unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, achievement_id)
  );

  ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

  GRANT SELECT ON public.achievements TO anon, authenticated;
  GRANT SELECT, INSERT, DELETE ON public.user_achievements TO authenticated;

  CREATE POLICY "Authenticated users can view all user_achievements"
    ON public.user_achievements
    FOR SELECT TO authenticated
    USING (true);
  CREATE POLICY "Users can delete own achievements"
    ON public.user_achievements
    FOR DELETE TO authenticated
    USING (user_id = (SELECT auth.uid()));

  INSERT INTO public.achievements (
    key,
    name,
    description,
    emoji,
    tier,
    sort_order
  )
  VALUES (
    'account_created',
    'Stale Name',
    'Stale description',
    '❌',
    'common',
    999
  );
`;

export async function createFixtureDatabase(): Promise<PGlite> {
  const database = new PGlite();
  await database.exec(roleFixtureSql);
  await database.exec(baseFixtureSql);
  return database;
}

export async function resetFixtureDatabase(database: PGlite): Promise<void> {
  await database.exec(`
    RESET ROLE;
    RESET request.jwt.claim.sub;
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
  `);
  await database.exec(baseFixtureSql);
}

export async function applyRepairChain(database: PGlite): Promise<void> {
  await database.exec(repairMigration);
  await database.exec(canonicalMigration);
}

export async function setAuthenticatedUser(
  database: PGlite,
  userId: string,
): Promise<void> {
  await database.exec(`
    SET request.jwt.claim.sub = '${userId}';
    SET ROLE authenticated;
  `);
}

export async function resetRole(database: PGlite): Promise<void> {
  await database.exec(`
    RESET ROLE;
    RESET request.jwt.claim.sub;
  `);
}
