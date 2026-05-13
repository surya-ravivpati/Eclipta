-- Public profile RPC (security definer) — exposes only safe public fields
CREATE OR REPLACE FUNCTION public.get_public_profile(p_username text)
RETURNS TABLE (
  user_id uuid,
  username text,
  xp integer,
  current_streak integer,
  best_streak integer,
  equipped_ecliptar text,
  avatar_url text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id, username, xp, current_streak, best_streak,
         equipped_ecliptar, avatar_url, created_at
  FROM public.user_profiles
  WHERE lower(username) = lower(p_username)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_profile(text) TO anon, authenticated;