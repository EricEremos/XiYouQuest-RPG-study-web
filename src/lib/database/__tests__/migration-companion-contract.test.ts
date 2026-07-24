// @vitest-environment node

import type { PGlite } from "@electric-sql/pglite";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  applyRepairChain,
  canonicalMigration,
  createFixtureDatabase,
  NEW_PROFILE,
  PROFILE_WITH_SELECTION,
  resetFixtureDatabase,
  SECOND_DEFAULT_CHARACTER,
  STARTER_CHARACTER,
  UNLOCKED_CHARACTER,
} from "./migration-test-utils";

vi.setConfig({ hookTimeout: 90_000, testTimeout: 90_000 });

describe.sequential("default companion migration contract", () => {
  let database: PGlite;

  beforeAll(async () => {
    database = await createFixtureDatabase();
  });

  beforeEach(async () => {
    await resetFixtureDatabase(database);
  });

  afterAll(async () => {
    await database.close();
  });

  it("repairs a catalog with no default and provisions new profiles", async () => {
    await database.exec("UPDATE public.characters SET is_default = false");
    await applyRepairChain(database);

    const defaultCharacters = await database.query<{
      id: string;
      unlock_cost_xp: number;
    }>(`
      SELECT id, unlock_cost_xp
      FROM public.characters
      WHERE is_default = true
    `);
    expect(defaultCharacters.rows).toEqual([
      { id: STARTER_CHARACTER, unlock_cost_xp: 0 },
    ]);

    await database.exec(`
      INSERT INTO public.profiles (id, display_name)
      VALUES ('${NEW_PROFILE}', 'New Profile')
    `);
    const newProfileSelection = await database.query<{
      character_id: string;
      is_selected: boolean;
    }>(`
      SELECT character_id, is_selected
      FROM public.user_characters
      WHERE user_id = '${NEW_PROFILE}'
    `);
    expect(newProfileSelection.rows).toEqual([
      { character_id: STARTER_CHARACTER, is_selected: true },
    ]);
  });

  it("normalizes duplicate defaults and duplicate selections before enforcing uniqueness", async () => {
    await database.exec(`
      INSERT INTO public.characters (
        id,
        name,
        unlock_cost_xp,
        is_default
      )
      VALUES (
        '${SECOND_DEFAULT_CHARACTER}',
        'Second Starter',
        50,
        true
      );

      INSERT INTO public.user_characters (
        user_id,
        character_id,
        unlocked_at,
        is_selected
      )
      VALUES (
        '${PROFILE_WITH_SELECTION}',
        '${STARTER_CHARACTER}',
        '2026-01-01T00:00:00Z',
        true
      );
    `);

    await applyRepairChain(database);

    const defaults = await database.query<{
      id: string;
      is_default: boolean;
    }>(`
      SELECT id, is_default
      FROM public.characters
      WHERE is_default = true
    `);
    expect(defaults.rows).toEqual([
      { id: STARTER_CHARACTER, is_default: true },
    ]);

    const selected = await database.query<{
      character_id: string;
    }>(`
      SELECT character_id
      FROM public.user_characters
      WHERE user_id = '${PROFILE_WITH_SELECTION}'
        AND is_selected = true
    `);
    expect(selected.rows).toEqual([
      { character_id: UNLOCKED_CHARACTER },
    ]);

    await expect(
      database.exec(`
        UPDATE public.characters
        SET is_default = true
        WHERE id = '${SECOND_DEFAULT_CHARACTER}'
      `),
    ).rejects.toThrow();
    await expect(
      database.exec(`
        UPDATE public.user_characters
        SET is_selected = true
        WHERE user_id = '${PROFILE_WITH_SELECTION}'
          AND character_id = '${STARTER_CHARACTER}'
      `),
    ).rejects.toThrow();
  });

  it("backfills missing unlocks without replacing an existing selection", async () => {
    await applyRepairChain(database);

    const selections = await database.query<{
      display_name: string;
      character_id: string;
      is_selected: boolean;
    }>(`
      SELECT
        p.display_name,
        uc.character_id,
        uc.is_selected
      FROM public.user_characters uc
      JOIN public.profiles p ON p.id = uc.user_id
      ORDER BY p.display_name, uc.character_id
    `);
    expect(selections.rows).toEqual([
      {
        display_name: "Existing Selection",
        character_id: STARTER_CHARACTER,
        is_selected: false,
      },
      {
        display_name: "Existing Selection",
        character_id: UNLOCKED_CHARACTER,
        is_selected: true,
      },
      {
        display_name: "Missing Default",
        character_id: STARTER_CHARACTER,
        is_selected: true,
      },
    ]);

    await database.exec(canonicalMigration);
    const invariantCounts = await database.query<{
      profiles_without_selection: number;
      profiles_with_multiple_selection: number;
    }>(`
      SELECT
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
    expect(invariantCounts.rows[0]).toEqual({
      profiles_without_selection: 0,
      profiles_with_multiple_selection: 0,
    });
  });
});
