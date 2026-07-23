import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

let savepointCounter = 0;

export function loadDatabaseUrl() {
  const connectionString = process.env.XIYOUQUEST_DATABASE_URL;
  const expectedTargetId = process.env.XIYOUQUEST_DB_TARGET_ID;

  assert.ok(
    connectionString,
    "Set XIYOUQUEST_DATABASE_URL explicitly; repository environment files are never used by this verifier",
  );
  assert.ok(
    expectedTargetId,
    "Set XIYOUQUEST_DB_TARGET_ID to the confirmed project reference, or to local for a loopback database",
  );

  const target = new URL(connectionString);
  assert.match(target.protocol, /^postgres(ql)?:$/);
  const isLocalTarget = ["localhost", "127.0.0.1", "::1"].includes(
    target.hostname,
  );
  const isSupabaseTarget =
    target.hostname.endsWith(".supabase.co") ||
    target.hostname.endsWith(".supabase.com");
  const targetIdentity = `${decodeURIComponent(target.username)}@${target.hostname}`;

  if (isLocalTarget) {
    assert.equal(
      expectedTargetId,
      "local",
      "Loopback database checks require XIYOUQUEST_DB_TARGET_ID=local",
    );
  } else {
    assert.ok(
      targetIdentity
        .split(/[.@]/)
        .some((segment) => segment === expectedTargetId),
      "XIYOUQUEST_DB_TARGET_ID does not match the explicit connection target",
    );
  }

  const explicitCaPath = process.env.XIYOUQUEST_DB_CA_FILE;
  const trustedCa = explicitCaPath
    ? fs.readFileSync(explicitCaPath, "utf8")
    : isSupabaseTarget
      ? fs.readFileSync(
          new URL("./certs/supabase-root-2021-ca.crt", import.meta.url),
          "utf8",
        )
      : undefined;

  // node-postgres lets SSL query parameters replace the explicit `ssl`
  // object. Remove them so remote targets always retain certificate
  // verification; plaintext is allowed only for an explicit loopback target.
  for (const parameter of [
    "sslmode",
    "sslcert",
    "sslkey",
    "sslrootcert",
  ]) {
    target.searchParams.delete(parameter);
  }

  return {
    clientConfig: {
      connectionString: target.toString(),
      ssl: isLocalTarget
        ? false
        : {
            rejectUnauthorized: true,
            ...(trustedCa ? { ca: trustedCa } : {}),
          },
    },
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
