import assert from "node:assert/strict";
import crypto from "node:crypto";

export async function seedRollbackOnlyFixtures(client, fixtureIds) {
  const currentUserId = crypto.randomUUID();
  const friendId = crypto.randomUUID();
  const outsiderId = crypto.randomUUID();
  const decoyIds = Array.from({ length: 25 }, () => crypto.randomUUID());
  fixtureIds.push(currentUserId, friendId, outsiderId, ...decoyIds);

  const currentFriendCode = `PSC-CONTRACT-CUR-${currentUserId.slice(0, 8)}`;
  const outsiderFriendCode = `PSC-CONTRACT-OUT-${outsiderId.slice(0, 8)}`;

  const profiles = [
    {
      id: currentUserId,
      username: `contract-current-${currentUserId.slice(0, 8)}`,
      display_name: "Contract Current User",
      avatar_url: "https://avatars.contract.test/current.png",
      friend_code: currentFriendCode,
      total_xp: -100,
      current_level: 1,
      login_streak: 3,
    },
    {
      id: friendId,
      username: `contract-friend-${friendId.slice(0, 8)}`,
      display_name: "Contract Accepted Friend",
      avatar_url: "https://avatars.contract.test/friend.png",
      friend_code: null,
      total_xp: 10,
      current_level: 2,
      login_streak: 5,
    },
    {
      id: outsiderId,
      username: `contract-outsider-${outsiderId.slice(0, 8)}`,
      display_name: "Contract Outsider",
      avatar_url: "https://avatars.contract.test/outsider.png",
      friend_code: outsiderFriendCode,
      total_xp: 20,
      current_level: 3,
      login_streak: 7,
    },
    ...decoyIds.map((id, index) => ({
      id,
      username: `contract-decoy-${index}-${id.slice(0, 8)}`,
      display_name: `Contract Decoy ${index}`,
      avatar_url: `https://avatars.contract.test/decoy-${index}.png`,
      friend_code: null,
      total_xp: 1_000 + index,
      current_level: 10,
      login_streak: index,
    })),
  ];

  await client.query(
    `INSERT INTO public.profiles
       (id, username, display_name, avatar_url, friend_code,
        total_xp, current_level, login_streak)
     SELECT
       fixture.id,
       fixture.username,
       fixture.display_name,
       fixture.avatar_url,
       fixture.friend_code,
       fixture.total_xp,
       fixture.current_level,
       fixture.login_streak
     FROM jsonb_to_recordset($1::jsonb) AS fixture(
       id UUID,
       username TEXT,
       display_name TEXT,
       avatar_url TEXT,
       friend_code TEXT,
       total_xp INTEGER,
       current_level INTEGER,
       login_streak INTEGER
     )`,
    [JSON.stringify(profiles)],
  );

  const { rows: nonDefaultCharacters } = await client.query(
    `SELECT id
     FROM public.characters
     WHERE is_default = false
     ORDER BY name, id
     LIMIT 2`,
  );
  assert.equal(
    nonDefaultCharacters.length,
    2,
    "integration test requires two non-default characters",
  );
  const currentTargetId = nonDefaultCharacters[0].id;
  const friendOnlyTargetId = nonDefaultCharacters[1].id;

  await client.query(
    `INSERT INTO public.user_characters
       (user_id, character_id, is_selected)
     VALUES ($1, $2, false), ($3, $4, false)`,
    [currentUserId, currentTargetId, friendId, friendOnlyTargetId],
  );
  await client.query(
    `INSERT INTO public.friendships (requester_id, addressee_id, status)
     VALUES ($1, $2, 'accepted')`,
    [currentUserId, friendId],
  );
  await client.query(
    `INSERT INTO public.user_progress
       (user_id, component, questions_attempted, questions_correct)
     VALUES ($1, 1, 10, 7), ($2, 1, 10, 9)`,
    [currentUserId, friendId],
  );

  const { rows: defaultCharacters } = await client.query(
    `SELECT character_id
     FROM public.user_characters
     WHERE user_id = $1
       AND is_selected = true`,
    [currentUserId],
  );
  assert.equal(defaultCharacters.length, 1);

  await client.query(
    `INSERT INTO public.practice_sessions
       (user_id, character_id, component, score, xp_earned, duration_seconds)
     VALUES
       ($1, $3, 1, 80, 8, 30),
       ($2, $3, 2, 90, 9, 40)`,
    [currentUserId, friendId, defaultCharacters[0].character_id],
  );

  const { rows: achievementRows } = await client.query(
    "SELECT id FROM public.achievements ORDER BY sort_order, id LIMIT 1",
  );
  if (achievementRows[0]) {
    await client.query(
      `INSERT INTO public.user_achievements (user_id, achievement_id)
       VALUES ($1, $2)`,
      [friendId, achievementRows[0].id],
    );
  }

  return {
    currentUserId,
    friendId,
    outsiderId,
    currentTargetId,
    friendOnlyTargetId,
    currentFriendCode,
    outsiderFriendCode,
    friendHasAchievement: Boolean(achievementRows[0]),
  };
}
