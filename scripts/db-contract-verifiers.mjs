import assert from "node:assert/strict";
import crypto from "node:crypto";

import {
  assertExactIds,
  expectDatabaseError,
  setAuthContext,
  withRollbackSavepoint,
} from "./db-contract-test-helpers.mjs";

export async function verifyMigrationLock(control, contender) {
  const { rows: heldLocks } = await control.query(`
    SELECT relation::REGCLASS::TEXT AS relation_name
    FROM pg_locks
    WHERE pid = pg_backend_pid()
      AND granted
      AND mode = 'ShareRowExclusiveLock'
      AND relation IN (
        'public.profiles'::REGCLASS,
        'public.user_characters'::REGCLASS
      )
    ORDER BY relation_name
  `);
  assert.deepEqual(
    heldLocks.map((row) => row.relation_name),
    ["profiles", "user_characters"],
  );

  await contender.query("BEGIN");
  await contender.query("SET LOCAL lock_timeout = '750ms'");
  let lockError = null;
  try {
    await contender.query(
      "LOCK TABLE public.user_characters IN ROW EXCLUSIVE MODE",
    );
  } catch (error) {
    lockError = error;
  } finally {
    await contender.query("ROLLBACK");
  }
  assert.equal(lockError?.code, "55P03");
}

export async function verifyPrivilegesAndInvariant(client, fixture) {
  const passed = [];
  const { rows: privilegeRows } = await client.query(`
    SELECT
      has_function_privilege(
        'authenticated',
        'public.select_user_character(uuid)',
        'EXECUTE'
      ) AS authenticated_select,
      has_function_privilege(
        'anon',
        'public.select_user_character(uuid)',
        'EXECUTE'
      ) AS anon_select,
      has_function_privilege(
        'authenticated',
        'public.get_leaderboard_projection(text,text)',
        'EXECUTE'
      ) AS authenticated_leaderboard,
      has_function_privilege(
        'anon',
        'public.get_leaderboard_projection(text,text)',
        'EXECUTE'
      ) AS anon_leaderboard,
      has_function_privilege(
        'authenticated',
        'public.get_social_friend_stats()',
        'EXECUTE'
      ) AS authenticated_social,
      has_function_privilege(
        'anon',
        'public.get_social_friend_stats()',
        'EXECUTE'
      ) AS anon_social
  `);
  assert.deepEqual(privilegeRows[0], {
    authenticated_select: true,
    anon_select: false,
    authenticated_leaderboard: true,
    anon_leaderboard: false,
    authenticated_social: true,
    anon_social: false,
  });
  passed.push("function grants allow authenticated and deny anon");

  await expectDatabaseError(client, "anon RPC execution", ["42501"], async () => {
    await setAuthContext(client, "anon");
    await client.query(
      "SELECT public.select_user_character($1::uuid)",
      [fixture.currentTargetId],
    );
  });
  passed.push("anonymous selection RPC is rejected");

  await withRollbackSavepoint(client, "atomic selection", async () => {
    await setAuthContext(client, "authenticated", fixture.currentUserId);
    await client.query(
      "SELECT public.select_user_character($1::uuid)",
      [fixture.currentTargetId],
    );
    const { rows } = await client.query(
      `SELECT character_id
       FROM public.user_characters
       WHERE user_id = $1
         AND is_selected = true`,
      [fixture.currentUserId],
    );
    assert.deepEqual(rows, [{ character_id: fixture.currentTargetId }]);
  });
  passed.push("authenticated selection is atomic and user-scoped");

  await expectDatabaseError(
    client,
    "cross-user character selection",
    ["42501"],
    async () => {
      await setAuthContext(client, "authenticated", fixture.currentUserId);
      await client.query(
        "SELECT public.select_user_character($1::uuid)",
        [fixture.friendOnlyTargetId],
      );
    },
  );
  passed.push("selection RPC rejects characters not unlocked by the caller");

  await expectDatabaseError(
    client,
    "zero selected companions",
    ["23514"],
    async () => {
      await setAuthContext(client, "authenticated", fixture.currentUserId);
      await client.query(
        `UPDATE public.user_characters
         SET is_selected = false
         WHERE user_id = $1
           AND is_selected = true`,
        [fixture.currentUserId],
      );
      await client.query(
        "SET CONSTRAINTS user_characters_exactly_one_selected_trigger IMMEDIATE",
      );
    },
  );
  passed.push("deferred constraint rejects zero selected companions");

  await expectDatabaseError(
    client,
    "multiple selected companions",
    ["23505"],
    async () => {
      await setAuthContext(client, "authenticated", fixture.currentUserId);
      await client.query(
        `UPDATE public.user_characters
         SET is_selected = true
         WHERE user_id = $1
           AND character_id = $2`,
        [fixture.currentUserId, fixture.currentTargetId],
      );
    },
  );
  passed.push("partial unique index rejects multiple selected companions");

  return passed;
}

export async function verifyProfileProvisioningInvariant(
  client,
  fixtureIds,
) {
  const profileId = crypto.randomUUID();
  fixtureIds.push(profileId);

  await expectDatabaseError(
    client,
    "profile provisioning without a default character",
    ["23514"],
    async () => {
      await client.query("UPDATE public.characters SET is_default = false");
      await client.query(
        `INSERT INTO public.profiles
           (id, username, display_name, total_xp, current_level, login_streak)
         VALUES ($1, $2, 'No Default Contract User', 0, 1, 0)`,
        [profileId, `contract-no-default-${profileId.slice(0, 8)}`],
      );
      await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    },
  );

  return "profile creation rejects a missing default companion";
}

export async function verifyPrivilegedOwnerReassignmentInvariant(
  client,
  fixture,
) {
  await expectDatabaseError(
    client,
    "privileged selected-character owner reassignment",
    ["23514"],
    async () => {
      await setAuthContext(client, "authenticated", fixture.currentUserId);
      await client.query(
        "SELECT public.select_user_character($1::uuid)",
        [fixture.currentTargetId],
      );
      await client.query("RESET ROLE");

      await setAuthContext(client, "authenticated", fixture.friendId);
      await client.query(
        "SELECT public.select_user_character($1::uuid)",
        [fixture.friendOnlyTargetId],
      );
      await client.query("RESET ROLE");

      await client.query(
        `UPDATE public.user_characters
         SET is_selected = false
         WHERE user_id = $1
           AND is_selected = true`,
        [fixture.friendId],
      );
      await client.query(
        `UPDATE public.user_characters
         SET user_id = $2
         WHERE user_id = $1
           AND character_id = $3
           AND is_selected = true`,
        [
          fixture.currentUserId,
          fixture.friendId,
          fixture.currentTargetId,
        ],
      );
      await client.query(
        "SET CONSTRAINTS user_characters_exactly_one_selected_trigger IMMEDIATE",
      );
    },
  );

  return "privileged owner changes validate both old and new profiles";
}

export async function verifyProjections(client, fixture) {
  const passed = [];
  await expectDatabaseError(
    client,
    "invalid leaderboard metric",
    ["22023"],
    async () => {
      await setAuthContext(client, "authenticated", fixture.currentUserId);
      await client.query(
        "SELECT * FROM public.get_leaderboard_projection('invalid', 'global')",
      );
    },
  );
  await expectDatabaseError(
    client,
    "invalid leaderboard scope",
    ["22023"],
    async () => {
      await setAuthContext(client, "authenticated", fixture.currentUserId);
      await client.query(
        "SELECT * FROM public.get_leaderboard_projection('xp', 'invalid')",
      );
    },
  );
  passed.push("leaderboard RPC rejects invalid metric and scope");

  await withRollbackSavepoint(client, "projection scope", async () => {
    await setAuthContext(client, "authenticated", fixture.currentUserId);

    // Profile names and selected companions are intentionally discoverable to
    // authenticated users for search/leaderboards. Raw learning history is not.
    const { rows: rawProgress } = await client.query(
      "SELECT user_id FROM public.user_progress ORDER BY user_id",
    );
    assert.deepEqual(rawProgress, [{ user_id: fixture.currentUserId }]);
    const { rows: rawSessions } = await client.query(
      "SELECT user_id FROM public.practice_sessions ORDER BY user_id",
    );
    assert.deepEqual(rawSessions, [{ user_id: fixture.currentUserId }]);

    const { rows: globalXp } = await client.query(
      "SELECT * FROM public.get_leaderboard_projection('xp', 'global')",
    );
    assert.equal(globalXp.length, 21);
    const current = globalXp.find((row) => row.id === fixture.currentUserId);
    assert.ok(current);
    assert.ok(Number(current.rank) > 20);

    for (const metric of ["xp", "accuracy", "streak"]) {
      const { rows } = await client.query(
        "SELECT * FROM public.get_leaderboard_projection($1, 'friends')",
        [metric],
      );
      assertExactIds(
        rows,
        [fixture.currentUserId, fixture.friendId],
        `${metric} friends projection leaked a non-friend`,
      );
    }

    const { rows: socialRows } = await client.query(
      "SELECT * FROM public.get_social_friend_stats()",
    );
    assertExactIds(
      socialRows,
      [fixture.currentUserId, fixture.friendId],
      "social projection leaked a non-friend",
    );
    assert.equal(
      socialRows.filter((row) => row.is_self).length,
      1,
    );
    assert.ok(
      socialRows.every(
        (row) =>
          row.selected_character &&
          typeof row.selected_character.name === "string",
      ),
    );
  });
  passed.push(
    "RLS and projections expose only self, accepted friends, and bounded global rows",
  );
  return passed;
}

export async function verifyProjectionBounds(client, fixture) {
  await withRollbackSavepoint(client, "projection bounds", async () => {
    const extraFriendIds = Array.from({ length: 205 }, () =>
      crypto.randomUUID(),
    );
    const extraProfiles = extraFriendIds.map((id, index) => ({
      id,
      username: `contract-bounded-friend-${index}-${id.slice(0, 8)}`,
      display_name: `Contract Bounded Friend ${String(index).padStart(3, "0")}`,
    }));

    await client.query(
      `INSERT INTO public.profiles
         (id, username, display_name, total_xp, current_level, login_streak)
       SELECT
         fixture.id,
         fixture.username,
         fixture.display_name,
         100,
         1,
         0
       FROM jsonb_to_recordset($1::jsonb) AS fixture(
         id UUID,
         username TEXT,
         display_name TEXT
       )`,
      [JSON.stringify(extraProfiles)],
    );
    await client.query(
      `INSERT INTO public.friendships (requester_id, addressee_id, status)
       SELECT $1, friend_id, 'accepted'
       FROM unnest($2::UUID[]) AS friend_id`,
      [fixture.currentUserId, extraFriendIds],
    );

    await setAuthContext(client, "authenticated", fixture.currentUserId);
    const { rows: leaderboardRows } = await client.query(
      "SELECT * FROM public.get_leaderboard_projection('xp', 'friends')",
    );
    const { rows: repeatedLeaderboardRows } = await client.query(
      "SELECT * FROM public.get_leaderboard_projection('xp', 'friends')",
    );
    const { rows: socialRows } = await client.query(
      "SELECT * FROM public.get_social_friend_stats()",
    );
    const { rows: repeatedSocialRows } = await client.query(
      "SELECT * FROM public.get_social_friend_stats()",
    );

    assert.equal(leaderboardRows.length, 201);
    assert.equal(socialRows.length, 201);
    assert.deepEqual(
      leaderboardRows.map((row) => row.id),
      repeatedLeaderboardRows.map((row) => row.id),
    );
    assert.deepEqual(
      socialRows.map((row) => [row.id, row.friendship_id]),
      repeatedSocialRows.map((row) => [row.id, row.friendship_id]),
    );
  });

  return "friend projections cap deterministic results at self plus 200 friends";
}
