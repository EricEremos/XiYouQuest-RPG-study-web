-- Multiple concurrent repair or selection requests must never leave a profile
-- with more than one active companion. Keep the intended starter character
-- when duplicates already exist, then enforce the invariant at the database.

WITH ranked_selections AS (
  SELECT
    uc.user_id,
    uc.character_id,
    ROW_NUMBER() OVER (
      PARTITION BY uc.user_id
      ORDER BY
        (c.name = 'Sun Wukong (孙悟空)') DESC,
        uc.unlocked_at DESC,
        uc.character_id
    ) AS selection_rank
  FROM public.user_characters uc
  JOIN public.characters c ON c.id = uc.character_id
  WHERE uc.is_selected = true
)
UPDATE public.user_characters uc
SET is_selected = false
FROM ranked_selections ranked
WHERE ranked.selection_rank > 1
  AND uc.user_id = ranked.user_id
  AND uc.character_id = ranked.character_id;

CREATE UNIQUE INDEX IF NOT EXISTS user_characters_one_selected_per_user_idx
  ON public.user_characters (user_id)
  WHERE is_selected = true;

-- Character changes must be all-or-nothing. The profile-row lock serializes
-- concurrent selections for one user; if the second update fails, PostgreSQL
-- rolls the complete RPC transaction back and preserves the old selection.
CREATE OR REPLACE FUNCTION public.select_user_character(
  target_character_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.profiles p
  WHERE p.id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1
  FROM public.user_characters uc
  WHERE uc.user_id = auth.uid()
    AND uc.character_id = target_character_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Character is not unlocked' USING ERRCODE = '42501';
  END IF;

  UPDATE public.user_characters
  SET is_selected = false
  WHERE user_id = auth.uid()
    AND is_selected = true
    AND character_id <> target_character_id;

  UPDATE public.user_characters
  SET is_selected = true
  WHERE user_id = auth.uid()
    AND character_id = target_character_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.select_user_character(UUID)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.select_user_character(UUID)
TO authenticated;
