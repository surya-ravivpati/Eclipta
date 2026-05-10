
-- ================================================================
-- Security hardening: fixes all Supabase advisor warnings/errors
-- ================================================================

-- ----------------------------------------------------------------
-- 1. LEADERBOARD RPC — safe public XP display without exposing
--    private profile fields (bio, age, weak_areas, etc.)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_leaderboard(p_limit integer DEFAULT 10)
RETURNS TABLE(user_id uuid, username text, xp integer, avatar_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id, username, xp, avatar_url
  FROM public.user_profiles
  ORDER BY xp DESC
  LIMIT LEAST(p_limit, 100);
$$;

REVOKE EXECUTE ON FUNCTION public.get_leaderboard(integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_leaderboard(integer) TO authenticated;

-- ----------------------------------------------------------------
-- 2. XP PROTECTION — guard trigger prevents arbitrary XP injection
--    Users cannot: set XP to an arbitrary value, decrease XP,
--    or jump by more than 1100 (largest chest bonus) in one call.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_xp_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.xp IS DISTINCT FROM OLD.xp THEN
    IF NEW.xp < OLD.xp THEN
      RAISE EXCEPTION 'Direct XP reduction is not permitted';
    END IF;
    IF (NEW.xp - OLD.xp) > 1100 THEN
      RAISE EXCEPTION 'XP delta of % exceeds the maximum allowed per operation (1100)', (NEW.xp - OLD.xp);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_xp_update_trg ON public.user_profiles;
CREATE TRIGGER guard_xp_update_trg
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_xp_update();

-- ----------------------------------------------------------------
-- 3. FORUM COUNTER PROTECTION — prevent thread/answer owners from
--    directly writing votes, answer_count, or view_count.
--    Counter columns are maintained exclusively by server triggers.
--    pg_trigger_depth() = 1 means "fired directly by a user UPDATE"
--    (depth 2+ means a server trigger is the caller → allow).
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_forum_thread_counters()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() = 1 THEN
    NEW.votes       := OLD.votes;
    NEW.answer_count := OLD.answer_count;
    NEW.view_count  := OLD.view_count;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_forum_thread_counters_trg ON public.forum_threads;
CREATE TRIGGER guard_forum_thread_counters_trg
  BEFORE UPDATE ON public.forum_threads
  FOR EACH ROW EXECUTE FUNCTION public.guard_forum_thread_counters();

-- ----------------------------------------------------------------
-- 4. FORUM VOTES — restrict SELECT so voting activity is private.
--    Each user can only see their own votes.
--    (Vote totals are already denormalized onto threads/answers.)
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can view votes" ON public.forum_votes;
CREATE POLICY "Users view own votes" ON public.forum_votes
  FOR SELECT USING (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- 5. FORUM THREAD VIEWS — restrict SELECT so view history is private.
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone read view rows" ON public.forum_thread_views;
CREATE POLICY "Users view own thread views" ON public.forum_thread_views
  FOR SELECT USING (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- 6. SECURITY DEFINER FUNCTIONS — revoke PUBLIC / anon EXECUTE.
--    Anon users have no business calling these functions.
--    platform stats and forum stats are for authenticated users only.
-- ----------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_platform_stats() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_platform_stats() FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_platform_stats() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_forum_stats() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_forum_stats() FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_forum_stats() TO authenticated;

-- ----------------------------------------------------------------
-- 7. STORAGE — prevent public enumeration of avatar / course-image
--    bucket contents while keeping individual file URLs accessible
--    (public buckets serve files by URL without RLS).
--    Listing is now restricted to a user's own folder.
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
CREATE POLICY "Users view own avatar folder" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Public read course images" ON storage.objects;
CREATE POLICY "Users view own course image folder" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'course-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
