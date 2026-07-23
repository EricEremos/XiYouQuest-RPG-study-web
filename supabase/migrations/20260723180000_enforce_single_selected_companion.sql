-- Multiple concurrent repair or selection requests must never leave a profile
-- with zero or multiple active companions. First normalize historical rows,
-- then enforce the exact-one invariant at transaction boundaries.

-- Supabase applies each migration in one transaction. Take both tables in the
-- same order used by profile provisioning and selection so no profile insert,
-- companion insert, selection update, or delete can commit between the repair
-- pass and installation of the invariant.
LOCK TABLE public.profiles, public.user_characters
IN SHARE ROW EXCLUSIVE MODE;

WITH ranked_selections AS (
  SELECT
    uc.user_id,
    uc.character_id,
    ROW_NUMBER() OVER (
      PARTITION BY uc.user_id
      ORDER BY
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

WITH default_character AS (
  SELECT c.id
  FROM public.characters c
  WHERE c.is_default = true
  ORDER BY (c.name = 'Sun Wukong (孙悟空)') DESC, c.name
  LIMIT 1
)
INSERT INTO public.user_characters (user_id, character_id, is_selected)
SELECT p.id, dc.id, false
FROM public.profiles p
CROSS JOIN default_character dc
ON CONFLICT (user_id, character_id) DO NOTHING;

WITH default_character AS (
  SELECT c.id
  FROM public.characters c
  WHERE c.is_default = true
  ORDER BY (c.name = 'Sun Wukong (孙悟空)') DESC, c.name
  LIMIT 1
),
profiles_without_selection AS (
  SELECT p.id
  FROM public.profiles p
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.user_characters uc
    WHERE uc.user_id = p.id
      AND uc.is_selected = true
  )
)
UPDATE public.user_characters uc
SET is_selected = true
FROM default_character dc, profiles_without_selection p
WHERE uc.user_id = p.id
  AND uc.character_id = dc.id;

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

-- The partial index prevents multiple selections. This deferred constraint
-- trigger also prevents a transaction from committing with no selection.
-- Deferral allows the RPC above to deselect and select atomically.
CREATE OR REPLACE FUNCTION public.enforce_exactly_one_selected_character()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected_user_id UUID := COALESCE(NEW.user_id, OLD.user_id);
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = affected_user_id
  ) AND (
    SELECT count(*)
    FROM public.user_characters uc
    WHERE uc.user_id = affected_user_id
      AND uc.is_selected = true
  ) <> 1 THEN
    RAISE EXCEPTION
      'A profile must have exactly one selected character'
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_exactly_one_selected_character()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS user_characters_exactly_one_selected_trigger
ON public.user_characters;

CREATE CONSTRAINT TRIGGER user_characters_exactly_one_selected_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.user_characters
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.enforce_exactly_one_selected_character();

-- Validate only after the index and deferred trigger exist. The table locks
-- remain held until the migration transaction commits, so this assertion and
-- the installed constraints cover one continuous write-free boundary.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE (
      SELECT count(*)
      FROM public.user_characters uc
      WHERE uc.user_id = p.id
        AND uc.is_selected = true
    ) <> 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce companion invariant: every profile needs exactly one selected character';
  END IF;
END
$$;
