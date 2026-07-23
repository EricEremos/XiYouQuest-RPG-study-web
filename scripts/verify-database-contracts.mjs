#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { seedRollbackOnlyFixtures } from "./db-contract-fixtures.mjs";
import {
  loadDatabaseUrl,
  readMigration,
} from "./db-contract-test-helpers.mjs";
import {
  verifyMigrationLock,
  verifyProjectionBounds,
  verifyPrivilegedOwnerReassignmentInvariant,
  verifyProfileProvisioningInvariant,
  verifyPrivilegesAndInvariant,
  verifyProjections,
} from "./db-contract-verifiers.mjs";

if (process.env.XIYOUQUEST_DB_INTEGRATION !== "1") {
  throw new Error(
    "Refusing to open a database connection. Re-run with XIYOUQUEST_DB_INTEGRATION=1.",
  );
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { clientConfig, safeTarget } = loadDatabaseUrl();
const migrationFiles = [
  "20260723180000_enforce_single_selected_companion.sql",
  "20260723183000_add_bounded_social_projections.sql",
  "20260723183100_add_social_friend_stats_projection.sql",
];
const control = new pg.Client(clientConfig);
const contender = new pg.Client(clientConfig);
const checks = [];
const fixtureIds = [];

console.log(`XiYouQuest DB contract target: ${safeTarget} (rollback-only)`);
await Promise.all([control.connect(), contender.connect()]);

try {
  await control.query("BEGIN");
  await control.query("SET LOCAL statement_timeout = '45s'");

  for (const migrationFile of migrationFiles) {
    await control.query(readMigration(repoRoot, migrationFile));
  }
  checks.push("all three migrations execute in PostgreSQL");

  await verifyMigrationLock(control, contender);
  checks.push(
    "migration holds explicit table locks and excludes concurrent companion writes",
  );

  const fixture = await seedRollbackOnlyFixtures(control, fixtureIds);
  checks.push(
    ...(await verifyPrivilegesAndInvariant(control, fixture)),
    await verifyProfileProvisioningInvariant(control, fixtureIds),
    await verifyPrivilegedOwnerReassignmentInvariant(control, fixture),
    ...(await verifyProjections(control, fixture)),
    await verifyProjectionBounds(control, fixture),
  );

  const { rows: exactOneRows } = await control.query(`
    SELECT count(*)::INTEGER AS violations
    FROM public.profiles p
    WHERE (
      SELECT count(*)
      FROM public.user_characters uc
      WHERE uc.user_id = p.id
        AND uc.is_selected = true
    ) <> 1
  `);
  assert.equal(exactOneRows[0].violations, 0);
  checks.push("every profile has exactly one selected companion");

  await control.query("ROLLBACK");

  const { rows: retainedFixtureRows } = await control.query(
    "SELECT count(*)::INTEGER AS count FROM public.profiles WHERE id = ANY($1::uuid[])",
    [fixtureIds],
  );
  assert.equal(retainedFixtureRows[0].count, 0);
  checks.push("rollback removed every synthetic fixture");

  console.log(
    JSON.stringify(
      {
        status: "passed",
        mode: "rollback-only",
        checks,
      },
      null,
      2,
    ),
  );
} catch (error) {
  try {
    await control.query("ROLLBACK");
  } catch {
    // Preserve the original verification failure.
  }
  throw error;
} finally {
  await Promise.allSettled([control.end(), contender.end()]);
}
