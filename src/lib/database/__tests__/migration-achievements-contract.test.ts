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

import { ACHIEVEMENTS } from "@/lib/achievements/definitions";

import {
  applyRepairChain,
  canonicalMigration,
  createFixtureDatabase,
  preExistingAchievementSchemaSql,
  PROFILE_WITH_SELECTION,
  PROFILE_WITHOUT_SELECTION,
  repairMigration,
  resetRole,
  resetFixtureDatabase,
  setAuthenticatedUser,
} from "./migration-test-utils";

vi.setConfig({ hookTimeout: 90_000, testTimeout: 90_000 });

interface CatalogRow {
  key: string;
  name: string;
  description: string;
  emoji: string;
  tier: string;
  sort_order: number;
}

function expectedCatalog(): CatalogRow[] {
  return ACHIEVEMENTS.map((achievement) => ({
    key: achievement.key,
    name: achievement.name,
    description: achievement.description,
    emoji: achievement.emoji,
    tier: achievement.tier,
    sort_order: achievement.sortOrder,
  }));
}

describe.sequential("achievement migration contract", () => {
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

  it("creates the missing achievement schema and canonical catalog", async () => {
    await database.exec(repairMigration);
    const before = await database.query<{ table_name: string | null }>(
      "SELECT to_regclass('public.achievements')::TEXT AS table_name",
    );
    expect(before.rows[0]?.table_name).toBeNull();

    await database.exec(canonicalMigration);
    const catalog = await database.query<CatalogRow>(`
      SELECT key, name, description, emoji, tier, sort_order
      FROM public.achievements
      ORDER BY sort_order
    `);
    expect(catalog.rows).toEqual(expectedCatalog());
  });

  it("converges a production-shaped schema and removes unsafe legacy access", async () => {
    await database.exec(preExistingAchievementSchemaSql);
    await database.exec(canonicalMigration);

    const catalog = await database.query<CatalogRow>(`
      SELECT key, name, description, emoji, tier, sort_order
      FROM public.achievements
      ORDER BY sort_order
    `);
    expect(catalog.rows).toEqual(expectedCatalog());

    const policies = await database.query<{
      policyname: string;
      cmd: string;
    }>(`
      SELECT policyname, cmd
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'user_achievements'
      ORDER BY policyname
    `);
    expect(policies.rows).toEqual([
      { policyname: "Users can insert own achievements", cmd: "INSERT" },
      { policyname: "Users can read own achievements", cmd: "SELECT" },
    ]);

    const authenticatedPrivileges = await database.query<{
      privilege_type: string;
    }>(`
      SELECT privilege_type
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public'
        AND table_name = 'user_achievements'
        AND grantee = 'authenticated'
      ORDER BY privilege_type
    `);
    expect(authenticatedPrivileges.rows).toEqual([
      { privilege_type: "INSERT" },
      { privilege_type: "SELECT" },
    ]);
  });

  it("isolates earned rows while preserving the authenticated catalog contract", async () => {
    await applyRepairChain(database);
    const achievementIds = await database.query<{ id: string }>(`
      SELECT id
      FROM public.achievements
      ORDER BY sort_order
      LIMIT 3
    `);
    const [firstAchievement, secondAchievement, thirdAchievement] =
      achievementIds.rows.map((row) => row.id);

    await database.exec(`
      INSERT INTO public.user_achievements (user_id, achievement_id)
      VALUES
        ('${PROFILE_WITHOUT_SELECTION}', '${firstAchievement}'),
        ('${PROFILE_WITH_SELECTION}', '${secondAchievement}');
    `);

    await setAuthenticatedUser(database, PROFILE_WITHOUT_SELECTION);
    const visibleRows = await database.query<{ user_id: string }>(`
      SELECT user_id
      FROM public.user_achievements
      ORDER BY user_id
    `);
    expect(visibleRows.rows).toEqual([
      { user_id: PROFILE_WITHOUT_SELECTION },
    ]);

    await database.exec(`
      INSERT INTO public.user_achievements (user_id, achievement_id)
      VALUES ('${PROFILE_WITHOUT_SELECTION}', '${thirdAchievement}');
    `);
    await expect(
      database.exec(`
        INSERT INTO public.user_achievements (user_id, achievement_id)
        VALUES ('${PROFILE_WITH_SELECTION}', '${thirdAchievement}');
      `),
    ).rejects.toThrow();
    await expect(
      database.exec(`
        DELETE FROM public.user_achievements
        WHERE user_id = '${PROFILE_WITHOUT_SELECTION}';
      `),
    ).rejects.toThrow();

    const catalog = await database.query<{ count: number }>(`
      SELECT count(*)::INTEGER AS count
      FROM public.achievements
    `);
    expect(catalog.rows[0]?.count).toBe(ACHIEVEMENTS.length);
    await resetRole(database);

    await database.exec("SET ROLE anon");
    await expect(
      database.query("SELECT key FROM public.achievements"),
    ).rejects.toThrow();
    await database.exec("RESET ROLE");

    await database.exec("SET ROLE service_role");
    const serviceRows = await database.query<{ count: number }>(`
      SELECT count(*)::INTEGER AS count
      FROM public.user_achievements
    `);
    expect(serviceRows.rows[0]?.count).toBe(3);
    await database.exec("RESET ROLE");
  });

  it("is idempotent after canonical state is reached", async () => {
    await applyRepairChain(database);
    await database.exec(canonicalMigration);

    const counts = await database.query<{
      achievement_count: number;
      user_achievement_count: number;
    }>(`
      SELECT
        (SELECT count(*)::INTEGER FROM public.achievements)
          AS achievement_count,
        (SELECT count(*)::INTEGER FROM public.user_achievements)
          AS user_achievement_count
    `);
    expect(counts.rows[0]).toEqual({
      achievement_count: ACHIEVEMENTS.length,
      user_achievement_count: 0,
    });
  });
});
