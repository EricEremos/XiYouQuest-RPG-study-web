# XiYouQuest backend owner handoff

Status: prepared in the repair pull request; **not applied to an external
Supabase project by Codex**.

This note separates application changes that can be reviewed in Git from
database and deployment actions that require the actual project owner's
authorization.

## Responsibility boundary

| Responsibility | Owner |
| --- | --- |
| Review application, API, schema-validation, migration, and test changes | Pull-request reviewers |
| Identify the authoritative Supabase project and staging clone | Existing backend owner |
| Back up data and choose an approved migration window | Existing backend owner |
| Apply migrations and confirm environment variables | Existing backend owner |
| Deploy an owner-controlled preview | Existing backend/Vercel owner |
| Re-run end-to-end acceptance checks and decide whether to promote | Owner and QA together |

The repair does **not** require moving XiYouQuest to a different Supabase
account. The existing owner should apply the reviewed migrations to the
authoritative project through the team's normal release process.

## Why owner action is required

The repaired application expects one selected companion per profile and narrow
authenticated projections for leaderboard and social data. Those guarantees
depend on four PostgreSQL migrations as well as the frontend/backend
environment variables pointing to the same Supabase project.

Codex does not know which external Supabase project the owner designates as the
authoritative XiYouQuest database. The verification scripts therefore refuse
to read `.env.local` and require an explicit connection URL plus an independent
project identifier.

## Backend defects addressed in the pull request

| Symptom | Root cause | Code supplied |
| --- | --- | --- |
| Study Buddy card can show no character | A profile could exist without one selected companion, especially when no default character was configured | Atomic default provisioning plus an exact-one deferred constraint |
| Character selection can race or leave no selection | Client-side deselect/select writes were not one serialized database operation | `select_user_character(uuid)` locks the profile row and changes selection atomically |
| Friends and leaderboard can fail or over-read | Cross-profile reads conflicted with RLS, while service-role hydration was broad and insufficiently bounded | Authenticated, field-limited RPC projections with deterministic caps |
| Malformed database values can silently become zero | `z.coerce.number()` accepts `null` and empty strings | Strict PostgreSQL wire-number schemas |
| Social/achievement server routes trusted service-role rows | Database response shapes were asserted rather than parsed | Runtime Zod validation on lookup, search, requests, friends, leaderboard, and achievement feed paths |
| Better Auth can exhaust serverless database connections | The Supabase session pooler has a low session-client ceiling | Transaction pooler port `6543`, bounded app pool, and corrected environment guidance |

## Owner action matrix

| User-visible defect | Owner action | Evidence required before release |
| --- | --- | --- |
| Study Buddy is blank or Companion Chat offers no companion | Apply the default-companion repair and exact-one selection migration | Query/result showing every profile has exactly one selected companion; new-account and existing-account screenshots |
| Character selection does not persist or conflicts under rapid updates | Apply the serialized `select_user_character(uuid)` RPC and run the staging concurrency check | Passing owner-controlled concurrency log plus refresh proof in the preview |
| Social panels fail, Retry cannot recover, or friend totals are incomplete | Apply both bounded social-projection migrations and confirm service-role configuration belongs to the same project | Preview requests for search, incoming/outgoing requests, friends, removal, and Retry; no 4xx/5xx in first-party calls |
| Achievement count/catalog mismatch or feed errors | Apply the catalog repair and social feed projection; retain the PR's runtime response validation | All/Common/Uncommon/Rare/Epic counts agree with the returned catalog and the feed renders or shows a truthful empty state |
| Login intermittently returns 500 or sessions disappear | Confirm the Better Auth database URL uses the authorized transaction pooler on port `6543` and that all auth/Supabase variables use one project | Successful repeated sign-in/session checks with no pool-exhaustion errors in Vercel or database logs |

If the owner finds that the production schema or environment differs from the
assumptions above, stop the rollout and return the schema diff and sanitized
error/log excerpt to the pull request. Do not patch production manually around
the migration history.

## Migration files and order

Review and apply through the owner's established Supabase migration process,
in this order:

1. `supabase/migrations/20260723082001_repair_default_companions_and_achievement_catalog.sql`
2. `supabase/migrations/20260723180000_enforce_single_selected_companion.sql`
3. `supabase/migrations/20260723183000_add_bounded_social_projections.sql`
4. `supabase/migrations/20260723183100_add_social_friend_stats_projection.sql`

The first migration repairs historical starter-character rows and the four
personalized-learning achievement catalog entries. The second migration takes
explicit table locks while it repairs historical
selection state and installs the invariant. Apply it during an owner-approved
maintenance window or against a staging clone first. PostgreSQL applies each
migration transactionally; do not copy individual statements into production
piecemeal.

## Environment alignment check

Before deploying, the owner must confirm that these values all belong to the
same authorized Supabase project:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- the project reference encoded in `BETTER_AUTH_DATABASE_URL`

Also confirm:

- `BETTER_AUTH_DATABASE_URL` uses the transaction pooler on port `6543`;
- `BETTER_AUTH_URL` is the deployed application origin;
- the HKUST OIDC callback exactly matches
  `{BETTER_AUTH_URL}/api/auth/oauth2/callback/hkust`;
- Vercel production and preview variables do not mix project references.

Never paste secrets into a pull request, issue, report, or test log.

## Owner-controlled verification

Run the rollback-only contract suite against a staging clone first. It takes
short-lived table locks and performs synthetic writes inside one transaction,
then rolls everything back.

```bash
XIYOUQUEST_DB_INTEGRATION=1 \
XIYOUQUEST_DATABASE_URL='<owner-approved connection URL>' \
XIYOUQUEST_DB_TARGET_ID='<confirmed Supabase project ref>' \
npm run test:db-contracts
```

Expected result:

- all four migrations execute inside the test transaction;
- all four personalized-learning achievement rows match the application
  catalog exactly;
- profile creation fails if no default companion exists;
- zero or multiple selections are rejected;
- old and new owners are both checked on privileged reassignment;
- anonymous RPC access is denied;
- leaderboard and social projections are user-scoped and capped;
- every synthetic record is absent after rollback.

After the owner applies and records the migrations, the optional two-connection
race test can validate serialized character selection:

```bash
XIYOUQUEST_DB_INTEGRATION=1 \
XIYOUQUEST_DB_POST_APPLY=1 \
XIYOUQUEST_DATABASE_URL='<owner-approved connection URL>' \
XIYOUQUEST_DB_TARGET_ID='<confirmed Supabase project ref>' \
npm run test:db-concurrency
```

Unlike the rollback-only suite, this check briefly commits one synthetic
profile so two separate connections can observe it, then deletes it in a
`finally` cleanup. Run it only with explicit owner approval on staging before
production.

## Acceptance checks after owner deployment

1. A new HKUST user reaches `/dashboard` with exactly one visible Study Buddy.
2. An existing user with historical companion data sees the selected character.
3. Selecting another unlocked character survives refresh and leaves exactly one selected row.
4. Leaderboard tabs work for XP, accuracy, and streak in global and friends scopes.
5. Social search, friend requests, friend removal, and achievement feed reject malformed server data rather than rendering incorrect totals.
6. Repeated sign-in/session checks do not produce pool-exhaustion or 500 errors.
7. Vercel, Better Auth, Supabase browser clients, service-role routes, storage, and Edge Functions all reference the same approved project.

If any acceptance check fails, stop promotion and keep the previous production
deployment active while the owner reviews logs and environment alignment.
