-- Repair profiles created while the user_characters FK still pointed at auth.users.
-- Those profiles missed the starter-character trigger and now render a synthetic
-- text-only "Study Buddy" with no character id.

CREATE OR REPLACE FUNCTION public.handle_unlock_defaults()
RETURNS TRIGGER AS $$
DECLARE
  default_character_id UUID;
BEGIN
  SELECT c.id
    INTO default_character_id
  FROM public.characters c
  WHERE c.is_default = true
  ORDER BY (c.name = 'Sun Wukong (孙悟空)') DESC, c.name
  LIMIT 1;

  IF default_character_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.user_characters (user_id, character_id, is_selected)
  VALUES (NEW.id, default_character_id, true)
  ON CONFLICT (user_id, character_id) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_characters uc
    WHERE uc.user_id = NEW.id AND uc.is_selected = true
  ) THEN
    UPDATE public.user_characters
    SET is_selected = true
    WHERE user_id = NEW.id AND character_id = default_character_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '';

-- This function is invoked only by the profile trigger. Prevent Data API roles
-- from calling its elevated body directly.
REVOKE EXECUTE ON FUNCTION public.handle_unlock_defaults()
FROM PUBLIC, anon, authenticated;

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
    WHERE uc.user_id = p.id AND uc.is_selected = true
  )
)
UPDATE public.user_characters uc
SET is_selected = true
FROM default_character dc, profiles_without_selection p
WHERE uc.user_id = p.id
  AND uc.character_id = dc.id;

-- Personalized-learning achievements were added to code after the original
-- database catalog. Keep this conditional because the repository's historical
-- bootstrap migrations do not include every later production table.
DO $$
BEGIN
  IF to_regclass('public.achievements') IS NOT NULL THEN
    INSERT INTO public.achievements
      (key, name, description, emoji, tier, sort_order)
    VALUES
      ('learning_first_step', 'First Step (学习启程)', 'Complete the initial learning path assessment', '📋', 'common', 41),
      ('learning_on_track', 'On Track (按部就班)', 'Complete the first mid-checkpoint', '📊', 'uncommon', 42),
      ('learning_adapting', 'Adapting (因材施教)', 'Complete all 3 mid-checkpoints', '🎯', 'rare', 43),
      ('learning_exam_ready', 'Exam Ready (胸有成竹)', 'Complete an entire learning plan', '🎓', 'epic', 44)
    ON CONFLICT (key) DO UPDATE
    SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      emoji = EXCLUDED.emoji,
      tier = EXCLUDED.tier,
      sort_order = EXCLUDED.sort_order;
  END IF;
END
$$;
