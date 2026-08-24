-- 004_security_hardening.sql
-- Security hardening from the 2026-07 ITSO-aligned audit (see SECURITY.md).
--
-- 1) Storage listing: the `avatars` and `chat-images` buckets each had a broad
--    `TO public` SELECT policy. Both buckets are public=true, so object DISPLAY
--    happens through the public object URL, which does NOT consult storage RLS.
--    The broad SELECT policy therefore added nothing for display; it only
--    enabled the LIST/enumerate operation, letting anyone (including anon) walk
--    every user's `{userId}/...` folder and discover other users' files. Replace
--    it with an owner-scoped SELECT so the account-deletion cleanup (which lists
--    the caller's OWN folder) still works while cross-user / anonymous listing
--    is blocked. Public `<img src>` display is unaffected.
--
-- 2) chat-images upload scope: the INSERT policy allowed ANY authenticated user
--    to write to ANY path (no folder check), so a user could overwrite another
--    user's `{otherUserId}/...` objects. Scope it to the caller's own folder.
--    App uploads go through the service role and are unaffected.
--
-- 3) SECURITY DEFINER RPCs: revoke the implicit PUBLIC execute grant (which
--    reaches the anonymous `anon` role) and grant only to `authenticated` and
--    `service_role`. The functions already self-guard on `auth.uid()`, so this
--    is defense in depth that also clears the "anon can execute SECURITY
--    DEFINER function" advisor lints.

-- ---------------------------------------------------------------------------
-- 1 + 2) Storage policies
-- ---------------------------------------------------------------------------

-- avatars: owner-scoped SELECT (was public/broad -> allowed bucket listing)
DROP POLICY IF EXISTS "Avatars are publicly accessible" ON storage.objects;
CREATE POLICY "Avatars: owner can list own folder"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- chat-images: owner-scoped SELECT (was public/broad -> allowed bucket listing)
DROP POLICY IF EXISTS "Anyone can view chat images" ON storage.objects;
CREATE POLICY "Chat images: owner can list own folder"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'chat-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- chat-images: owner-scoped INSERT (was any authenticated -> any path)
DROP POLICY IF EXISTS "Authenticated users can upload chat images" ON storage.objects;
CREATE POLICY "Chat images: owner can upload to own folder"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'chat-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- 3) SECURITY DEFINER RPC execute grants
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.update_profile_with_streak(uuid, date, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.deduct_xp_if_sufficient(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.count_user_chat_messages(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_unlock_defaults() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_profile_with_streak(uuid, date, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.deduct_xp_if_sufficient(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.count_user_chat_messages(uuid) TO authenticated, service_role;
-- handle_unlock_defaults is a trigger function; it fires from the profiles
-- insert trigger regardless of EXECUTE grants and is never a legitimate RPC.
