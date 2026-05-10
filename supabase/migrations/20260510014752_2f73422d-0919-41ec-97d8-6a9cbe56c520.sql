
-- 1) Remove user_profiles from realtime publication (prevents broadcast of sensitive fields)
ALTER PUBLICATION supabase_realtime DROP TABLE public.user_profiles;

-- 2) Recreate public_profiles view as SECURITY INVOKER
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
WITH (security_invoker = on) AS
SELECT
  user_id,
  username,
  avatar_url,
  bio,
  xp,
  current_streak,
  best_streak,
  equipped_ecliptar,
  created_at
FROM public.user_profiles;

GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- 3) Restrict forum_votes SELECT to owner
DROP POLICY IF EXISTS "Anyone can view votes" ON public.forum_votes;
CREATE POLICY "Users view own votes"
  ON public.forum_votes FOR SELECT
  USING (auth.uid() = user_id);

-- 4) Restrict forum_thread_views SELECT to owner
DROP POLICY IF EXISTS "Anyone read view rows" ON public.forum_thread_views;
CREATE POLICY "Users view own thread views"
  ON public.forum_thread_views FOR SELECT
  USING (auth.uid() = user_id);
