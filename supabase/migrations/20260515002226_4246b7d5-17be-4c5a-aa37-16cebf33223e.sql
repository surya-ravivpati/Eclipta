-- Reliable Live PvP turn resolution, match completion, rematches, and leaderboard backfill

ALTER TABLE public.pvp_battles
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ratings_applied boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS challenger_rating_before integer,
  ADD COLUMN IF NOT EXISTS opponent_rating_before integer,
  ADD COLUMN IF NOT EXISTS challenger_rating_after integer,
  ADD COLUMN IF NOT EXISTS opponent_rating_after integer,
  ADD COLUMN IF NOT EXISTS rematch_requested_by uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS rematch_battle_id uuid;

CREATE INDEX IF NOT EXISTS idx_pvp_battles_status_completed ON public.pvp_battles(status, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_pvp_battles_rematch ON public.pvp_battles(rematch_battle_id) WHERE rematch_battle_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.pvp_turn_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id uuid NOT NULL,
  turn_number integer NOT NULL,
  actor_id uuid NOT NULL,
  action text NOT NULL,
  correct boolean NOT NULL,
  damage integer NOT NULL DEFAULT 0,
  self_damage integer NOT NULL DEFAULT 0,
  heal integer NOT NULL DEFAULT 0,
  focus_delta integer NOT NULL DEFAULT 0,
  momentum integer NOT NULL DEFAULT 0,
  time_spent numeric NOT NULL DEFAULT 0,
  question jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (battle_id, turn_number, actor_id)
);

ALTER TABLE public.pvp_turn_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pvp_turn_actions REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS idx_pvp_turn_actions_battle_turn ON public.pvp_turn_actions(battle_id, turn_number, created_at);

DROP POLICY IF EXISTS "Participants view turn actions" ON public.pvp_turn_actions;
CREATE POLICY "Participants view turn actions"
ON public.pvp_turn_actions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.pvp_battles b
    WHERE b.id = pvp_turn_actions.battle_id
      AND (b.challenger_id = auth.uid() OR b.opponent_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Participants submit own turn actions" ON public.pvp_turn_actions;
CREATE POLICY "Participants submit own turn actions"
ON public.pvp_turn_actions
FOR INSERT
WITH CHECK (
  actor_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.pvp_battles b
    WHERE b.id = battle_id
      AND b.status = 'active'
      AND (b.challenger_id = auth.uid() OR b.opponent_id = auth.uid())
  )
);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.pvp_turn_actions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.pvp_battles;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE public.pvp_battles REPLICA IDENTITY FULL;

CREATE OR REPLACE FUNCTION public.apply_pvp_rating_pair(
  p_challenger_id uuid,
  p_opponent_id uuid,
  p_winner_id uuid
)
RETURNS TABLE(
  challenger_before integer,
  opponent_before integer,
  challenger_after integer,
  opponent_after integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ch_cur integer;
  v_ch_peak integer;
  v_op_cur integer;
  v_op_peak integer;
  v_ch_expected numeric;
  v_op_expected numeric;
  v_ch_score numeric;
  v_op_score numeric;
  v_k constant integer := 24;
  v_ch_delta integer;
  v_op_delta integer;
BEGIN
  IF p_challenger_id IS NULL OR p_opponent_id IS NULL OR p_winner_id IS NULL THEN
    RAISE EXCEPTION 'Missing rating participants';
  END IF;
  IF p_winner_id NOT IN (p_challenger_id, p_opponent_id) THEN
    RAISE EXCEPTION 'Winner must be a battle participant';
  END IF;

  INSERT INTO public.player_ratings(user_id) VALUES (p_challenger_id)
  ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.player_ratings(user_id) VALUES (p_opponent_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT rating, peak_rating INTO v_ch_cur, v_ch_peak
    FROM public.player_ratings WHERE user_id = p_challenger_id FOR UPDATE;
  SELECT rating, peak_rating INTO v_op_cur, v_op_peak
    FROM public.player_ratings WHERE user_id = p_opponent_id FOR UPDATE;

  v_ch_expected := 1.0 / (1.0 + power(10.0, (v_op_cur - v_ch_cur) / 400.0));
  v_op_expected := 1.0 / (1.0 + power(10.0, (v_ch_cur - v_op_cur) / 400.0));
  v_ch_score := CASE WHEN p_winner_id = p_challenger_id THEN 1.0 ELSE 0.0 END;
  v_op_score := CASE WHEN p_winner_id = p_opponent_id THEN 1.0 ELSE 0.0 END;
  v_ch_delta := round(v_k * (v_ch_score - v_ch_expected));
  v_op_delta := round(v_k * (v_op_score - v_op_expected));

  challenger_before := v_ch_cur;
  opponent_before := v_op_cur;
  challenger_after := GREATEST(0, v_ch_cur + v_ch_delta);
  opponent_after := GREATEST(0, v_op_cur + v_op_delta);

  UPDATE public.player_ratings
     SET rating = challenger_after,
         peak_rating = GREATEST(v_ch_peak, challenger_after),
         wins = wins + CASE WHEN p_winner_id = p_challenger_id THEN 1 ELSE 0 END,
         losses = losses + CASE WHEN p_winner_id = p_challenger_id THEN 0 ELSE 1 END,
         updated_at = now()
   WHERE user_id = p_challenger_id;

  UPDATE public.player_ratings
     SET rating = opponent_after,
         peak_rating = GREATEST(v_op_peak, opponent_after),
         wins = wins + CASE WHEN p_winner_id = p_opponent_id THEN 1 ELSE 0 END,
         losses = losses + CASE WHEN p_winner_id = p_opponent_id THEN 0 ELSE 1 END,
         updated_at = now()
   WHERE user_id = p_opponent_id;

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_pvp_battle(p_battle_id uuid, p_winner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_b record;
  v_rating record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_b FROM public.pvp_battles WHERE id = p_battle_id FOR UPDATE;
  IF v_b.id IS NULL THEN RAISE EXCEPTION 'Battle not found'; END IF;
  IF v_uid NOT IN (v_b.challenger_id, v_b.opponent_id) THEN RAISE EXCEPTION 'Not a participant'; END IF;
  IF p_winner_id NOT IN (v_b.challenger_id, v_b.opponent_id) THEN RAISE EXCEPTION 'Winner must be a battle participant'; END IF;

  IF v_b.status = 'completed' AND v_b.winner_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'already_completed', true,
      'winner_id', v_b.winner_id,
      'challenger_rating_after', v_b.challenger_rating_after,
      'opponent_rating_after', v_b.opponent_rating_after
    );
  END IF;

  SELECT * INTO v_rating
  FROM public.apply_pvp_rating_pair(v_b.challenger_id, v_b.opponent_id, p_winner_id);

  UPDATE public.pvp_battles
     SET status = 'completed',
         winner_id = p_winner_id,
         completed_at = now(),
         ratings_applied = true,
         challenger_rating_before = v_rating.challenger_before,
         opponent_rating_before = v_rating.opponent_before,
         challenger_rating_after = v_rating.challenger_after,
         opponent_rating_after = v_rating.opponent_after
   WHERE id = p_battle_id;

  RETURN jsonb_build_object(
    'already_completed', false,
    'winner_id', p_winner_id,
    'challenger_rating_before', v_rating.challenger_before,
    'opponent_rating_before', v_rating.opponent_before,
    'challenger_rating_after', v_rating.challenger_after,
    'opponent_rating_after', v_rating.opponent_after
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_pvp_turn_action(
  p_battle_id uuid,
  p_turn_number integer,
  p_action text,
  p_correct boolean,
  p_damage integer DEFAULT 0,
  p_self_damage integer DEFAULT 0,
  p_heal integer DEFAULT 0,
  p_focus_delta integer DEFAULT 0,
  p_momentum integer DEFAULT 0,
  p_time_spent numeric DEFAULT 0,
  p_question jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_b record;
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_turn_number IS NULL OR p_turn_number < 1 OR p_turn_number > 200 THEN RAISE EXCEPTION 'Invalid turn'; END IF;
  IF p_action NOT IN ('attack','defend','charge','wild') THEN RAISE EXCEPTION 'Invalid action'; END IF;

  SELECT * INTO v_b FROM public.pvp_battles WHERE id = p_battle_id;
  IF v_b.id IS NULL THEN RAISE EXCEPTION 'Battle not found'; END IF;
  IF v_b.status <> 'active' THEN RAISE EXCEPTION 'Battle is not active'; END IF;
  IF v_uid NOT IN (v_b.challenger_id, v_b.opponent_id) THEN RAISE EXCEPTION 'Not a participant'; END IF;

  INSERT INTO public.pvp_turn_actions(
    battle_id, turn_number, actor_id, action, correct, damage, self_damage, heal, focus_delta, momentum, time_spent, question
  ) VALUES (
    p_battle_id, p_turn_number, v_uid, p_action, p_correct,
    GREATEST(0, LEAST(COALESCE(p_damage, 0), 500)),
    GREATEST(0, LEAST(COALESCE(p_self_damage, 0), 500)),
    GREATEST(0, LEAST(COALESCE(p_heal, 0), 500)),
    GREATEST(-500, LEAST(COALESCE(p_focus_delta, 0), 500)),
    GREATEST(0, LEAST(COALESCE(p_momentum, 0), 500)),
    GREATEST(0, LEAST(COALESCE(p_time_spent, 0), 600)),
    COALESCE(p_question, '{}'::jsonb)
  ) ON CONFLICT (battle_id, turn_number, actor_id) DO UPDATE SET
    action = EXCLUDED.action,
    correct = EXCLUDED.correct,
    damage = EXCLUDED.damage,
    self_damage = EXCLUDED.self_damage,
    heal = EXCLUDED.heal,
    focus_delta = EXCLUDED.focus_delta,
    momentum = EXCLUDED.momentum,
    time_spent = EXCLUDED.time_spent,
    question = EXCLUDED.question;

  SELECT count(*) INTO v_count
    FROM public.pvp_turn_actions
   WHERE battle_id = p_battle_id AND turn_number = p_turn_number;

  RETURN jsonb_build_object(
    'ready', v_count >= 2,
    'turn_number', p_turn_number,
    'actions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'actor_id', actor_id,
        'action', action,
        'correct', correct,
        'damage', damage,
        'self_damage', self_damage,
        'heal', heal,
        'focus_delta', focus_delta,
        'momentum', momentum,
        'time_spent', time_spent,
        'question', question
      ) ORDER BY created_at)
      FROM public.pvp_turn_actions
      WHERE battle_id = p_battle_id AND turn_number = p_turn_number
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_pvp_turn_resolution(p_battle_id uuid, p_turn_number integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_b record;
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_turn_number IS NULL OR p_turn_number < 1 OR p_turn_number > 200 THEN RAISE EXCEPTION 'Invalid turn'; END IF;

  SELECT * INTO v_b FROM public.pvp_battles WHERE id = p_battle_id;
  IF v_b.id IS NULL THEN RAISE EXCEPTION 'Battle not found'; END IF;
  IF v_uid NOT IN (v_b.challenger_id, v_b.opponent_id) THEN RAISE EXCEPTION 'Not a participant'; END IF;

  SELECT count(*) INTO v_count FROM public.pvp_turn_actions WHERE battle_id = p_battle_id AND turn_number = p_turn_number;

  RETURN jsonb_build_object(
    'ready', v_count >= 2,
    'turn_number', p_turn_number,
    'actions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'actor_id', actor_id,
        'action', action,
        'correct', correct,
        'damage', damage,
        'self_damage', self_damage,
        'heal', heal,
        'focus_delta', focus_delta,
        'momentum', momentum,
        'time_spent', time_spent,
        'question', question
      ) ORDER BY created_at)
      FROM public.pvp_turn_actions
      WHERE battle_id = p_battle_id AND turn_number = p_turn_number
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.request_pvp_rematch(p_battle_id uuid, p_archetype text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_b record;
  v_new_id uuid;
  v_requests uuid[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_archetype IS NULL OR length(p_archetype) < 2 THEN RAISE EXCEPTION 'Invalid archetype'; END IF;

  SELECT * INTO v_b FROM public.pvp_battles WHERE id = p_battle_id FOR UPDATE;
  IF v_b.id IS NULL THEN RAISE EXCEPTION 'Battle not found'; END IF;
  IF v_uid NOT IN (v_b.challenger_id, v_b.opponent_id) THEN RAISE EXCEPTION 'Not a participant'; END IF;
  IF v_b.status <> 'completed' THEN RAISE EXCEPTION 'Battle must be completed before rematch'; END IF;

  v_requests := array(SELECT DISTINCT unnest(v_b.rematch_requested_by || v_uid));

  IF array_length(v_requests, 1) >= 2 THEN
    IF v_b.rematch_battle_id IS NULL THEN
      v_new_id := gen_random_uuid();
      INSERT INTO public.pvp_battles(id, challenger_id, opponent_id, challenger_archetype, opponent_archetype, status)
      VALUES (
        v_new_id,
        v_b.opponent_id,
        v_b.challenger_id,
        CASE WHEN v_uid = v_b.opponent_id THEN p_archetype ELSE v_b.opponent_archetype END,
        CASE WHEN v_uid = v_b.challenger_id THEN p_archetype ELSE v_b.challenger_archetype END,
        'active'
      );
      UPDATE public.pvp_battles
         SET rematch_requested_by = v_requests,
             rematch_battle_id = v_new_id
       WHERE id = p_battle_id;
    ELSE
      v_new_id := v_b.rematch_battle_id;
      UPDATE public.pvp_battles SET rematch_requested_by = v_requests WHERE id = p_battle_id;
    END IF;

    RETURN jsonb_build_object('ready', true, 'battle_id', v_new_id, 'requests', to_jsonb(v_requests));
  END IF;

  UPDATE public.pvp_battles SET rematch_requested_by = v_requests WHERE id = p_battle_id;
  RETURN jsonb_build_object('ready', false, 'battle_id', NULL, 'requests', to_jsonb(v_requests));
END;
$$;

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

-- Backfill older active battles as completed where both participants have battle history after the match started.
DO $$
DECLARE
  r record;
  v_ch record;
  v_op record;
  v_winner uuid;
  v_rating record;
BEGIN
  FOR r IN
    SELECT * FROM public.pvp_battles
    WHERE status = 'active'
      AND winner_id IS NULL
      AND created_at < now() - interval '10 minutes'
      AND ratings_applied = false
  LOOP
    SELECT * INTO v_ch FROM public.battle_sessions
      WHERE user_id = r.challenger_id AND created_at >= r.created_at
      ORDER BY created_at ASC LIMIT 1;
    SELECT * INTO v_op FROM public.battle_sessions
      WHERE user_id = r.opponent_id AND created_at >= r.created_at
      ORDER BY created_at ASC LIMIT 1;

    IF v_ch.id IS NOT NULL AND v_op.id IS NOT NULL THEN
      IF v_ch.won = true AND v_op.won = false THEN
        v_winner := r.challenger_id;
      ELSIF v_op.won = true AND v_ch.won = false THEN
        v_winner := r.opponent_id;
      ELSIF coalesce(v_ch.correct_answers,0) <> coalesce(v_op.correct_answers,0) THEN
        v_winner := CASE WHEN coalesce(v_ch.correct_answers,0) > coalesce(v_op.correct_answers,0) THEN r.challenger_id ELSE r.opponent_id END;
      ELSE
        v_winner := CASE WHEN coalesce(v_ch.best_streak,0) >= coalesce(v_op.best_streak,0) THEN r.challenger_id ELSE r.opponent_id END;
      END IF;

      SELECT * INTO v_rating FROM public.apply_pvp_rating_pair(r.challenger_id, r.opponent_id, v_winner);
      UPDATE public.pvp_battles
         SET status = 'completed',
             winner_id = v_winner,
             completed_at = greatest(v_ch.created_at, v_op.created_at),
             ratings_applied = true,
             challenger_rating_before = v_rating.challenger_before,
             opponent_rating_before = v_rating.opponent_before,
             challenger_rating_after = v_rating.challenger_after,
             opponent_rating_after = v_rating.opponent_after
       WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.apply_pvp_rating_pair(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_pvp_rating_pair(uuid, uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.complete_pvp_battle(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_pvp_battle(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.submit_pvp_turn_action(uuid, integer, text, boolean, integer, integer, integer, integer, integer, numeric, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_pvp_turn_action(uuid, integer, text, boolean, integer, integer, integer, integer, integer, numeric, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.get_pvp_turn_resolution(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pvp_turn_resolution(uuid, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.request_pvp_rematch(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_pvp_rematch(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pvp_leaderboard(integer) TO anon, authenticated;