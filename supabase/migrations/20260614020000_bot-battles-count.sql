-- Bots count fully now (product decision): an AI-bot battle grants a *reduced*
-- rating change and counts toward the W/L record — but worth less than ranked
-- (live/ghost) play. Implemented consistently with the truth-derived model:
--   1. complete_bot_battle applies the bot session (idempotent), updating the
--      player_ratings cache (rating + wins/losses) and stamping the session
--      rating_applied = true so it becomes a canonical counted event.
--   2. get_pvp_leaderboard derives W/L from applied bot sessions too, so the
--      board and the cached record agree by construction.

-- ── 1. Apply a bot battle (reduced rating, idempotent via rating_applied) ──
CREATE OR REPLACE FUNCTION public.complete_bot_battle(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_session record;
  v_cur     integer;
  v_peak    integer;
  v_delta   integer;
  v_new     integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_session
    FROM public.battle_sessions
   WHERE id = p_session_id AND user_id = v_uid
   FOR UPDATE;

  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Battle session not found'; END IF;
  IF v_session.opponent_type <> 'bot' THEN RAISE EXCEPTION 'Not a bot session'; END IF;

  IF v_session.rating_applied = true THEN
    RETURN jsonb_build_object(
      'already_completed', true,
      'rating_before', v_session.rating_before,
      'rating_after',  v_session.rating_after,
      'rating_delta',  v_session.rating_delta
    );
  END IF;

  INSERT INTO public.player_ratings(user_id) VALUES (v_uid)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT rating, peak_rating INTO v_cur, v_peak
    FROM public.player_ratings WHERE user_id = v_uid FOR UPDATE;

  -- Reduced magnitude vs ranked ELO (ghost/live K=24): bots are practice that
  -- still nudges the ladder.
  v_delta := CASE WHEN v_session.won THEN 6 ELSE -4 END;
  v_new   := GREATEST(0, v_cur + v_delta);

  UPDATE public.player_ratings SET
    rating      = v_new,
    peak_rating = GREATEST(v_peak, v_new),
    wins        = wins   + CASE WHEN v_session.won THEN 1 ELSE 0 END,
    losses      = losses + CASE WHEN v_session.won THEN 0 ELSE 1 END,
    updated_at  = now()
  WHERE user_id = v_uid;

  UPDATE public.battle_sessions
     SET rating_applied = true,
         rating_before  = v_cur,
         rating_after   = v_new,
         rating_delta   = v_new - v_cur
   WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'already_completed', false,
    'rating_before', v_cur,
    'rating_after',  v_new,
    'rating_delta',  v_new - v_cur
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_bot_battle(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_bot_battle(uuid) TO authenticated;

-- ── 2. Leaderboard W/L now counts applied bot sessions too ────────────────
CREATE OR REPLACE FUNCTION public.get_pvp_leaderboard(p_limit integer DEFAULT 10)
RETURNS TABLE(user_id uuid, username text, rating integer, wins integer, losses integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH live AS (
    SELECT challenger_id AS user_id,
           CASE WHEN winner_id = challenger_id THEN 1 ELSE 0 END AS w,
           CASE WHEN winner_id = challenger_id THEN 0 ELSE 1 END AS l
      FROM public.pvp_battles
     WHERE status = 'completed' AND winner_id IS NOT NULL
    UNION ALL
    SELECT opponent_id,
           CASE WHEN winner_id = opponent_id THEN 1 ELSE 0 END,
           CASE WHEN winner_id = opponent_id THEN 0 ELSE 1 END
      FROM public.pvp_battles
     WHERE status = 'completed' AND winner_id IS NOT NULL
  ),
  sessions AS (
    SELECT user_id,
           CASE WHEN won THEN 1 ELSE 0 END AS w,
           CASE WHEN won THEN 0 ELSE 1 END AS l
      FROM public.battle_sessions
     WHERE opponent_type IN ('ghost', 'bot') AND rating_applied = true
  ),
  stats AS (
    SELECT user_id,
           SUM(w)::integer AS wins,
           SUM(l)::integer AS losses
      FROM (SELECT * FROM live UNION ALL SELECT * FROM sessions) e
     GROUP BY user_id
  )
  SELECT pr.user_id, up.username, pr.rating,
         s.wins, s.losses
    FROM public.player_ratings pr
    JOIN stats s ON s.user_id = pr.user_id
    LEFT JOIN public.user_profiles up ON up.user_id = pr.user_id
   WHERE s.wins + s.losses > 0
   ORDER BY pr.rating DESC, s.wins DESC, s.losses ASC, pr.updated_at ASC
   LIMIT LEAST(GREATEST(coalesce(p_limit, 10), 1), 100);
$$;

REVOKE EXECUTE ON FUNCTION public.get_pvp_leaderboard(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pvp_leaderboard(integer) TO authenticated;
