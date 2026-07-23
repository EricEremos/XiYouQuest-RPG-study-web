-- 005_rpc_guards_service_role.sql
--
-- Supabase third-party auth only trusts the JWKS of five named providers, so
-- Better Auth JWTs can never authenticate against PostgREST. The app server
-- (Next.js API routes and Supabase edge functions) therefore verifies the
-- Better Auth session itself and connects with the service-role key, scoping
-- every statement by the verified user id (see src/lib/supabase/server.ts and
-- supabase/functions/_shared/supabase.ts).
--
-- The three SECURITY DEFINER RPCs previously required auth.uid() = p_user_id,
-- which is NULL under the service role, so every call from the app raised
-- "Unauthorized" (breaking practice-session saves, chat streak updates, and
-- the chat message-count achievement). Extend the guard: the service role is
-- trusted (the caller has already verified the session and supplies the
-- verified id as p_user_id); end-user JWTs must still match p_user_id.
-- Everything else in each function body is unchanged.

CREATE OR REPLACE FUNCTION public.update_profile_with_streak(p_user_id uuid, p_today date, p_xp_to_add integer, p_daily_bonus_base integer)
 RETURNS TABLE(new_total_xp integer, new_login_streak integer, daily_bonus_awarded integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile RECORD;
  v_diff_days INTEGER;
  v_new_streak INTEGER;
  v_bonus INTEGER := 0;
BEGIN
  -- Caller must be the target user, or the trusted service role (which has
  -- already session-verified the user server-side).
  IF NOT (
    COALESCE((SELECT auth.role()), '') = 'service_role'
    OR ((SELECT auth.uid()) IS NOT NULL AND (SELECT auth.uid()) = p_user_id)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: caller must match p_user_id';
  END IF;

  -- Lock the row to prevent concurrent streak updates
  SELECT p.total_xp, p.last_login_date, p.login_streak
  INTO v_profile
  FROM public.profiles p
  WHERE p.id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user %', p_user_id;
  END IF;

  v_new_streak := v_profile.login_streak;

  IF v_profile.last_login_date IS NULL OR v_profile.last_login_date <> p_today THEN
    -- New day: compute streak
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

    -- Apply streak multiplier to daily bonus
    IF v_new_streak >= 10 THEN
      v_bonus := FLOOR(p_daily_bonus_base * 2.0);
    ELSIF v_new_streak >= 5 THEN
      v_bonus := FLOOR(p_daily_bonus_base * 1.5);
    ELSE
      v_bonus := p_daily_bonus_base;
    END IF;

    UPDATE public.profiles
    SET total_xp = total_xp + p_xp_to_add + v_bonus,
        login_streak = v_new_streak,
        last_login_date = p_today
    WHERE id = p_user_id;
  ELSE
    -- Same day: just add session XP, no daily bonus
    v_bonus := 0;
    UPDATE public.profiles
    SET total_xp = total_xp + p_xp_to_add
    WHERE id = p_user_id;
  END IF;

  RETURN QUERY SELECT
    (v_profile.total_xp + p_xp_to_add + v_bonus)::INTEGER,
    v_new_streak,
    v_bonus;
END;
$function$;

CREATE OR REPLACE FUNCTION public.deduct_xp_if_sufficient(p_user_id uuid, p_cost integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  remaining INT;
BEGIN
  -- Caller must be the target user, or the trusted service role (which has
  -- already session-verified the user server-side).
  IF NOT (
    COALESCE((SELECT auth.role()), '') = 'service_role'
    OR ((SELECT auth.uid()) IS NOT NULL AND (SELECT auth.uid()) = p_user_id)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: caller must match p_user_id';
  END IF;

  UPDATE profiles
  SET total_xp = total_xp - p_cost
  WHERE id = p_user_id AND total_xp >= p_cost
  RETURNING total_xp INTO remaining;

  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  RETURN remaining;
END;
$function$;

CREATE OR REPLACE FUNCTION public.count_user_chat_messages(p_user_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Caller must be the target user, or the trusted service role (which has
  -- already session-verified the user server-side).
  IF NOT (
    COALESCE((SELECT auth.role()), '') = 'service_role'
    OR ((SELECT auth.uid()) IS NOT NULL AND (SELECT auth.uid()) = p_user_id)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: caller must match p_user_id';
  END IF;

  RETURN (
    SELECT count(*)
    FROM chat_messages cm
    JOIN chat_sessions cs ON cs.id = cm.session_id
    WHERE cs.user_id = p_user_id
      AND cm.role = 'user'
  );
END;
$function$;
