
-- 1. user_profiles: restrict SELECT to owner; expose safe columns via view
DROP POLICY IF EXISTS "Anyone can view public profile fields" ON public.user_profiles;
DROP POLICY IF EXISTS "Users view own profile" ON public.user_profiles;
CREATE POLICY "Users view own profile" ON public.user_profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = false) AS
SELECT user_id, username, avatar_url, bio, xp, current_streak, best_streak, equipped_ecliptar, created_at
FROM public.user_profiles;
REVOKE ALL ON public.public_profiles FROM PUBLIC;
GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- 2. XP log + event-based RPCs
CREATE TABLE IF NOT EXISTS public.xp_award_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event text NOT NULL,
  amount integer NOT NULL,
  awarded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS xp_award_log_user_time_idx ON public.xp_award_log(user_id, awarded_at DESC);
ALTER TABLE public.xp_award_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own xp log" ON public.xp_award_log;
CREATE POLICY "Users view own xp log" ON public.xp_award_log
  FOR SELECT USING (auth.uid() = user_id);

DROP FUNCTION IF EXISTS public.award_xp(integer);
DROP FUNCTION IF EXISTS public.award_xp(text);
CREATE OR REPLACE FUNCTION public.award_xp(p_event text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_amount integer; v_recent integer; v_new integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_amount := CASE p_event
    WHEN 'battle_complete' THEN 25 WHEN 'battle_win' THEN 75
    WHEN 'quiz_correct' THEN 10   WHEN 'daily_challenge' THEN 100
    WHEN 'lesson_complete' THEN 30 WHEN 'forum_answer' THEN 15
    WHEN 'forum_thread' THEN 10   ELSE 0 END;
  IF v_amount = 0 THEN RAISE EXCEPTION 'Unknown XP event: %', p_event; END IF;
  SELECT COUNT(*) INTO v_recent FROM public.xp_award_log
   WHERE user_id = v_uid AND awarded_at > now() - interval '1 minute';
  IF v_recent >= 30 THEN RAISE EXCEPTION 'XP rate limit exceeded'; END IF;
  INSERT INTO public.xp_award_log(user_id, event, amount) VALUES (v_uid, p_event, v_amount);
  UPDATE public.user_profiles SET xp = xp + v_amount WHERE user_id = v_uid RETURNING xp INTO v_new;
  RETURN v_new;
END $$;

CREATE OR REPLACE FUNCTION public.award_battle_xp(p_correct integer, p_total integer, p_won boolean)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_amount integer; v_recent integer; v_new integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_total IS NULL OR p_total < 1 OR p_total > 50 THEN RAISE EXCEPTION 'Invalid total'; END IF;
  IF p_correct IS NULL OR p_correct < 0 OR p_correct > p_total THEN RAISE EXCEPTION 'Invalid correct'; END IF;
  v_amount := LEAST(1000, (p_correct * 15) + (CASE WHEN p_won THEN 50 ELSE 0 END));
  SELECT COUNT(*) INTO v_recent FROM public.xp_award_log
   WHERE user_id = v_uid AND awarded_at > now() - interval '1 minute';
  IF v_recent >= 30 THEN RAISE EXCEPTION 'XP rate limit exceeded'; END IF;
  INSERT INTO public.xp_award_log(user_id, event, amount) VALUES (v_uid, 'battle', v_amount);
  UPDATE public.user_profiles SET xp = xp + v_amount WHERE user_id = v_uid RETURNING xp INTO v_new;
  RETURN v_new;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS user_chest_claims_user_node_uniq ON public.user_chest_claims(user_id, node_id);

CREATE OR REPLACE FUNCTION public.claim_chest(p_node_id integer, p_chest_label text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_bonus integer; v_new integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_bonus := CASE p_chest_label
    WHEN 'Bronze Chest' THEN 50  WHEN 'Silver Chest' THEN 100
    WHEN 'Gold Chest' THEN 200   WHEN 'Diamond Chest' THEN 350
    WHEN 'Platinum Chest' THEN 500 WHEN 'Champion Chest' THEN 750
    WHEN 'Unreal Chest' THEN 1000 ELSE 0 END;
  IF v_bonus = 0 THEN RAISE EXCEPTION 'Unknown chest'; END IF;
  INSERT INTO public.user_chest_claims(user_id, node_id, chest_label, bonus_xp)
    VALUES (v_uid, p_node_id, p_chest_label, v_bonus);
  INSERT INTO public.xp_award_log(user_id, event, amount) VALUES (v_uid, 'chest:'||p_chest_label, v_bonus);
  UPDATE public.user_profiles SET xp = xp + v_bonus WHERE user_id = v_uid RETURNING xp INTO v_new;
  RETURN v_bonus;
END $$;

-- get_leaderboard (idempotent — earlier migration may not have applied)
CREATE OR REPLACE FUNCTION public.get_leaderboard(p_limit integer DEFAULT 10)
RETURNS TABLE(user_id uuid, username text, xp integer, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT user_id, username, xp, avatar_url FROM public.user_profiles
  ORDER BY xp DESC LIMIT LEAST(p_limit, 100);
$$;

-- 3. forum_answers.votes guard
CREATE OR REPLACE FUNCTION public.guard_forum_answer_counters()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() = 1 THEN NEW.votes := OLD.votes; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_forum_answer_counters_trg ON public.forum_answers;
CREATE TRIGGER guard_forum_answer_counters_trg
  BEFORE UPDATE ON public.forum_answers
  FOR EACH ROW EXECUTE FUNCTION public.guard_forum_answer_counters();

-- forum_threads guard if not already there
CREATE OR REPLACE FUNCTION public.guard_forum_thread_counters()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() = 1 THEN
    NEW.votes := OLD.votes; NEW.answer_count := OLD.answer_count; NEW.view_count := OLD.view_count;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_forum_thread_counters_trg ON public.forum_threads;
CREATE TRIGGER guard_forum_thread_counters_trg
  BEFORE UPDATE ON public.forum_threads
  FOR EACH ROW EXECUTE FUNCTION public.guard_forum_thread_counters();

-- 4. enforce author_name
CREATE OR REPLACE FUNCTION public.enforce_author_name()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  SELECT username INTO v_name FROM public.user_profiles WHERE user_id = auth.uid();
  NEW.author_name := COALESCE(v_name, 'Learner');
  NEW.user_id := auth.uid();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS enforce_author_name_thread ON public.forum_threads;
CREATE TRIGGER enforce_author_name_thread BEFORE INSERT ON public.forum_threads
  FOR EACH ROW EXECUTE FUNCTION public.enforce_author_name();
DROP TRIGGER IF EXISTS enforce_author_name_answer ON public.forum_answers;
CREATE TRIGGER enforce_author_name_answer BEFORE INSERT ON public.forum_answers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_author_name();
DROP TRIGGER IF EXISTS enforce_author_name_comment ON public.forum_comments;
CREATE TRIGGER enforce_author_name_comment BEFORE INSERT ON public.forum_comments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_author_name();

-- 5. Realtime channel SELECT requires authenticated user
DROP POLICY IF EXISTS "Authenticated only realtime select" ON realtime.messages;
CREATE POLICY "Authenticated only realtime select" ON realtime.messages
  FOR SELECT TO authenticated USING (true);

-- 6. Lock down all SECURITY DEFINER functions in public schema
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC', r.proname, r.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon', r.proname, r.args);
  END LOOP;
END $$;

-- Re-grant authenticated callers
GRANT EXECUTE ON FUNCTION public.award_xp(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.award_battle_xp(integer, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_chest(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_forum_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
