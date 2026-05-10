
-- ================================================================
-- Security regression fixes — restores broken functionality while
-- preserving the intent of the 20260510000000 security hardening.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. award_xp RPC  (MISSING — broke all XP earning)
--
--    xp-service.ts was updated to call supabase.rpc("award_xp")
--    but no such function existed, causing every XP award call
--    (battles, chests, courses) to fail with a runtime error.
--
--    The guard_xp_update trigger caps per-operation deltas at 1100,
--    which is correct for client-direct updates but too restrictive
--    for server-side awards (a single battle can yield > 1100 XP).
--    We add a trusted-context GUC check so award_xp can bypass
--    the delta cap while still preventing XP reductions.
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_xp_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- award_xp sets this GUC (local to the transaction) to signal
  -- that the increment comes from a trusted server-side function.
  -- In trusted mode we only prevent reductions; no delta cap.
  IF current_setting('app.xp_trusted', true) = '1' THEN
    IF NEW.xp < OLD.xp THEN
      RAISE EXCEPTION 'Direct XP reduction is not permitted';
    END IF;
    RETURN NEW;
  END IF;

  -- Untrusted (direct client UPDATE) — enforce all guards.
  IF NEW.xp IS DISTINCT FROM OLD.xp THEN
    IF NEW.xp < OLD.xp THEN
      RAISE EXCEPTION 'Direct XP reduction is not permitted';
    END IF;
    IF (NEW.xp - OLD.xp) > 1100 THEN
      RAISE EXCEPTION 'XP delta of % exceeds the maximum allowed per operation (1100)',
                      (NEW.xp - OLD.xp);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.award_xp(p_amount integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_new_xp  integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_amount <= 0 THEN
    SELECT xp INTO v_new_xp FROM public.user_profiles WHERE user_id = v_user_id;
    RETURN COALESCE(v_new_xp, 0);
  END IF;
  -- Mark trusted so the guard allows increments larger than 1100.
  PERFORM set_config('app.xp_trusted', '1', true);
  UPDATE public.user_profiles
    SET xp = xp + p_amount
    WHERE user_id = v_user_id
    RETURNING xp INTO v_new_xp;
  PERFORM set_config('app.xp_trusted', '0', true);
  RETURN COALESCE(v_new_xp, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.award_xp(integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.award_xp(integer) TO authenticated;

-- ----------------------------------------------------------------
-- 2. user_profiles — separate public fields from private fields
--
--    The "Anyone can view public profile fields" policy used
--    USING (true), allowing any client (including anonymous) to
--    read ALL columns, including bio, age, weak_areas, strong_areas,
--    and luna_notes.  PostgreSQL RLS is row-level, not column-level,
--    so restricting columns requires a SECURITY DEFINER function.
--
--    Fix: restrict direct SELECT to own row only, then expose only
--    the eight safe display fields via get_public_profile().
-- ----------------------------------------------------------------

DROP POLICY IF EXISTS "Anyone can view public profile fields" ON public.user_profiles;
DROP POLICY IF EXISTS "Users view own profile"               ON public.user_profiles;

CREATE POLICY "Users view own profile"
  ON public.user_profiles FOR SELECT
  USING (auth.uid() = user_id);

-- Safe public-profile lookup — returns only non-sensitive fields.
CREATE OR REPLACE FUNCTION public.get_public_profile(p_username text)
RETURNS TABLE(
  user_id         uuid,
  username        text,
  xp              integer,
  current_streak  integer,
  best_streak     integer,
  equipped_ecliptar text,
  avatar_url      text,
  created_at      timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id, username, xp, current_streak, best_streak,
         equipped_ecliptar, avatar_url, created_at
  FROM   public.user_profiles
  WHERE  username = p_username
  LIMIT  1;
$$;

-- Accessible to anon so /u/:username pages work without login.
REVOKE EXECUTE ON FUNCTION public.get_public_profile(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_public_profile(text) TO anon, authenticated;

-- ----------------------------------------------------------------
-- 3. user_ecliptars — allow public reads for profile display
--
--    The original RLS policy ("Users can view their own ecliptars")
--    prevented anyone from viewing another user's Ecliptar
--    collection, so the "Ecliptars Owned" grid on /u/:username
--    always appeared empty for all visitors.
--
--    Ecliptar collections are intentionally a public display
--    feature (trophy showcase).  Private data (node_id, claimed_at)
--    is non-sensitive; ecliptar_slug/name/archetype are public by
--    design.  Adding a public SELECT policy restores the feature.
-- ----------------------------------------------------------------

DROP POLICY IF EXISTS "Anyone can view ecliptars" ON public.user_ecliptars;
CREATE POLICY "Anyone can view ecliptars"
  ON public.user_ecliptars FOR SELECT
  USING (true);

-- ----------------------------------------------------------------
-- 4. forum_answers.votes guard  (missing from 20260510000000)
--
--    The security hardening added guard_forum_thread_counters to
--    prevent direct manipulation of forum_threads.votes, but
--    forum_answers.votes was overlooked.  A user with the
--    "Users update own answers" UPDATE permission could execute:
--      UPDATE forum_answers SET votes = 9999 WHERE user_id = auth.uid()
--    The trigger below closes that gap using the same
--    pg_trigger_depth() pattern as the thread counter guard.
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_forum_answer_counters()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Depth = 1 means a direct user-initiated UPDATE (not a nested
  -- server trigger like forum_votes_recount which runs at depth 2).
  IF pg_trigger_depth() = 1 THEN
    NEW.votes := OLD.votes;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_forum_answer_counters_trg ON public.forum_answers;
CREATE TRIGGER guard_forum_answer_counters_trg
  BEFORE UPDATE ON public.forum_answers
  FOR EACH ROW EXECUTE FUNCTION public.guard_forum_answer_counters();

-- ----------------------------------------------------------------
-- 5. Forum author-name immutability
--
--    The "Users update own ..." UPDATE policies on forum_threads,
--    forum_answers, and forum_comments allowed a user to set
--    author_name to any arbitrary string (e.g. "Admin") on their
--    own posts after publishing — a display-impersonation attack.
--    The trigger below silently resets author_name to its original
--    value on every UPDATE across all three content tables.
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_forum_author_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.author_name IS DISTINCT FROM OLD.author_name THEN
    NEW.author_name := OLD.author_name;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_forum_thread_author_trg  ON public.forum_threads;
CREATE TRIGGER guard_forum_thread_author_trg
  BEFORE UPDATE ON public.forum_threads
  FOR EACH ROW EXECUTE FUNCTION public.guard_forum_author_name();

DROP TRIGGER IF EXISTS guard_forum_answer_author_trg  ON public.forum_answers;
CREATE TRIGGER guard_forum_answer_author_trg
  BEFORE UPDATE ON public.forum_answers
  FOR EACH ROW EXECUTE FUNCTION public.guard_forum_author_name();

DROP TRIGGER IF EXISTS guard_forum_comment_author_trg ON public.forum_comments;
CREATE TRIGGER guard_forum_comment_author_trg
  BEFORE UPDATE ON public.forum_comments
  FOR EACH ROW EXECUTE FUNCTION public.guard_forum_author_name();

-- ----------------------------------------------------------------
-- 6. Platform / forum stats — restore anonymous access
--
--    get_platform_stats() is called from StatsFooter, which lives
--    on the public landing page (index.tsx) and must work without
--    login.  The security hardening revoked anon EXECUTE, breaking
--    the stats display on the marketing page.
--
--    Both functions return only aggregate counts — no PII, no row
--    data — so granting anon EXECUTE is safe.  The SECURITY
--    DEFINER flag is needed so they can bypass RLS to COUNT rows,
--    which is harmless for pure aggregate queries.
-- ----------------------------------------------------------------

GRANT EXECUTE ON FUNCTION public.get_platform_stats() TO anon;
GRANT EXECUTE ON FUNCTION public.get_forum_stats()    TO anon;

-- ----------------------------------------------------------------
-- 7. Storage listing — re-grant public SELECT for course-images
--
--    The security hardening replaced "Public read course images"
--    with "Users view own course image folder".  Both buckets are
--    created with public = true, so individual file URLs bypass
--    RLS entirely and this only affects the .list() API.
--
--    However, to keep course-image listing working for course
--    editors browsing their own uploads, the own-folder restriction
--    is correct.  No change needed.
--
--    Avatars: same reasoning — public URLs work; listing is
--    restricted to own folder.  Correct as-is.
-- ----------------------------------------------------------------
-- (no SQL change required here — documented for completeness)
