// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

import { ACHIEVEMENTS } from "@/lib/achievements/definitions";

const MIGRATION_DIRECTORY = join(process.cwd(), "supabase", "migrations");
const repairMigration = readFileSync(
  join(
    MIGRATION_DIRECTORY,
    "20260723082001_repair_default_companions_and_achievement_catalog.sql",
  ),
  "utf8",
);
const canonicalMigration = readFileSync(
  join(
    MIGRATION_DIRECTORY,
    "20260724123000_canonicalize_achievements_and_default_companion.sql",
  ),
  "utf8",
);

const fixtureSql = `
  CREATE ROLE anon;
  CREATE ROLE authenticated;
  CREATE ROLE service_role;

  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid()
  RETURNS UUID
  LANGUAGE SQL
  STABLE
  AS $$ SELECT NULL::UUID $$;

  CREATE TABLE public.profiles (
    id UUID PRIMARY KEY,
    display_name TEXT NOT NULL
  );

  CREATE TABLE public.characters (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT false
  );

  CREATE TABLE public.user_characters (
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    character_id UUID NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
    is_selected BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (user_id, character_id)
  );

  INSERT INTO public.profiles (id, display_name)
  VALUES
    ('00000000-0000-4000-8000-000000000001', 'Missing Default'),
    ('00000000-0000-4000-8000-000000000002', 'Existing Selection');

  INSERT INTO public.characters (id, name, is_default)
  VALUES
    ('10000000-0000-4000-8000-000000000001', 'Starter', true),
    ('10000000-0000-4000-8000-000000000002', 'Unlocked Later', false);

  INSERT INTO public.user_characters (user_id, character_id, is_selected)
  VALUES (
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
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

interface CatalogRow {
  key: string;
  name: string;
  description: string;
  emoji: string;
  tier: string;
  sort_order: number;
}

describe("canonical XiYouQuest database migrations", () => {
  it(
    "bootstraps achievements and repairs the single default companion idempotently",
    async () => {
      const database = new PGlite();

      try {
        await database.exec(fixtureSql);
        await database.exec(repairMigration);

        const tableBeforeCanonicalMigration = await database.query<{
          table_name: string | null;
        }>("SELECT to_regclass('public.achievements')::TEXT AS table_name");
        expect(tableBeforeCanonicalMigration.rows[0]?.table_name).toBeNull();

        await database.exec(canonicalMigration);

        const catalog = await database.query<CatalogRow>(`
          SELECT key, name, description, emoji, tier, sort_order
          FROM public.achievements
          ORDER BY sort_order
        `);
        expect(catalog.rows).toEqual(
          ACHIEVEMENTS.map((achievement) => ({
            key: achievement.key,
            name: achievement.name,
            description: achievement.description,
            emoji: achievement.emoji,
            tier: achievement.tier,
            sort_order: achievement.sortOrder,
          })),
        );

        const selections = await database.query<{
          display_name: string;
          character_name: string;
          is_selected: boolean;
        }>(`
          SELECT
            p.display_name,
            c.name AS character_name,
            uc.is_selected
          FROM public.user_characters uc
          JOIN public.profiles p ON p.id = uc.user_id
          JOIN public.characters c ON c.id = uc.character_id
          ORDER BY p.display_name, c.name
        `);
        expect(selections.rows).toEqual([
          {
            display_name: "Existing Selection",
            character_name: "Starter",
            is_selected: false,
          },
          {
            display_name: "Existing Selection",
            character_name: "Unlocked Later",
            is_selected: true,
          },
          {
            display_name: "Missing Default",
            character_name: "Starter",
            is_selected: true,
          },
        ]);

        await database.exec(`
          INSERT INTO public.profiles (id, display_name)
          VALUES ('00000000-0000-4000-8000-000000000003', 'New Profile');
        `);
        const newProfileSelection = await database.query<{
          character_name: string;
          is_selected: boolean;
        }>(`
          SELECT c.name AS character_name, uc.is_selected
          FROM public.user_characters uc
          JOIN public.characters c ON c.id = uc.character_id
          WHERE uc.user_id = '00000000-0000-4000-8000-000000000003'
        `);
        expect(newProfileSelection.rows).toEqual([
          { character_name: "Starter", is_selected: true },
        ]);

        await expect(
          database.exec(`
            INSERT INTO public.characters (id, name, is_default)
            VALUES (
              '10000000-0000-4000-8000-000000000003',
              'Second Starter',
              true
            );
          `),
        ).rejects.toThrow();

        const policyNames = await database.query<{ policyname: string }>(`
          SELECT policyname
          FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename IN ('achievements', 'user_achievements')
          ORDER BY policyname
        `);
        expect(policyNames.rows.map((row) => row.policyname)).toEqual([
          "Anyone can read achievements catalog",
          "Authenticated users can view all user_achievements",
          "Users can delete own achievements",
          "Users can insert own achievements",
        ]);

        const authenticatedPrivileges = await database.query<{
          table_name: string;
          privilege_type: string;
        }>(`
          SELECT table_name, privilege_type
          FROM information_schema.role_table_grants
          WHERE table_schema = 'public'
            AND table_name IN ('achievements', 'user_achievements')
            AND grantee = 'authenticated'
          ORDER BY table_name, privilege_type
        `);
        expect(authenticatedPrivileges.rows).toEqual([
          { table_name: "achievements", privilege_type: "SELECT" },
          { table_name: "user_achievements", privilege_type: "DELETE" },
          { table_name: "user_achievements", privilege_type: "INSERT" },
          { table_name: "user_achievements", privilege_type: "SELECT" },
        ]);

        await database.exec(canonicalMigration);

        const finalCounts = await database.query<{
          achievement_count: number;
          user_character_count: number;
          profiles_without_selection: number;
          profiles_with_multiple_selection: number;
        }>(`
          SELECT
            (SELECT count(*)::INTEGER FROM public.achievements)
              AS achievement_count,
            (SELECT count(*)::INTEGER FROM public.user_characters)
              AS user_character_count,
            (
              SELECT count(*)::INTEGER
              FROM public.profiles p
              WHERE NOT EXISTS (
                SELECT 1
                FROM public.user_characters uc
                WHERE uc.user_id = p.id
                  AND uc.is_selected = true
              )
            ) AS profiles_without_selection,
            (
              SELECT count(*)::INTEGER
              FROM (
                SELECT user_id
                FROM public.user_characters
                WHERE is_selected = true
                GROUP BY user_id
                HAVING count(*) > 1
              ) duplicate_selections
            ) AS profiles_with_multiple_selection
        `);
        expect(finalCounts.rows[0]).toEqual({
          achievement_count: ACHIEVEMENTS.length,
          user_character_count: 4,
          profiles_without_selection: 0,
          profiles_with_multiple_selection: 0,
        });
      } finally {
        await database.close();
      }
    },
    30_000,
  );
});
