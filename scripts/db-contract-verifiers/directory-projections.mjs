import assert from "node:assert/strict";

import {
  expectDatabaseError,
  setAuthContext,
  withRollbackSavepoint,
} from "../db-contract-test-helpers.mjs";

export async function verifyLeaderboardAvatarMasking(client, fixture) {
  await withRollbackSavepoint(client, "avatar masking", async () => {
    await setAuthContext(client, "authenticated", fixture.currentUserId);

    const { rows: globalXp } = await client.query(
      "SELECT * FROM public.get_leaderboard_projection('xp', 'global')",
    );
    const current = globalXp.find((row) => row.id === fixture.currentUserId);
    assert.ok(current, "caller appears on the global board");
    assert.ok(
      current.avatar_url,
      "caller keeps their own avatar on the global board",
    );
    const strangerRows = globalXp.filter(
      (row) => row.id !== fixture.currentUserId,
    );
    assert.ok(strangerRows.length > 0);
    assert.ok(
      strangerRows.every((row) => row.avatar_url === null),
      "global leaderboard must mask non-friend avatars",
    );

    const { rows: friendsXp } = await client.query(
      "SELECT * FROM public.get_leaderboard_projection('xp', 'friends')",
    );
    const friendRow = friendsXp.find((row) => row.id === fixture.friendId);
    assert.equal(
      friendRow?.avatar_url,
      "https://avatars.contract.test/friend.png",
      "accepted friends keep their avatars",
    );
  });
  return "global leaderboard masks avatars outside self and accepted friends";
}

export async function verifyDirectoryProjections(client, fixture) {
  const passed = [];

  const { rows: privilegeRows } = await client.query(`
    SELECT
      has_function_privilege(
        'authenticated',
        'public.get_friend_code_profile(text)',
        'EXECUTE'
      ) AS authenticated_lookup,
      has_function_privilege(
        'anon',
        'public.get_friend_code_profile(text)',
        'EXECUTE'
      ) AS anon_lookup,
      has_function_privilege(
        'authenticated',
        'public.search_profiles_for_friends(text)',
        'EXECUTE'
      ) AS authenticated_search,
      has_function_privilege(
        'anon',
        'public.search_profiles_for_friends(text)',
        'EXECUTE'
      ) AS anon_search,
      has_function_privilege(
        'authenticated',
        'public.get_pending_friend_requests()',
        'EXECUTE'
      ) AS authenticated_requests,
      has_function_privilege(
        'anon',
        'public.get_pending_friend_requests()',
        'EXECUTE'
      ) AS anon_requests,
      has_function_privilege(
        'authenticated',
        'public.get_achievement_feed()',
        'EXECUTE'
      ) AS authenticated_feed,
      has_function_privilege(
        'anon',
        'public.get_achievement_feed()',
        'EXECUTE'
      ) AS anon_feed
  `);
  assert.deepEqual(privilegeRows[0], {
    authenticated_lookup: true,
    anon_lookup: false,
    authenticated_search: true,
    anon_search: false,
    authenticated_requests: true,
    anon_requests: false,
    authenticated_feed: true,
    anon_feed: false,
  });
  passed.push("directory projection grants allow authenticated and deny anon");

  await expectDatabaseError(client, "short friend code", ["22023"], async () => {
    await setAuthContext(client, "authenticated", fixture.currentUserId);
    await client.query("SELECT * FROM public.get_friend_code_profile($1)", [
      "ab",
    ]);
  });

  await withRollbackSavepoint(client, "friend code lookup", async () => {
    await setAuthContext(client, "authenticated", fixture.currentUserId);
    const { rows } = await client.query(
      "SELECT * FROM public.get_friend_code_profile($1)",
      [fixture.outsiderFriendCode],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, fixture.outsiderId);
    assert.ok(
      !("friend_code" in rows[0]),
      "lookup must not return friend_code",
    );

    const { rows: selfRows } = await client.query(
      "SELECT * FROM public.get_friend_code_profile($1)",
      [fixture.currentFriendCode],
    );
    assert.equal(selfRows.length, 0, "the caller's own code resolves to nothing");
  });
  passed.push("friend-code lookup is bounded, validated, and never self-referential");

  await withRollbackSavepoint(client, "profile search", async () => {
    await setAuthContext(client, "authenticated", fixture.currentUserId);
    const { rows } = await client.query(
      "SELECT * FROM public.search_profiles_for_friends($1)",
      ["Contract Decoy"],
    );
    assert.equal(rows.length, 10, "search is capped at ten rows");
    const ids = new Set(rows.map((row) => row.id));
    assert.ok(!ids.has(fixture.currentUserId), "search must exclude the caller");
    assert.ok(
      !ids.has(fixture.friendId),
      "search must exclude existing friendships",
    );
    assert.ok(
      rows.every((row) => !("friend_code" in row)),
      "search must not return friend codes",
    );

    const { rows: outsiderRows } = await client.query(
      "SELECT * FROM public.search_profiles_for_friends($1)",
      ["Contract Outsider"],
    );
    assert.deepEqual(
      outsiderRows.map((row) => row.id),
      [fixture.outsiderId],
    );

    const { rows: escapedRows } = await client.query(
      "SELECT * FROM public.search_profiles_for_friends($1)",
      ["Contract_Decoy"],
    );
    assert.equal(
      escapedRows.length,
      0,
      "ILIKE wildcards inside the search term must match literally",
    );
  });
  passed.push("search stays bounded, escaped, and friendship-aware");

  await withRollbackSavepoint(client, "pending requests", async () => {
    await client.query(
      `INSERT INTO public.friendships (requester_id, addressee_id, status)
       VALUES ($1, $2, 'pending')`,
      [fixture.outsiderId, fixture.currentUserId],
    );

    await setAuthContext(client, "authenticated", fixture.currentUserId);
    const { rows: incoming } = await client.query(
      "SELECT * FROM public.get_pending_friend_requests()",
    );
    assert.equal(incoming.length, 1);
    assert.equal(incoming[0].direction, "incoming");
    assert.equal(incoming[0].id, fixture.outsiderId);

    await client.query("RESET ROLE");
    await setAuthContext(client, "authenticated", fixture.outsiderId);
    const { rows: outgoing } = await client.query(
      "SELECT * FROM public.get_pending_friend_requests()",
    );
    assert.equal(outgoing.length, 1);
    assert.equal(outgoing[0].direction, "outgoing");
    assert.equal(outgoing[0].id, fixture.currentUserId);
  });
  passed.push("pending requests stay scoped to the two participants");

  await withRollbackSavepoint(client, "achievement feed", async () => {
    await setAuthContext(client, "authenticated", fixture.currentUserId);
    const { rows } = await client.query(
      "SELECT * FROM public.get_achievement_feed()",
    );
    assert.ok(rows.length <= 20);
    assert.ok(
      rows.every((row) =>
        [fixture.currentUserId, fixture.friendId].includes(row.user_id),
      ),
      "feed must contain only self and accepted friends",
    );
    if (fixture.friendHasAchievement) {
      assert.ok(
        rows.some(
          (row) => row.user_id === fixture.friendId && row.is_self === false,
        ),
        "an accepted friend's unlock appears in the feed",
      );
    }

    await client.query("RESET ROLE");
    await setAuthContext(client, "authenticated", fixture.outsiderId);
    const { rows: outsiderFeed } = await client.query(
      "SELECT * FROM public.get_achievement_feed()",
    );
    assert.equal(
      outsiderFeed.length,
      0,
      "a user with no friends and no unlocks sees an empty feed",
    );
  });
  passed.push("achievement feed is bounded to self plus accepted friends");

  return passed;
}
