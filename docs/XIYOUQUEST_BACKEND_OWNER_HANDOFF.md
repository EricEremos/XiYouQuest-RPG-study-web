# XiYouQuest backend owner handoff

Status: prepared in the repair pull request; **not applied to an external
Supabase project by Codex**.

This note separates application changes that can be reviewed in Git from
database and deployment actions that require the actual project owner's
authorization.

## Why owner action is required

The repaired application expects one selected companion per profile and narrow
authenticated projections for leaderboard and social data. Those guarantees
depend on three PostgreSQL migrations as well as the frontend/backend
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

## Migration files and order

Review and apply through the owner's established Supabase migration process,
in this order:

1. `supabase/migrations/20260723180000_enforce_single_selected_companion.sql`
2. `supabase/migrations/20260723183000_add_bounded_social_projections.sql`
3. `supabase/migrations/20260723183100_add_social_friend_stats_projection.sql`

The first migration takes explicit table locks while it repairs historical
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

- all three migrations execute inside the test transaction;
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
