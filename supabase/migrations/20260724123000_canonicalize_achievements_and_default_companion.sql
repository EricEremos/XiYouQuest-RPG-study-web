-- Make the repository migration chain own the achievement schema that was
-- originally created directly in production, and replace the repair trigger
-- with one backed by an explicit single-default invariant.

CREATE TABLE IF NOT EXISTS public.achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  emoji TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('common', 'uncommon', 'rare', 'epic')),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user
  ON public.user_achievements (user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_unlocked
  ON public.user_achievements (unlocked_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_achievements_achievement_id
  ON public.user_achievements (achievement_id);

ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.achievements FROM anon, authenticated;
GRANT SELECT ON public.achievements TO authenticated;
GRANT ALL ON public.achievements TO service_role;
REVOKE ALL ON public.user_achievements FROM anon, authenticated;
GRANT SELECT, INSERT ON public.user_achievements TO authenticated;
GRANT ALL ON public.user_achievements TO service_role;

DROP POLICY IF EXISTS "Anyone can read achievements catalog"
  ON public.achievements;
DROP POLICY IF EXISTS "Authenticated users can read achievements catalog"
  ON public.achievements;
CREATE POLICY "Authenticated users can read achievements catalog"
  ON public.achievements
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can view all user_achievements"
  ON public.user_achievements;
DROP POLICY IF EXISTS "Users can read own achievements"
  ON public.user_achievements;
CREATE POLICY "Users can read own achievements"
  ON public.user_achievements
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can insert own achievements"
  ON public.user_achievements;
CREATE POLICY "Users can insert own achievements"
  ON public.user_achievements
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can delete own achievements"
  ON public.user_achievements;

INSERT INTO public.achievements
  (key, name, description, emoji, tier, sort_order)
VALUES
  ('account_created', 'First Steps', 'Create an account and begin your journey', '🎒', 'common', 1),
  ('stage_failed', 'Honorable Defeat', 'Fall in battle during a quest stage', '💀', 'common', 2),
  ('friend_added', 'Fellow Traveler', 'Add a friend to your companions list', '👥', 'common', 3),
  ('mock_exam_complete', 'Trial by Fire', 'Complete a full mock exam', '📝', 'common', 4),
  ('stage_1_cleared', 'Stage 1 Cleared', 'Clear Stage 1: Prologue', '⚔️', 'uncommon', 5),
  ('stage_2_cleared', 'Stage 2 Cleared', 'Clear Stage 2: River of Shattered Tone', '⚔️', 'uncommon', 6),
  ('stage_3_cleared', 'Stage 3 Cleared', 'Clear Stage 3: Desert of Illusion', '⚔️', 'uncommon', 7),
  ('stage_4_cleared', 'Stage 4 Cleared', 'Clear Stage 4: Moonlit Mountain', '⚔️', 'uncommon', 8),
  ('stage_5_cleared', 'Stage 5 Cleared', 'Clear Stage 5: Misty Bamboo Forest', '⚔️', 'uncommon', 9),
  ('stage_6_cleared', 'Stage 6 Cleared', 'Clear Stage 6: Plains of Fading Echoes', '⚔️', 'uncommon', 10),
  ('stage_7_cleared', 'Stage 7 Cleared', 'Clear Stage 7: Western Palace', '⚔️', 'uncommon', 11),
  ('sessions_5_wukong', 'Wukong Apprentice', 'Complete 5 practice sessions with Sun Wukong', '🤝', 'uncommon', 12),
  ('sessions_5_sanzang', 'Sanzang Apprentice', 'Complete 5 practice sessions with Tang Sanzang', '🤝', 'uncommon', 13),
  ('sessions_5_wujing', 'Wujing Apprentice', 'Complete 5 practice sessions with Sha Wujing', '🤝', 'uncommon', 14),
  ('sessions_5_bajie', 'Bajie Apprentice', 'Complete 5 practice sessions with Zhu Bajie', '🤝', 'uncommon', 15),
  ('no_hit_stage_1', 'Stage 1 Flawless', 'Clear Stage 1 without taking any damage', '🛡️', 'rare', 16),
  ('no_hit_stage_2', 'Stage 2 Flawless', 'Clear Stage 2 without taking any damage', '🛡️', 'rare', 17),
  ('no_hit_stage_3', 'Stage 3 Flawless', 'Clear Stage 3 without taking any damage', '🛡️', 'rare', 18),
  ('no_hit_stage_4', 'Stage 4 Flawless', 'Clear Stage 4 without taking any damage', '🛡️', 'rare', 19),
  ('no_hit_stage_5', 'Stage 5 Flawless', 'Clear Stage 5 without taking any damage', '🛡️', 'rare', 20),
  ('no_hit_stage_6', 'Stage 6 Flawless', 'Clear Stage 6 without taking any damage', '🛡️', 'rare', 21),
  ('no_hit_stage_7', 'Stage 7 Flawless', 'Clear Stage 7 without taking any damage', '🛡️', 'rare', 22),
  ('sessions_10_wukong', 'Wukong Adept', 'Complete 10 practice sessions with Sun Wukong', '💪', 'rare', 23),
  ('sessions_10_sanzang', 'Sanzang Adept', 'Complete 10 practice sessions with Tang Sanzang', '💪', 'rare', 24),
  ('sessions_10_wujing', 'Wujing Adept', 'Complete 10 practice sessions with Sha Wujing', '💪', 'rare', 25),
  ('sessions_10_bajie', 'Bajie Adept', 'Complete 10 practice sessions with Zhu Bajie', '💪', 'rare', 26),
  ('clutch_clear', 'Last Stand', 'Clear a quest stage with only 1 HP remaining', '❤️‍🔥', 'epic', 27),
  ('all_stages_cleared', 'Journey Complete', 'Clear all 7 stages of the Main Quest', '🏆', 'epic', 28),
  ('sessions_20_wukong', 'Wukong Master', 'Complete 20 practice sessions with Sun Wukong', '⭐', 'epic', 29),
  ('sessions_20_sanzang', 'Sanzang Master', 'Complete 20 practice sessions with Tang Sanzang', '⭐', 'epic', 30),
  ('sessions_20_wujing', 'Wujing Master', 'Complete 20 practice sessions with Sha Wujing', '⭐', 'epic', 31),
  ('sessions_20_bajie', 'Bajie Master', 'Complete 20 practice sessions with Zhu Bajie', '⭐', 'epic', 32),
  ('first_chat', 'First Words', 'Complete your first companion chat', '💬', 'common', 33),
  ('chat_messages_50', 'Chatterbox', 'Send 50 messages in companion chat', '🗣️', 'uncommon', 34),
  ('chat_all_companions', 'Polyglot', 'Chat with all 4 companions', '🌏', 'rare', 35),
  ('chat_sessions_10', 'Storyteller', 'Complete 10 companion chat sessions', '📖', 'epic', 36),
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

-- The product has one free starter companion. Encode that rule in the schema
-- instead of picking a character through mutable display text.
WITH ranked_defaults AS (
  SELECT
    c.id,
    ROW_NUMBER() OVER (
      ORDER BY c.unlock_cost_xp ASC, c.id
    ) AS default_rank
  FROM public.characters c
  WHERE c.is_default = true
)
UPDATE public.characters c
SET is_default = false
FROM ranked_defaults ranked
WHERE c.id = ranked.id
  AND ranked.default_rank > 1;

UPDATE public.characters c
SET is_default = true
WHERE c.id = (
  SELECT candidate.id
  FROM public.characters candidate
  ORDER BY candidate.unlock_cost_xp ASC, candidate.id
  LIMIT 1
)
AND NOT EXISTS (
  SELECT 1
  FROM public.characters existing_default
  WHERE existing_default.is_default = true
);

DO $$
DECLARE
  default_count INTEGER;
BEGIN
  SELECT count(*)::INTEGER
  INTO default_count
  FROM public.characters
  WHERE is_default = true;

  IF default_count <> 1 THEN
    RAISE EXCEPTION
      'characters must contain exactly one default character (found %)',
      default_count
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS characters_single_default_idx
  ON public.characters ((is_default))
  WHERE is_default = true;

CREATE OR REPLACE FUNCTION public.enforce_exactly_one_default_character()
RETURNS TRIGGER AS $$
DECLARE
  default_count INTEGER;
BEGIN
  SELECT count(*)::INTEGER
  INTO default_count
  FROM public.characters
  WHERE is_default = true;

  IF default_count <> 1 THEN
    RAISE EXCEPTION
      'characters must contain exactly one default character (found %)',
      default_count
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.enforce_exactly_one_default_character()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS characters_exactly_one_default
ON public.characters;
CREATE CONSTRAINT TRIGGER characters_exactly_one_default
  AFTER INSERT OR UPDATE OR DELETE ON public.characters
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.enforce_exactly_one_default_character();

-- A selected companion is a per-profile singleton. Preserve an existing
-- non-default choice when cleaning historical duplicates, then keep the most
-- recently unlocked row as the deterministic fallback.
WITH ranked_selections AS (
  SELECT
    uc.user_id,
    uc.character_id,
    ROW_NUMBER() OVER (
      PARTITION BY uc.user_id
      ORDER BY
        c.is_default ASC,
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
WHERE uc.user_id = ranked.user_id
  AND uc.character_id = ranked.character_id
  AND ranked.selection_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS user_characters_single_selected_idx
  ON public.user_characters (user_id)
  WHERE is_selected = true;

CREATE OR REPLACE FUNCTION public.handle_unlock_defaults()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_characters (user_id, character_id, is_selected)
  SELECT NEW.id, c.id, true
  FROM public.characters c
  WHERE c.is_default = true
  ON CONFLICT (user_id, character_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.handle_unlock_defaults()
FROM PUBLIC, anon, authenticated;

INSERT INTO public.user_characters (user_id, character_id, is_selected)
SELECT p.id, c.id, false
FROM public.profiles p
JOIN public.characters c ON c.is_default = true
ON CONFLICT (user_id, character_id) DO NOTHING;

UPDATE public.user_characters uc
SET is_selected = true
FROM public.characters c
WHERE c.is_default = true
  AND uc.character_id = c.id
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_characters selected
    WHERE selected.user_id = uc.user_id
      AND selected.is_selected = true
  );
