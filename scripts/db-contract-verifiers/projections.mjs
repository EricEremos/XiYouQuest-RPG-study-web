import assert from "node:assert/strict";
import crypto from "node:crypto";

import {
  assertExactIds,
  expectDatabaseError,
  setAuthContext,
  withRollbackSavepoint,
} from "../db-contract-test-helpers.mjs";

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
