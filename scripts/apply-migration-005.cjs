/**
 * One-off runner: applies supabase/migrations/005_rpc_guards_service_role.sql
 * to the database referenced by BETTER_AUTH_DATABASE_URL (.env.local), records
 * it in supabase_migrations.schema_migrations, and verifies the new guard.
 * Run: node scripts/apply-migration-005.cjs
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

async function main() {
  const root = path.join(__dirname, "..");
  const env = fs.readFileSync(path.join(root, ".env.local"), "utf8");
  const match = env.match(/^BETTER_AUTH_DATABASE_URL=(.+)$/m);
  if (!match) throw new Error("BETTER_AUTH_DATABASE_URL not found in .env.local");
  const url = match[1].trim();

  const sql = fs.readFileSync(
    path.join(root, "supabase", "migrations", "005_rpc_guards_service_role.sql"),
    "utf8",
  );

  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(sql);
    console.log("MIGRATION APPLIED");

    // Record in migration history (non-fatal if the insert shape mismatches).
    try {
      const version = new Date()
        .toISOString()
        .replace(/[-:TZ.]/g, "")
        .slice(0, 14);
      await client.query(
        `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [version, "rpc_guards_service_role", [sql]],
      );
      console.log("HISTORY RECORDED", version);
    } catch (err) {
      console.log("HISTORY RECORD SKIPPED:", err.message);
    }

    // Verify 1: no JWT claims at all -> guard must raise (fail-closed).
    try {
      await client.query(
        "SELECT public.count_user_chat_messages('00000000-0000-0000-0000-000000000000'::uuid)",
      );
      console.log("VERIFY FAIL-CLOSED: UNEXPECTED SUCCESS");
    } catch (err) {
      console.log(
        "VERIFY FAIL-CLOSED OK:",
        err.message.includes("Unauthorized") ? "raises Unauthorized" : err.message,
      );
    }

    // Verify 2: service_role claim -> guard must pass.
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true)`,
    );
    const res = await client.query(
      "SELECT public.count_user_chat_messages('00000000-0000-0000-0000-000000000000'::uuid) AS n",
    );
    await client.query("ROLLBACK");
    console.log("VERIFY SERVICE-ROLE OK: count =", res.rows[0].n);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("MIGRATION FAILED:", err.message);
  process.exit(1);
});
