import crypto from "node:crypto";

import {
  expectDatabaseError,
  setAuthContext,
} from "../db-contract-test-helpers.mjs";

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
