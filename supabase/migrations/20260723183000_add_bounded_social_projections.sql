-- Keep cross-profile social reads inside narrow authenticated projections.
-- The application receives only the fields it renders; raw progress history
-- and general service-role table access stay out of request handlers.

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
  WITH permitted_users AS (
    SELECT auth.uid() AS user_id
    UNION
    SELECT
      CASE
        WHEN f.requester_id = auth.uid() THEN f.addressee_id
        ELSE f.requester_id
      END
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (
        f.requester_id = auth.uid()
        OR f.addressee_id = auth.uid()
      )
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

CREATE OR REPLACE FUNCTION public.get_social_friend_stats()
RETURNS TABLE (
  friendship_id UUID,
  is_self BOOLEAN,
  id UUID,
  display_name TEXT,
  avatar_url TEXT,
  current_level INTEGER,
  total_xp INTEGER,
  login_streak INTEGER,
  total_sessions BIGINT,
  avg_scores JSONB,
  selected_character JSONB,
  achievement_count BIGINT
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

  RETURN QUERY
  WITH authorized_users AS (
    SELECT
      auth.uid() AS user_id,
      NULL::UUID AS friendship_id,
      true AS is_self
    UNION ALL
    SELECT
      CASE
        WHEN f.requester_id = auth.uid() THEN f.addressee_id
        ELSE f.requester_id
      END AS user_id,
      f.id AS friendship_id,
      false AS is_self
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (
        f.requester_id = auth.uid()
        OR f.addressee_id = auth.uid()
      )
  ),
  component_scores AS (
    SELECT
      ps.user_id,
      ps.component,
      count(*)::BIGINT AS component_sessions,
      round(avg(ps.score))::INTEGER AS avg_score
    FROM public.practice_sessions ps
    WHERE ps.user_id IN (
      SELECT authorized_users.user_id
      FROM authorized_users
    )
    GROUP BY ps.user_id, ps.component
  ),
  session_stats AS (
    SELECT
      component_scores.user_id,
      sum(component_scores.component_sessions)::BIGINT AS total_sessions,
      jsonb_build_object(
        '1', max(component_scores.avg_score) FILTER (WHERE component_scores.component = 1),
        '2', max(component_scores.avg_score) FILTER (WHERE component_scores.component = 2),
        '3', max(component_scores.avg_score) FILTER (WHERE component_scores.component = 3),
        '4', max(component_scores.avg_score) FILTER (WHERE component_scores.component = 4),
        '5', max(component_scores.avg_score) FILTER (WHERE component_scores.component = 5),
        '6', max(component_scores.avg_score) FILTER (WHERE component_scores.component = 6),
        '7', max(component_scores.avg_score) FILTER (WHERE component_scores.component = 7)
      ) AS avg_scores
    FROM component_scores
    GROUP BY component_scores.user_id
  ),
  selected_characters AS (
    SELECT
      uc.user_id,
      jsonb_build_object(
        'name', c.name,
        'image_url', c.image_url
      ) AS selected_character
    FROM public.user_characters uc
    JOIN public.characters c ON c.id = uc.character_id
    WHERE uc.is_selected = true
      AND uc.user_id IN (
        SELECT authorized_users.user_id
        FROM authorized_users
      )
  ),
  achievement_counts AS (
    SELECT
      ua.user_id,
      count(*)::BIGINT AS achievement_count
    FROM public.user_achievements ua
    WHERE ua.user_id IN (
      SELECT authorized_users.user_id
      FROM authorized_users
    )
    GROUP BY ua.user_id
  )
  SELECT
    authorized_users.friendship_id,
    authorized_users.is_self,
    p.id,
    p.display_name,
    p.avatar_url,
    p.current_level,
    p.total_xp,
    p.login_streak,
    COALESCE(session_stats.total_sessions, 0),
    COALESCE(
      session_stats.avg_scores,
      jsonb_build_object(
        '1', NULL,
        '2', NULL,
        '3', NULL,
        '4', NULL,
        '5', NULL,
        '6', NULL,
        '7', NULL
      )
    ),
    selected_characters.selected_character,
    COALESCE(achievement_counts.achievement_count, 0)
  FROM authorized_users
  JOIN public.profiles p ON p.id = authorized_users.user_id
  LEFT JOIN session_stats ON session_stats.user_id = authorized_users.user_id
  LEFT JOIN selected_characters ON selected_characters.user_id = authorized_users.user_id
  LEFT JOIN achievement_counts ON achievement_counts.user_id = authorized_users.user_id
  ORDER BY authorized_users.is_self DESC, p.display_name, p.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_social_friend_stats()
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_social_friend_stats()
TO authenticated;
