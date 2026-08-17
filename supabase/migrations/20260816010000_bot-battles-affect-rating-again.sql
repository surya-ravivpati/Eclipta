-- Bot battles move the ladder again, this time on evidence the server owns.
--
-- History: complete_bot_battle applied a reduced rating change from
-- battle_sessions.won, and 20260808000008 revoked it because `won` is written
-- by the browser - a forged win was a free +6. Revoking closed the hole and
-- also stopped bot play counting for anything, which is not what anyone
-- wanted.
--
-- The fix is to stop asking the client who won. battle_question_challenges
-- already holds the answer to every question the server issued, along with
-- whether the submitted answer was right, so a bot battle's outcome can be
-- recomputed here from rows no client can write.
--
-- Rating moves on accuracy rather than on the HP race. Accuracy is what the
-- server can see, it is the skill the ladder is meant to measure, and the HP
-- layer is the game's presentation of it. A player who answers everything
-- correctly gains the same +6 the old win was worth; one who gets nothing
-- right loses 6, where the old loss was a flat -4.

-- 1. A challenge may only count toward rating once ---------------------------
-- `rewarded_at` already does this for XP. Rating is a separate award, so it
-- needs its own stamp: XP and rating are claimed by different calls and one
-- must not consume the other's evidence.
ALTER TABLE public.battle_question_challenges
  ADD COLUMN IF NOT EXISTS rated_at timestamptz;

-- 2. Apply a bot battle from verified answers --------------------------------
CREATE OR REPLACE FUNCTION public.complete_bot_battle_verified(
  p_session_id    uuid,
  p_challenge_ids uuid[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_session  record;
  v_total    integer;
  v_correct  integer;
  v_accuracy numeric;
  v_won      boolean;
  v_cur      integer;
  v_peak     integer;
  v_delta    integer;
  v_new      integer;
  -- Half of the ranked K-factor (24). Bot play is practice: it should move the
  -- ladder, but never as fast as beating a person does.
  k_bot      constant integer := 12;
  -- Below this many answered questions there is no signal, only variance - and
  -- a one-question "battle" would otherwise be the cheapest rating in the game.
  min_answers constant integer := 3;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF cardinality(p_challenge_ids) IS NULL OR cardinality(p_challenge_ids) > 100 THEN
    RAISE EXCEPTION 'Invalid battle challenges';
  END IF;

  SELECT * INTO v_session
    FROM public.battle_sessions
   WHERE id = p_session_id AND user_id = v_uid
   FOR UPDATE;

  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Battle session not found'; END IF;
  IF v_session.opponent_type <> 'bot' THEN RAISE EXCEPTION 'Not a bot session'; END IF;

  -- Idempotent: replaying the same finished battle returns what it did before.
  IF v_session.rating_applied = true THEN
    RETURN jsonb_build_object(
      'already_completed', true,
      'won',           v_session.won,
      'rating_before', v_session.rating_before,
      'rating_after',  v_session.rating_after,
      'rating_delta',  v_session.rating_delta
    );
  END IF;

  -- Claim the evidence. `battle_id IS NULL` keeps this to non-PvP questions,
  -- and stamping rated_at means the same answers cannot be submitted again
  -- under a second session.
  WITH claimed AS (
    UPDATE public.battle_question_challenges
       SET rated_at = now()
     WHERE id = ANY(p_challenge_ids)
       AND user_id = v_uid
       AND battle_id IS NULL
       AND answered_at IS NOT NULL
       AND rated_at IS NULL
       AND created_at > now() - interval '1 hour'
     RETURNING is_correct
  )
  SELECT count(*)::integer, count(*) FILTER (WHERE is_correct)::integer
    INTO v_total, v_correct
    FROM claimed;

  -- Too little verified play to judge. Close the session so it cannot be
  -- retried with a better set of answers, but leave the ladder alone.
  IF coalesce(v_total, 0) < min_answers THEN
    UPDATE public.battle_sessions
       SET rating_applied = true,
           rating_before  = NULL,
           rating_after   = NULL,
           rating_delta   = 0
     WHERE id = p_session_id;

    RETURN jsonb_build_object(
      'already_completed', false,
      'rated',        false,
      'reason',       'not_enough_verified_answers',
      'rating_delta', 0
    );
  END IF;

  v_accuracy := v_correct::numeric / v_total::numeric;

  -- The server's own verdict on the battle, replacing whatever the client
  -- claimed. 60% is the line between a session that went well and one that
  -- did not; it also decides the W/L record the leaderboard reads.
  v_won := v_accuracy >= 0.6;

  INSERT INTO public.player_ratings(user_id) VALUES (v_uid)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT rating, peak_rating INTO v_cur, v_peak
    FROM public.player_ratings WHERE user_id = v_uid FOR UPDATE;

  -- Centred on 0.5, so perfect play is +6 and a blank sheet is -6, matching
  -- the magnitude the old flat win was worth.
  v_delta := round(k_bot * (v_accuracy - 0.5))::integer;
  v_new   := GREATEST(0, v_cur + v_delta);

  UPDATE public.player_ratings SET
    rating      = v_new,
    peak_rating = GREATEST(v_peak, v_new),
    wins        = wins   + CASE WHEN v_won THEN 1 ELSE 0 END,
    losses      = losses + CASE WHEN v_won THEN 0 ELSE 1 END,
    updated_at  = now()
  WHERE user_id = v_uid;

  UPDATE public.battle_sessions
     SET won            = v_won,
         rating_applied = true,
         rating_before  = v_cur,
         rating_after   = v_new,
         rating_delta   = v_new - v_cur
   WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'already_completed', false,
    'rated',         true,
    'won',           v_won,
    'accuracy',      round(v_accuracy, 3),
    'answered',      v_total,
    'correct',       v_correct,
    'rating_before', v_cur,
    'rating_after',  v_new,
    'rating_delta',  v_new - v_cur
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_bot_battle_verified(uuid, uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.complete_bot_battle_verified(uuid, uuid[]) TO authenticated;

-- The client-trusting version stays revoked. It is left in place so existing
-- rows keep their history, but nothing may call it.
REVOKE ALL ON FUNCTION public.complete_bot_battle(uuid) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
