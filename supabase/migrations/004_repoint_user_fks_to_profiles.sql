-- ============================================================================
-- Re-point user FKs from auth.users to public.profiles
-- ============================================================================
-- The production schema (built outside the repo's 001 migration) had five
-- user-owned tables whose user_id FK referenced auth.users(id) directly rather
-- than public.profiles(id). After the HKUST SSO migration wiped auth.users,
-- Better Auth provisions users into public.profiles, so any insert into these
-- tables (e.g. the on_profile_created trigger seeding user_characters at
-- signup) fails: `insert or update on table "..." violates foreign key
-- constraint "..._user_id_fkey"`.
--
-- Re-point each FK to public.profiles(id), matching the other user-owned
-- tables. Tables are empty at this point (no user has completed signup), so
-- this is a safe metadata-only change.
-- ============================================================================

DO $$
DECLARE
  t text;
  conname text;
  tables text[] := ARRAY[
    'user_characters', 'user_progress', 'practice_sessions',
    'quest_progress', 'mock_exam_results'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Drop the existing FK (whatever it's named) that points user_id at auth.users.
    SELECT con.conname INTO conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    JOIN pg_class fref ON fref.oid = con.confrelid
    JOIN pg_namespace fnsp ON fnsp.oid = fref.relnamespace
    WHERE con.contype = 'f'
      AND nsp.nspname = 'public' AND rel.relname = t
      AND fnsp.nspname = 'auth' AND fref.relname = 'users';

    IF conname IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', t, conname);
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE',
        t, t || '_user_id_fkey'
      );
    END IF;
  END LOOP;
END $$;
