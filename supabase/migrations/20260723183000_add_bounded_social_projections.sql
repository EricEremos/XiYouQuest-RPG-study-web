-- Keep cross-profile social reads inside narrow authenticated projections.
-- The application receives only the fields it renders; raw progress history
-- and general service-role table access stay out of request handlers.

CREATE INDEX IF NOT EXISTS friendships_requester_status_id_idx
ON public.friendships (requester_id, status, id);

CREATE INDEX IF NOT EXISTS friendships_addressee_status_id_idx
ON public.friendships (addressee_id, status, id);

CREATE OR REPLACE FUNCTION public.get_leaderboard_projection(
  requested_metric TEXT,
  requested_scope TEXT DEFAULT 'global'
)
RETURNS TABLE (
  rank BIGINT,
  id UUID,
  display_name TEXT,
  avatar_url TEXT,
  current_level INTEGER,
  value NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF requested_scope NOT IN ('global', 'friends') THEN
    RAISE EXCEPTION 'Invalid leaderboard scope' USING ERRCODE = '22023';
  END IF;

  IF requested_metric NOT IN ('xp', 'accuracy', 'streak') THEN
    RAISE EXCEPTION 'Invalid leaderboard metric' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH friend_candidates AS (
    SELECT
      CASE
        WHEN f.requester_id = auth.uid() THEN f.addressee_id
        ELSE f.requester_id
      END AS user_id,
      min(f.id::TEXT)::UUID AS first_friendship_id
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (
        f.requester_id = auth.uid()
        OR f.addressee_id = auth.uid()
      )
    GROUP BY
      CASE
        WHEN f.requester_id = auth.uid() THEN f.addressee_id
        ELSE f.requester_id
      END
    ORDER BY first_friendship_id, user_id
    LIMIT 200
  ),
  permitted_users AS (
    SELECT auth.uid() AS user_id
    UNION
    SELECT friend_candidates.user_id
    FROM friend_candidates
  ),
  metric_values AS (
    SELECT
      p.id,
      p.display_name,
      p.avatar_url,
      p.current_level,
      p.total_xp::NUMERIC AS value,
      0::BIGINT AS tie_breaker
    FROM public.profiles p
    WHERE requested_metric = 'xp'
      AND (
        requested_scope = 'global'
        OR p.id IN (SELECT permitted_users.user_id FROM permitted_users)
      )

    UNION ALL

    SELECT
      p.id,
      p.display_name,
      p.avatar_url,
      p.current_level,
      p.login_streak::NUMERIC AS value,
      0::BIGINT AS tie_breaker
    FROM public.profiles p
    WHERE requested_metric = 'streak'
      AND (
        requested_scope = 'global'
        OR p.id IN (SELECT permitted_users.user_id FROM permitted_users)
      )

    UNION ALL

    SELECT
      p.id,
      p.display_name,
      p.avatar_url,
      p.current_level,
      round(
        sum(up.questions_correct)::NUMERIC
        / sum(up.questions_attempted)
        * 100,
        1
      ) AS value,
      sum(up.questions_attempted)::BIGINT AS tie_breaker
    FROM public.profiles p
    JOIN public.user_progress up ON up.user_id = p.id
    WHERE requested_metric = 'accuracy'
      AND (
        requested_scope = 'global'
        OR p.id IN (SELECT permitted_users.user_id FROM permitted_users)
      )
    GROUP BY p.id, p.display_name, p.avatar_url, p.current_level
    HAVING sum(up.questions_attempted) > 0
  ),
  ranked AS (
    SELECT
      row_number() OVER (
        ORDER BY
          metric_values.value DESC,
          metric_values.tie_breaker DESC,
          metric_values.id
      ) AS rank,
      metric_values.id,
      metric_values.display_name,
      metric_values.avatar_url,
      metric_values.current_level,
      metric_values.value
    FROM metric_values
  )
  SELECT
    ranked.rank,
    ranked.id,
    ranked.display_name,
    ranked.avatar_url,
    ranked.current_level,
    ranked.value
  FROM ranked
  WHERE requested_scope = 'friends'
    OR ranked.rank <= 20
    OR ranked.id = auth.uid()
  ORDER BY ranked.rank;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_leaderboard_projection(TEXT, TEXT)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_leaderboard_projection(TEXT, TEXT)
TO authenticated;
