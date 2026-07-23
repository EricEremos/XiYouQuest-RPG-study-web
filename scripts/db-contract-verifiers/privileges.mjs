import assert from "node:assert/strict";

import {
  expectDatabaseError,
  setAuthContext,
  withRollbackSavepoint,
} from "../db-contract-test-helpers.mjs";

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
