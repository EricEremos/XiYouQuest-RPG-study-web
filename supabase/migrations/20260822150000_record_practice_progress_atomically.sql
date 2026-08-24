CREATE OR REPLACE FUNCTION public.record_practice_progress(
  p_user_id uuid,
  p_character_id uuid,
  p_client_attempt_id uuid,
  p_component smallint,
  p_score real,
  p_xp_earned integer,
  p_duration_seconds integer,
  p_questions_attempted integer,
  p_questions_correct integer,
  p_best_streak integer,
  p_today date,
  p_daily_bonus_base integer
)
RETURNS TABLE(
  already_recorded boolean,
  new_total_xp integer,
  new_level integer,
  new_affection_xp integer,
  new_affection_level integer,
  daily_bonus_awarded integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_existing_session_id uuid;
  v_diff_days integer;
  v_new_streak integer;
  v_daily_bonus integer := 0;
  v_total_xp integer;
  v_level integer;
  v_affection_xp integer := 0;
  v_affection_level integer := 1;
BEGIN
  IF p_client_attempt_id IS NULL THEN
    RAISE EXCEPTION 'client attempt id is required';
  END IF;

  IF NOT (
    COALESCE((SELECT auth.role()), '') = 'service_role'
    OR ((SELECT auth.uid()) IS NOT NULL AND (SELECT auth.uid()) = p_user_id)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: caller must match p_user_id';
  END IF;

  SELECT *
  INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user %', p_user_id;
  END IF;

  SELECT id
  INTO v_existing_session_id
  FROM public.practice_sessions
  WHERE user_id = p_user_id
    AND client_attempt_id = p_client_attempt_id;

  IF FOUND THEN
    SELECT affection_xp, affection_level
    INTO v_affection_xp, v_affection_level
    FROM public.user_characters
    WHERE user_id = p_user_id
      AND character_id = p_character_id;

    RETURN QUERY SELECT
      true,
      v_profile.total_xp,
      v_profile.current_level,
      COALESCE(v_affection_xp, 0),
      COALESCE(v_affection_level, 1),
      0;
    RETURN;
  END IF;

  v_new_streak := v_profile.login_streak;

  IF v_profile.last_login_date IS NULL OR v_profile.last_login_date <> p_today THEN
    IF v_profile.last_login_date IS NOT NULL THEN
      v_diff_days := p_today - v_profile.last_login_date;
      IF v_diff_days = 1 THEN
        v_new_streak := v_profile.login_streak + 1;
      ELSE
        v_new_streak := 1;
      END IF;
    ELSE
      v_new_streak := 1;
    END IF;

    IF v_new_streak >= 10 THEN
      v_daily_bonus := FLOOR(p_daily_bonus_base * 2.0);
    ELSIF v_new_streak >= 5 THEN
      v_daily_bonus := FLOOR(p_daily_bonus_base * 1.5);
    ELSE
      v_daily_bonus := p_daily_bonus_base;
    END IF;
  END IF;

  v_total_xp := v_profile.total_xp + p_xp_earned + v_daily_bonus;
  v_level := CASE
    WHEN v_total_xp >= 10000 THEN 10
    WHEN v_total_xp >= 6000 THEN 9
    WHEN v_total_xp >= 4000 THEN 8
    WHEN v_total_xp >= 2500 THEN 7
    WHEN v_total_xp >= 1500 THEN 6
    WHEN v_total_xp >= 1000 THEN 5
    WHEN v_total_xp >= 600 THEN 4
    WHEN v_total_xp >= 300 THEN 3
    WHEN v_total_xp >= 100 THEN 2
    ELSE 1
  END;

  INSERT INTO public.user_progress (
    user_id,
    component,
    questions_attempted,
    questions_correct,
    best_streak,
    total_practice_time_seconds,
    last_practiced_at
  ) VALUES (
    p_user_id,
    p_component,
    p_questions_attempted,
    p_questions_correct,
    p_best_streak,
    p_duration_seconds,
    now()
  )
  ON CONFLICT (user_id, component) DO UPDATE SET
    questions_attempted = public.user_progress.questions_attempted + EXCLUDED.questions_attempted,
    questions_correct = public.user_progress.questions_correct + EXCLUDED.questions_correct,
    best_streak = GREATEST(public.user_progress.best_streak, EXCLUDED.best_streak),
    total_practice_time_seconds = public.user_progress.total_practice_time_seconds + EXCLUDED.total_practice_time_seconds,
    last_practiced_at = EXCLUDED.last_practiced_at;

  UPDATE public.profiles
  SET total_xp = v_total_xp,
      current_level = v_level,
      login_streak = v_new_streak,
      last_login_date = CASE
        WHEN v_profile.last_login_date IS NULL OR v_profile.last_login_date <> p_today THEN p_today
        ELSE v_profile.last_login_date
      END
  WHERE id = p_user_id;

  UPDATE public.user_characters
  SET affection_xp = affection_xp + p_xp_earned,
      affection_level = CASE
        WHEN affection_xp + p_xp_earned >= 2000 THEN 5
        WHEN affection_xp + p_xp_earned >= 1000 THEN 4
        WHEN affection_xp + p_xp_earned >= 500 THEN 3
        WHEN affection_xp + p_xp_earned >= 200 THEN 2
        ELSE 1
      END
  WHERE user_id = p_user_id
    AND character_id = p_character_id
  RETURNING affection_xp, affection_level INTO v_affection_xp, v_affection_level;

  INSERT INTO public.practice_sessions (
    user_id,
    character_id,
    client_attempt_id,
    component,
    score,
    xp_earned,
    duration_seconds
  ) VALUES (
    p_user_id,
    p_character_id,
    p_client_attempt_id,
    p_component,
    p_score,
    p_xp_earned,
    p_duration_seconds
  );

  RETURN QUERY SELECT
    false,
    v_total_xp,
    v_level,
    COALESCE(v_affection_xp, 0),
    COALESCE(v_affection_level, 1),
    v_daily_bonus;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_practice_progress(uuid, uuid, uuid, smallint, real, integer, integer, integer, integer, integer, date, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_practice_progress(uuid, uuid, uuid, smallint, real, integer, integer, integer, integer, integer, date, integer) TO service_role;
