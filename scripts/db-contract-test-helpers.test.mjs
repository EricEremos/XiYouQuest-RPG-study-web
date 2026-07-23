import assert from "node:assert/strict";
import { X509Certificate } from "node:crypto";
import test from "node:test";

import { loadDatabaseUrl } from "./db-contract-test-helpers.mjs";

test("remote database connections require verified TLS", () => {
  const previous = process.env.XIYOUQUEST_DATABASE_URL;
  const previousTarget = process.env.XIYOUQUEST_DB_TARGET_ID;
  process.env.XIYOUQUEST_DATABASE_URL =
    "postgresql://postgres.expected-project:secret@aws-1.example.supabase.com/postgres?sslmode=require";
  process.env.XIYOUQUEST_DB_TARGET_ID = "expected-project";

  try {
    const result = loadDatabaseUrl();
    assert.equal(
      result.clientConfig.connectionString,
      "postgresql://postgres.expected-project:secret@aws-1.example.supabase.com/postgres",
    );
    assert.equal(result.clientConfig.ssl.rejectUnauthorized, true);
    assert.match(
      result.clientConfig.ssl.ca,
      /-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/,
    );
    assert.equal(
      new X509Certificate(result.clientConfig.ssl.ca).fingerprint256,
      "80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA",
    );
  } finally {
    if (previous === undefined) {
      delete process.env.XIYOUQUEST_DATABASE_URL;
    } else {
      process.env.XIYOUQUEST_DATABASE_URL = previous;
    }
    if (previousTarget === undefined) {
      delete process.env.XIYOUQUEST_DB_TARGET_ID;
    } else {
      process.env.XIYOUQUEST_DB_TARGET_ID = previousTarget;
    }
  }
});

test("localhost database connections may use plaintext explicitly", () => {
  const previous = process.env.XIYOUQUEST_DATABASE_URL;
  const previousTarget = process.env.XIYOUQUEST_DB_TARGET_ID;
  process.env.XIYOUQUEST_DATABASE_URL =
    "postgresql://contract-user:secret@127.0.0.1:5432/postgres?sslmode=disable";
  process.env.XIYOUQUEST_DB_TARGET_ID = "local";

  try {
    const result = loadDatabaseUrl();
    assert.equal(result.clientConfig.ssl, false);
  } finally {
    if (previous === undefined) {
      delete process.env.XIYOUQUEST_DATABASE_URL;
    } else {
      process.env.XIYOUQUEST_DATABASE_URL = previous;
    }
    if (previousTarget === undefined) {
      delete process.env.XIYOUQUEST_DB_TARGET_ID;
    } else {
      process.env.XIYOUQUEST_DB_TARGET_ID = previousTarget;
    }
  }
});

test("explicit connection targets must match an independently supplied identifier", () => {
  const previous = process.env.XIYOUQUEST_DATABASE_URL;
  const previousTarget = process.env.XIYOUQUEST_DB_TARGET_ID;
  process.env.XIYOUQUEST_DATABASE_URL =
    "postgresql://postgres.actual-project:secret@aws-1.example.supabase.com/postgres";
  process.env.XIYOUQUEST_DB_TARGET_ID = "different-project";

  try {
    assert.throws(
      () => loadDatabaseUrl(),
      /XIYOUQUEST_DB_TARGET_ID does not match/,
    );
  } finally {
    if (previous === undefined) {
      delete process.env.XIYOUQUEST_DATABASE_URL;
    } else {
      process.env.XIYOUQUEST_DATABASE_URL = previous;
    }
    if (previousTarget === undefined) {
      delete process.env.XIYOUQUEST_DB_TARGET_ID;
    } else {
      process.env.XIYOUQUEST_DB_TARGET_ID = previousTarget;
    }
  }
});
