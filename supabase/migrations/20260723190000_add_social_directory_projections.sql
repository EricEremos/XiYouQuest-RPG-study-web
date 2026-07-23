-- Move the remaining service-role social reads (friend-code lookup, name
-- search, pending requests, achievement feed) into the same narrow
-- authenticated SECURITY DEFINER projections used by the leaderboard and
-- friend stats. Request handlers keep zero general table access and every
-- authorization rule lives next to the data it protects.
--
-- Privacy decision (intentional, product-approved): friend codes are shared
-- identifiers, so an exact-code lookup and a display-name search are
-- discoverable to any authenticated user. Both projections return only
-- id, display_name, avatar_url, and current_level; friend_code itself is
-- never returned for another profile, so a code can be used but not
-- harvested. The HTTP routes add per-user rate limiting on top.

CREATE OR REPLACE FUNCTION public.get_friend_code_profile(
  requested_code TEXT
)
RETURNS TABLE (
  id UUID,
  display_name TEXT,
  avatar_url TEXT,
  current_level INTEGER
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

  IF requested_code IS NULL
    OR length(trim(requested_code)) < 3
    OR length(trim(requested_code)) > 50 THEN
    RAISE EXCEPTION 'Invalid friend code' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.display_name,
    p.avatar_url,
    p.current_level
  FROM public.profiles p
  WHERE p.friend_code = trim(requested_code)
    AND p.id <> auth.uid();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_friend_code_profile(TEXT)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_friend_code_profile(TEXT)
TO authenticated;

CREATE OR REPLACE FUNCTION public.search_profiles_for_friends(
  search_term TEXT
)
RETURNS TABLE (
  id UUID,
  display_name TEXT,
  avatar_url TEXT,
  current_level INTEGER
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

  IF search_term IS NULL
    OR length(trim(search_term)) < 2
    OR length(trim(search_term)) > 50 THEN
    RAISE EXCEPTION 'Invalid search term' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.display_name,
    p.avatar_url,
    p.current_level
  FROM public.profiles p
  WHERE p.id <> auth.uid()
    -- The caller's term is matched literally: ILIKE wildcard and escape
    -- characters in user input are escaped before the pattern is built.
    AND p.display_name ILIKE
      '%'
      || replace(
        replace(
          replace(trim(search_term), '\', '\\'),
          '%',
          '\%'
        ),
        '_',
        '\_'
      )
      || '%'
    -- Any existing friendship row (pending, accepted, or declined) hides the
    -- profile from search; the UI offers those users through other surfaces.
    AND NOT EXISTS (
      SELECT 1
      FROM public.friendships f
      WHERE (f.requester_id = auth.uid() AND f.addressee_id = p.id)
        OR (f.addressee_id = auth.uid() AND f.requester_id = p.id)
    )
  ORDER BY p.display_name, p.id
  LIMIT 10;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.search_profiles_for_friends(TEXT)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.search_profiles_for_friends(TEXT)
TO authenticated;

CREATE OR REPLACE FUNCTION public.get_pending_friend_requests()
RETURNS TABLE (
  direction TEXT,
  friendship_id UUID,
  created_at TIMESTAMPTZ,
  id UUID,
  display_name TEXT,
  avatar_url TEXT,
  current_level INTEGER
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

  -- Each direction is bounded to the newest 200 rows, matching the bound the
  -- other projections place on friendship-derived reads.
  RETURN QUERY
  SELECT *
  FROM (
    SELECT
      'incoming'::TEXT AS direction,
      f.id AS friendship_id,
      f.created_at,
      p.id,
      p.display_name,
      p.avatar_url,
      p.current_level
    FROM public.friendships f
    JOIN public.profiles p ON p.id = f.requester_id
    WHERE f.addressee_id = auth.uid()
      AND f.status = 'pending'
    ORDER BY f.created_at DESC, f.id
    LIMIT 200
  ) AS incoming_requests

  UNION ALL

  SELECT *
  FROM (
    SELECT
      'outgoing'::TEXT AS direction,
      f.id AS friendship_id,
      f.created_at,
      p.id,
      p.display_name,
      p.avatar_url,
      p.current_level
    FROM public.friendships f
    JOIN public.profiles p ON p.id = f.addressee_id
    WHERE f.requester_id = auth.uid()
      AND f.status = 'pending'
    ORDER BY f.created_at DESC, f.id
    LIMIT 200
  ) AS outgoing_requests

  ORDER BY 3 DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_pending_friend_requests()
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_pending_friend_requests()
TO authenticated;

CREATE OR REPLACE FUNCTION public.get_achievement_feed()
RETURNS TABLE (
  unlocked_at TIMESTAMPTZ,
  user_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  achievement_key TEXT,
  achievement_name TEXT,
  achievement_emoji TEXT,
  achievement_tier TEXT,
  is_self BOOLEAN
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
  WITH permitted_users AS (
    SELECT auth.uid() AS permitted_user_id
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
  )
  SELECT
    ua.unlocked_at,
    ua.user_id,
    p.display_name,
    p.avatar_url,
    a.key AS achievement_key,
    a.name AS achievement_name,
    a.emoji AS achievement_emoji,
    a.tier AS achievement_tier,
    (ua.user_id = auth.uid()) AS is_self
  FROM public.user_achievements ua
  JOIN public.profiles p ON p.id = ua.user_id
  JOIN public.achievements a ON a.id = ua.achievement_id
  WHERE ua.user_id IN (
    SELECT permitted_users.permitted_user_id FROM permitted_users
  )
  ORDER BY ua.unlocked_at DESC
  LIMIT 20;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_achievement_feed()
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_achievement_feed()
TO authenticated;
