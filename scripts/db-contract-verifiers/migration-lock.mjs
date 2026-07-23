import assert from "node:assert/strict";

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
