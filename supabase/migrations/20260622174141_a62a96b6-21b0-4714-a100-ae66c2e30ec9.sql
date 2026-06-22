
-- 1) battle_sessions: remove direct INSERT policy, add SECURITY DEFINER RPC
DROP POLICY IF EXISTS "Users insert own session" ON public.battle_sessions;

CREATE OR REPLACE FUNCTION public.record_battle_session(
  p_archetype text,
  p_won boolean,
  p_rating integer,
  p_total_questions integer,
  p_correct_answers integer,
  p_best_streak integer,
  p_question_records jsonb,
  p_opponent_type text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id  uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_archetype IS NULL OR length(p_archetype) < 2 OR length(p_archetype) > 40 THEN
    RAISE EXCEPTION 'Invalid archetype';
  END IF;
  IF p_opponent_type IS NULL OR p_opponent_type NOT IN ('live','ghost','bot','unknown') THEN
    RAISE EXCEPTION 'Invalid opponent_type';
  END IF;
  IF p_total_questions IS NULL OR p_total_questions < 0 OR p_total_questions > 200 THEN
    RAISE EXCEPTION 'Invalid total_questions';
  END IF;
  IF p_correct_answers IS NULL OR p_correct_answers < 0 OR p_correct_answers > p_total_questions THEN
    RAISE EXCEPTION 'Invalid correct_answers';
  END IF;

  INSERT INTO public.battle_sessions(
    user_id, archetype, won, rating, total_questions, correct_answers,
    best_streak, question_records, opponent_type
  ) VALUES (
    v_uid, p_archetype, p_won,
    GREATEST(0, LEAST(COALESCE(p_rating, 1000), 5000)),
    p_total_questions, p_correct_answers,
    GREATEST(0, LEAST(COALESCE(p_best_streak, 0), 500)),
    COALESCE(p_question_records, '[]'::jsonb),
    p_opponent_type
  ) RETURNING id INTO v_id;

  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.record_battle_session(text,boolean,integer,integer,integer,integer,jsonb,text) TO authenticated;

-- 2) daily_challenge_progress: remove direct INSERT/UPDATE policies, add RPCs
DROP POLICY IF EXISTS "Users insert own challenge" ON public.daily_challenge_progress;
DROP POLICY IF EXISTS "Users update own challenge" ON public.daily_challenge_progress;

CREATE OR REPLACE FUNCTION public.increment_daily_challenge_win()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'utc')::date;
  v_wins integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.daily_challenge_progress(user_id, challenge_date, wins, bonus_claimed)
  VALUES (v_uid, v_today, 1, false)
  ON CONFLICT (user_id, challenge_date) DO UPDATE SET
    wins = LEAST(public.daily_challenge_progress.wins + 1, 1000),
    updated_at = now()
  RETURNING wins INTO v_wins;
  RETURN v_wins;
END $$;
GRANT EXECUTE ON FUNCTION public.increment_daily_challenge_win() TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_daily_challenge_bonus(p_required_wins integer)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'utc')::date;
  v_updated integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_required_wins IS NULL OR p_required_wins < 1 OR p_required_wins > 100 THEN
    RAISE EXCEPTION 'Invalid required_wins';
  END IF;
  UPDATE public.daily_challenge_progress
     SET bonus_claimed = true, updated_at = now()
   WHERE user_id = v_uid
     AND challenge_date = v_today
     AND bonus_claimed = false
     AND wins >= p_required_wins;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END $$;
GRANT EXECUTE ON FUNCTION public.claim_daily_challenge_bonus(integer) TO authenticated;

-- 3) learning_history: remove direct INSERT policy, add RPC
DROP POLICY IF EXISTS "Users can insert their own history" ON public.learning_history;

-- Expand check constraint to match values actually used by the app
ALTER TABLE public.learning_history DROP CONSTRAINT IF EXISTS learning_history_session_type_check;
ALTER TABLE public.learning_history ADD CONSTRAINT learning_history_session_type_check
  CHECK (session_type = ANY (ARRAY['chat','battle','test','course','luna-session','adaptive_test']));

CREATE OR REPLACE FUNCTION public.log_learning_history(
  p_session_type text,
  p_topic text,
  p_question_text text,
  p_was_correct boolean,
  p_response_time_ms integer,
  p_hint_level_used integer,
  p_luna_summary text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_recent integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_session_type IS NULL OR p_session_type NOT IN ('chat','battle','test','course','luna-session','adaptive_test') THEN
    RAISE EXCEPTION 'Invalid session_type';
  END IF;
  -- Basic anti-abuse: cap how many history rows can land per user per minute
  SELECT COUNT(*) INTO v_recent FROM public.learning_history
   WHERE user_id = v_uid AND created_at > now() - interval '1 minute';
  IF v_recent >= 60 THEN RETURN; END IF;

  INSERT INTO public.learning_history(
    user_id, session_type, topic, question_text, was_correct,
    response_time_ms, hint_level_used, luna_summary
  ) VALUES (
    v_uid, p_session_type,
    NULLIF(left(COALESCE(p_topic, ''), 200), ''),
    NULLIF(left(COALESCE(p_question_text, ''), 1000), ''),
    p_was_correct,
    CASE WHEN p_response_time_ms IS NULL THEN NULL
         ELSE GREATEST(0, LEAST(p_response_time_ms, 600000)) END,
    GREATEST(0, LEAST(COALESCE(p_hint_level_used, 0), 10)),
    NULLIF(left(COALESCE(p_luna_summary, ''), 500), '')
  );
END $$;
GRANT EXECUTE ON FUNCTION public.log_learning_history(text,text,text,boolean,integer,integer,text) TO authenticated;

-- 4) pvp_challenges: remove broad participant UPDATE (transitions already go through respond_pvp_challenge / create_pvp_challenge / request_pvp_rematch SECURITY DEFINER RPCs)
DROP POLICY IF EXISTS "Participants update challenges" ON public.pvp_challenges;

-- 5) pvp_queue: restrict SELECT to own row (matchmaking uses find_pvp_match RPC server-side)
DROP POLICY IF EXISTS "Auth users see queue" ON public.pvp_queue;
CREATE POLICY "Users see own queue entry"
  ON public.pvp_queue FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 6) user_ecliptars: remove direct INSERT policy (claim_ecliptar RPC is the only valid path)
DROP POLICY IF EXISTS "Users can insert own ecliptars" ON public.user_ecliptars;
