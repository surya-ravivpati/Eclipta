ALTER TABLE public.battle_sessions
  ADD COLUMN IF NOT EXISTS opponent_type text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS rating_applied boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rating_before integer,
  ADD COLUMN IF NOT EXISTS rating_after integer,
  ADD COLUMN IF NOT EXISTS rating_delta integer;

CREATE INDEX IF NOT EXISTS idx_battle_sessions_user_rating_applied
  ON public.battle_sessions(user_id, rating_applied, created_at DESC);

CREATE OR REPLACE FUNCTION public.complete_ghost_battle(
  p_session_id uuid,
  p_opponent_rating integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_session record;
  v_cur integer;
  v_peak integer;
  v_expected numeric;
  v_score numeric;
  v_k constant integer := 24;
  v_delta integer;
  v_new integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_opponent_rating IS NULL OR p_opponent_rating < 0 OR p_opponent_rating > 5000 THEN
    RAISE EXCEPTION 'Invalid opponent rating';
  END IF;

  SELECT * INTO v_session
    FROM public.battle_sessions
   WHERE id = p_session_id AND user_id = v_uid
   FOR UPDATE;

  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Battle session not found'; END IF;
  IF v_session.opponent_type <> 'ghost' THEN RAISE EXCEPTION 'Only Ghost PvP sessions affect rating here'; END IF;

  IF v_session.rating_applied = true THEN
    RETURN jsonb_build_object(
      'already_completed', true,
      'rating_before', v_session.rating_before,
      'rating_after', v_session.rating_after,
      'rating_delta', v_session.rating_delta
    );
  END IF;

  INSERT INTO public.player_ratings(user_id) VALUES (v_uid)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT rating, peak_rating INTO v_cur, v_peak
    FROM public.player_ratings
   WHERE user_id = v_uid
   FOR UPDATE;

  v_expected := 1.0 / (1.0 + power(10.0, (p_opponent_rating - v_cur) / 400.0));
  v_score := CASE WHEN v_session.won THEN 1.0 ELSE 0.0 END;
  v_delta := round(v_k * (v_score - v_expected));
  v_new := GREATEST(0, v_cur + v_delta);

  UPDATE public.player_ratings
     SET rating = v_new,
         peak_rating = GREATEST(v_peak, v_new),
         wins = wins + CASE WHEN v_session.won THEN 1 ELSE 0 END,
         losses = losses + CASE WHEN v_session.won THEN 0 ELSE 1 END,
         updated_at = now()
   WHERE user_id = v_uid;

  UPDATE public.battle_sessions
     SET rating_applied = true,
         rating_before = v_cur,
         rating_after = v_new,
         rating_delta = v_new - v_cur
   WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'already_completed', false,
    'rating_before', v_cur,
    'rating_after', v_new,
    'rating_delta', v_new - v_cur
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_ghost_battle(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_ghost_battle(uuid, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.apply_pvp_rating_pair(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_pvp_rating(integer, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_pvp_leaderboard(p_limit integer DEFAULT 10)
RETURNS TABLE(user_id uuid, username text, rating integer, wins integer, losses integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pr.user_id, up.username, pr.rating, pr.wins, pr.losses
    FROM public.player_ratings pr
    LEFT JOIN public.user_profiles up ON up.user_id = pr.user_id
   WHERE pr.wins + pr.losses > 0
   ORDER BY pr.rating DESC, pr.wins DESC, pr.losses ASC, pr.updated_at ASC
   LIMIT LEAST(GREATEST(coalesce(p_limit, 10), 1), 100);
$$;

GRANT EXECUTE ON FUNCTION public.get_pvp_leaderboard(integer) TO anon, authenticated;