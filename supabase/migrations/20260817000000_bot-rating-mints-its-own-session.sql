-- The bot-rating path needs a session row that nothing creates any more.
--
-- 20260816010000 added complete_bot_battle_verified(p_session_id, p_challenge_ids):
-- it recomputed the outcome from server-issued questions, which was the right
-- idea, but it still looked up a `battle_sessions` row by id. No such row is
-- ever minted: 20260808000008 revoked `record_battle_session` precisely because
-- a browser-written session is not evidence, and the client has passed a
-- hardcoded `null` session id ever since (KnowledgeBattles.tsx). So the RPC
-- could never have been reached with a valid argument, and the branch calling
-- it was dead.
--
-- The fix is to stop asking for a session and write one. Everything the row
-- needs is already derivable from evidence this function owns:
--
--   won / correct / total  - recomputed from battle_question_challenges
--   rating before/after     - read and written here
--   opponent_type = 'bot'   - implied by which function was called
--
-- A server-written row is durable evidence, which is what the 2026-08-08
-- hardening asked for. It also puts bot results back in front of `player_wl`,
-- since that derivation counts battle_sessions rows with rating_applied = true -
-- so the Trophy Road standing card and the leaderboard start agreeing about bot
-- play again.
--
-- Idempotency no longer needs a flag on the session. `rated_at` on each
-- challenge is the guard: a replayed call claims zero rows, falls under the
-- minimum, and rates nothing.

DROP FUNCTION IF EXISTS public.complete_bot_battle_verified(uuid, uuid[]);

CREATE OR REPLACE FUNCTION public.complete_bot_battle_verified(
  p_challenge_ids uuid[],
  p_archetype     text,
  p_ecliptar_slug text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_total      integer;
  v_correct    integer;
  v_accuracy   numeric;
  v_won        boolean;
  v_cur        integer;
  v_peak       integer;
  v_delta      integer;
  v_new        integer;
  v_session_id uuid;
  -- Half the ranked K-factor (24). Bot play is practice: it should move the
  -- ladder, but never as fast as beating a person does.
  k_bot        constant integer := 12;
  -- Below this many answered questions there is no signal, only variance - and
  -- a one-question "battle" would otherwise be the cheapest rating in the game.
  min_answers  constant integer := 3;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF cardinality(p_challenge_ids) IS NULL OR cardinality(p_challenge_ids) > 100 THEN
    RAISE EXCEPTION 'Invalid battle challenges';
  END IF;
  IF p_archetype IS NULL OR p_archetype !~ '^[a-z]{2,40}$' THEN
    RAISE EXCEPTION 'Invalid archetype';
  END IF;

  -- Claim the evidence. `battle_id IS NULL` keeps this to non-PvP questions,
  -- and stamping rated_at means the same answers cannot be submitted twice.
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

  -- Too little verified play to judge, or a replay of an already-rated battle.
  -- Neither is an error, and neither touches the ladder.
  IF coalesce(v_total, 0) < min_answers THEN
    RETURN jsonb_build_object(
      'rated',        false,
      'reason',       'not_enough_verified_answers',
      'answered',     coalesce(v_total, 0),
      'rating_delta', 0
    );
  END IF;

  v_accuracy := v_correct::numeric / v_total::numeric;

  -- The server's own verdict on the battle. 60% is the line between a session
  -- that went well and one that did not; it also decides the win/loss record
  -- that player_wl derives from the row written below.
  v_won := v_accuracy >= 0.6;

  INSERT INTO public.player_ratings(user_id) VALUES (v_uid)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT rating, peak_rating INTO v_cur, v_peak
    FROM public.player_ratings WHERE user_id = v_uid FOR UPDATE;

  -- Centred on 0.5, so perfect play is +6 and a blank sheet is -6.
  v_delta := round(k_bot * (v_accuracy - 0.5))::integer;
  v_new   := GREATEST(0, v_cur + v_delta);

  UPDATE public.player_ratings SET
    rating      = v_new,
    peak_rating = GREATEST(v_peak, v_new),
    wins        = wins   + CASE WHEN v_won THEN 1 ELSE 0 END,
    losses      = losses + CASE WHEN v_won THEN 0 ELSE 1 END,
    updated_at  = now()
  WHERE user_id = v_uid;

  -- The session row, written from what this function verified rather than from
  -- anything the browser said. rating_applied is true on arrival because the
  -- rating was applied in the same transaction.
  INSERT INTO public.battle_sessions(
    user_id, archetype, ecliptar_slug, opponent_type, won,
    rating, total_questions, correct_answers, best_streak,
    rating_applied, rating_before, rating_after, rating_delta
  ) VALUES (
    v_uid, p_archetype, p_ecliptar_slug, 'bot', v_won,
    v_new, v_total, v_correct, 0,
    true, v_cur, v_new, v_new - v_cur
  )
  RETURNING id INTO v_session_id;

  RETURN jsonb_build_object(
    'rated',         true,
    'session_id',    v_session_id,
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

REVOKE EXECUTE ON FUNCTION public.complete_bot_battle_verified(uuid[], text, text)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.complete_bot_battle_verified(uuid[], text, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
