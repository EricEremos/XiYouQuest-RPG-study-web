import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { parse } from "dotenv";

let savepointCounter = 0;

export function loadDatabaseUrl(repoRoot) {
  const localEnvPath = path.join(repoRoot, ".env.local");
  const localEnv = fs.existsSync(localEnvPath)
    ? parse(fs.readFileSync(localEnvPath))
    : {};
  const connectionString =
    process.env.XIYOUQUEST_DATABASE_URL ??
    process.env.BETTER_AUTH_DATABASE_URL ??
    localEnv.BETTER_AUTH_DATABASE_URL;

  assert.ok(
    connectionString,
    "Set XIYOUQUEST_DATABASE_URL or provide BETTER_AUTH_DATABASE_URL",
  );

  const target = new URL(connectionString);
  assert.match(target.protocol, /^postgres(ql)?:$/);

  return {
    connectionString,
    safeTarget: `${target.hostname}/${target.pathname.replace(/^\//, "")}`,
  };
}

export function readMigration(repoRoot, fileName) {
  return fs.readFileSync(
    path.join(repoRoot, "supabase", "migrations", fileName),
    "utf8",
  );
}

export async function setAuthContext(client, role, userId = null) {
  assert.ok(role === "authenticated" || role === "anon");
  const claims = userId
    ? JSON.stringify({ sub: userId, role })
    : JSON.stringify({ role });

  await client.query(
    `SELECT
       set_config('request.jwt.claim.sub', $1, true),
       set_config('request.jwt.claims', $2, true)`,
    [userId ?? "", claims],
  );
  await client.query(`SET LOCAL ROLE ${role}`);
}

export async function withRollbackSavepoint(client, label, work) {
  const savepoint = `contract_${savepointCounter++}`;
  await client.query(`SAVEPOINT ${savepoint}`);
  try {
    return await work();
  } finally {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
    await client.query("RESET ROLE");
  }
}

export async function expectDatabaseError(
  client,
  label,
  expectedCodes,
  work,
) {
  const savepoint = `contract_${savepointCounter++}`;
  await client.query(`SAVEPOINT ${savepoint}`);
  let capturedError = null;

  try {
    await work();
  } catch (error) {
    capturedError = error;
  }

  await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  await client.query("RESET ROLE");

  assert.ok(capturedError, `${label}: expected PostgreSQL to reject the query`);
  assert.ok(
    expectedCodes.includes(capturedError.code),
    `${label}: expected ${expectedCodes.join("/")} but received ${capturedError.code ?? "no code"}`,
  );
}

export function assertExactIds(rows, expectedIds, label) {
  assert.deepEqual(
    [...new Set(rows.map((row) => row.id))].sort(),
    [...expectedIds].sort(),
    label,
  );
}
