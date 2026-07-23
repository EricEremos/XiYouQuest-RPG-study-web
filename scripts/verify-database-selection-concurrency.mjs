#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";

import pg from "pg";

import {
  loadDatabaseUrl,
  setAuthContext,
} from "./db-contract-test-helpers.mjs";

if (
  process.env.XIYOUQUEST_DB_INTEGRATION !== "1" ||
  process.env.XIYOUQUEST_DB_POST_APPLY !== "1"
) {
  throw new Error(
    "Refusing committed concurrency verification. Set XIYOUQUEST_DB_INTEGRATION=1 and XIYOUQUEST_DB_POST_APPLY=1 after the reviewed migrations are applied.",
  );
}

const { clientConfig, safeTarget } = loadDatabaseUrl();
const setup = new pg.Client({
  ...clientConfig,
  application_name: "xiyouquest-contract-setup",
});
const first = new pg.Client({
  ...clientConfig,
  application_name: "xiyouquest-contract-first",
});
const second = new pg.Client({
  ...clientConfig,
  application_name: "xiyouquest-contract-second",
});
const profileId = crypto.randomUUID();
let fixtureCreated = false;

console.log(
  `XiYouQuest DB concurrency target: ${safeTarget} (temporary committed fixture with verified cleanup)`,
);

await Promise.all([setup.connect(), first.connect(), second.connect()]);

try {
  const { rows: appliedMigrations } = await setup.query(
    `SELECT version
     FROM supabase_migrations.schema_migrations
     WHERE version = ANY($1::TEXT[])`,
    [
      [
        "20260723180000",
        "20260723183000",
        "20260723183100",
      ],
    ],
  );
  assert.equal(
    appliedMigrations.length,
    3,
    "reviewed migrations must be recorded as applied before concurrency verification",
  );

  const { rows: targetCharacters } = await setup.query(
    `SELECT id
     FROM public.characters
     WHERE is_default = false
     ORDER BY name, id
     LIMIT 2`,
  );
  assert.equal(
    targetCharacters.length,
    2,
    "concurrency verification requires two non-default characters",
  );
  const firstTargetId = targetCharacters[0].id;
  const secondTargetId = targetCharacters[1].id;

  await setup.query("BEGIN");
  await setup.query(
    `INSERT INTO public.profiles
       (id, username, display_name, total_xp, current_level, login_streak)
     VALUES ($1, $2, 'Concurrency Contract User', 0, 1, 0)`,
    [profileId, `contract-concurrency-${profileId.slice(0, 8)}`],
  );
  await setup.query(
    `INSERT INTO public.user_characters
       (user_id, character_id, is_selected)
     VALUES ($1, $2, false), ($1, $3, false)`,
    [profileId, firstTargetId, secondTargetId],
  );
  await setup.query("COMMIT");
  fixtureCreated = true;

  await Promise.all([first.query("BEGIN"), second.query("BEGIN")]);
  await Promise.all([
    setAuthContext(first, "authenticated", profileId),
    setAuthContext(second, "authenticated", profileId),
  ]);

  await first.query("SELECT public.select_user_character($1::UUID)", [
    firstTargetId,
  ]);
  const secondSelection = second.query(
    "SELECT public.select_user_character($1::UUID)",
    [secondTargetId],
  );

  await new Promise((resolve) => setTimeout(resolve, 250));
  const { rows: waitingRows } = await setup.query(
    `SELECT wait_event_type, wait_event
     FROM pg_stat_activity
     WHERE pid = $1`,
    [second.processID],
  );
  assert.equal(waitingRows[0]?.wait_event_type, "Lock");

  await first.query("COMMIT");
  await secondSelection;
  await second.query("COMMIT");

  const { rows: selectedRows } = await setup.query(
    `SELECT character_id
     FROM public.user_characters
     WHERE user_id = $1
       AND is_selected = true`,
    [profileId],
  );
  assert.deepEqual(selectedRows, [{ character_id: secondTargetId }]);

  console.log(
    JSON.stringify(
      {
        status: "passed",
        checks: [
          "second RPC waited on the first profile-row lock",
          "both concurrent transactions committed",
          "the last serialized selection won",
          "exactly one selected companion remained",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await Promise.allSettled([
    first.query("ROLLBACK"),
    second.query("ROLLBACK"),
  ]);
  if (fixtureCreated) {
    try {
      await setup.query("DELETE FROM public.profiles WHERE id = $1", [
        profileId,
      ]);
    } catch (cleanupError) {
      console.error(
        "Concurrency fixture cleanup failed; remove the logged contract profile by its generated UUID.",
      );
      throw cleanupError;
    }
  }
  await Promise.allSettled([setup.end(), first.end(), second.end()]);
}
