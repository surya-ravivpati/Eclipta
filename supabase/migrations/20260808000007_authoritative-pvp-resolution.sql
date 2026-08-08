CREATE TABLE public.pvp_battle_state (
  battle_id uuid PRIMARY KEY REFERENCES public.pvp_battles(id) ON DELETE CASCADE,
  challenger_hp integer NOT NULL,
  opponent_hp integer NOT NULL,
  winner_id uuid,
  resolved_turn integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pvp_battle_state ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.pvp_max_hp(p_archetype text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_archetype
    WHEN 'tank' THEN 220 WHEN 'speedster' THEN 130 WHEN 'chud' THEN 95
    WHEN 'gambler' THEN 155 WHEN 'healer' THEN 145 WHEN 'fulcrum' THEN 165
    WHEN 'accelerator' THEN 165 WHEN 'god' THEN 180 ELSE 150 END;
$$;

CREATE OR REPLACE FUNCTION public.pvp_base_damage(p_archetype text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_archetype
    WHEN 'tank' THEN 11 WHEN 'speedster' THEN 16 WHEN 'chud' THEN 34
    WHEN 'gambler' THEN 25 WHEN 'healer' THEN 14 WHEN 'fulcrum' THEN 18
    WHEN 'accelerator' THEN 14 WHEN 'god' THEN 24 ELSE 15 END;
$$;

CREATE OR REPLACE FUNCTION public.pvp_defend_heal(p_archetype text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_archetype
    WHEN 'tank' THEN 0 WHEN 'speedster' THEN 10 WHEN 'chud' THEN 10
    WHEN 'gambler' THEN 15 WHEN 'healer' THEN 24 WHEN 'fulcrum' THEN 16
    WHEN 'accelerator' THEN 18 WHEN 'god' THEN 12 ELSE 10 END;
$$;

CREATE OR REPLACE FUNCTION public.submit_authoritative_pvp_turn_action(
  p_battle_id uuid,
  p_turn_number integer,
  p_action text,
  p_challenge_id uuid,
  p_answer integer,
  p_time_spent numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_b public.pvp_battles;
  v_challenge public.battle_question_challenges;
  v_correct boolean;
  v_actor_archetype text;
  v_damage integer := 0;
  v_self_damage integer := 0;
  v_heal integer := 0;
  v_focus_delta integer := 0;
  v_count integer;
  v_ch_action public.pvp_turn_actions;
  v_op_action public.pvp_turn_actions;
  v_state public.pvp_battle_state;
  v_challenger_hp integer;
  v_opponent_hp integer;
  v_winner uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_turn_number IS NULL OR p_turn_number < 1 OR p_turn_number > 200 THEN RAISE EXCEPTION 'Invalid turn'; END IF;
  IF p_action NOT IN ('attack', 'defend', 'charge', 'ultimate') THEN RAISE EXCEPTION 'Invalid action'; END IF;

  SELECT * INTO v_b FROM public.pvp_battles WHERE id = p_battle_id FOR UPDATE;
  IF v_b.id IS NULL OR v_b.status <> 'active' THEN RAISE EXCEPTION 'Battle not active'; END IF;
  IF v_uid NOT IN (v_b.challenger_id, v_b.opponent_id) THEN RAISE EXCEPTION 'Not a participant'; END IF;

  SELECT * INTO v_challenge
  FROM public.battle_question_challenges
  WHERE id = p_challenge_id
    AND user_id = v_uid
    AND battle_id = p_battle_id
  FOR UPDATE;
  IF v_challenge.id IS NULL OR v_challenge.answered_at IS NOT NULL OR v_challenge.expires_at <= now() THEN
    RAISE EXCEPTION 'Invalid battle challenge';
  END IF;

  v_correct := p_answer = v_challenge.answer;
  UPDATE public.battle_question_challenges SET answered_at = now() WHERE id = v_challenge.id;

  v_actor_archetype := CASE WHEN v_uid = v_b.challenger_id THEN v_b.challenger_archetype ELSE v_b.opponent_archetype END;
  IF v_correct THEN
    v_focus_delta := CASE p_action WHEN 'attack' THEN 10 WHEN 'defend' THEN 15 WHEN 'charge' THEN 20 ELSE 0 END;
    IF p_action = 'defend' THEN
      v_heal := public.pvp_defend_heal(v_actor_archetype);
    ELSE
      v_damage := public.pvp_base_damage(v_actor_archetype) * CASE p_action WHEN 'charge' THEN 2 WHEN 'ultimate' THEN 3 ELSE 1 END;
    END IF;
  ELSE
    v_self_damage := 10;
  END IF;

  INSERT INTO public.pvp_turn_actions (
    battle_id, turn_number, actor_id, action, correct, damage, self_damage, heal, focus_delta, momentum, time_spent,
    question
  ) VALUES (
    p_battle_id, p_turn_number, v_uid, p_action, v_correct, v_damage, v_self_damage, v_heal, v_focus_delta,
    0, greatest(0, least(coalesce(p_time_spent, 0), 600)),
    jsonb_build_object('challenge_id', p_challenge_id, 'topic', v_challenge.topic, 'difficulty', v_challenge.difficulty)
  );

  INSERT INTO public.pvp_battle_state (battle_id, challenger_hp, opponent_hp)
  VALUES (p_battle_id, public.pvp_max_hp(v_b.challenger_archetype), public.pvp_max_hp(v_b.opponent_archetype))
  ON CONFLICT (battle_id) DO NOTHING;

  SELECT count(*) INTO v_count FROM public.pvp_turn_actions WHERE battle_id = p_battle_id AND turn_number = p_turn_number;
  IF v_count = 2 THEN
    SELECT * INTO v_ch_action FROM public.pvp_turn_actions
      WHERE battle_id = p_battle_id AND turn_number = p_turn_number AND actor_id = v_b.challenger_id;
    SELECT * INTO v_op_action FROM public.pvp_turn_actions
      WHERE battle_id = p_battle_id AND turn_number = p_turn_number AND actor_id = v_b.opponent_id;
    SELECT * INTO v_state FROM public.pvp_battle_state WHERE battle_id = p_battle_id FOR UPDATE;

    v_challenger_hp := greatest(0, least(public.pvp_max_hp(v_b.challenger_archetype), v_state.challenger_hp - v_op_action.damage - v_ch_action.self_damage + v_ch_action.heal));
    v_opponent_hp := greatest(0, least(public.pvp_max_hp(v_b.opponent_archetype), v_state.opponent_hp - v_ch_action.damage - v_op_action.self_damage + v_op_action.heal));
    v_winner := CASE
      WHEN v_challenger_hp <= 0 AND v_opponent_hp <= 0 THEN CASE WHEN v_ch_action.correct THEN v_b.challenger_id ELSE v_b.opponent_id END
      WHEN v_challenger_hp <= 0 THEN v_b.opponent_id
      WHEN v_opponent_hp <= 0 THEN v_b.challenger_id
      ELSE NULL
    END;

    UPDATE public.pvp_battle_state
      SET challenger_hp = v_challenger_hp,
          opponent_hp = v_opponent_hp,
          winner_id = v_winner,
          resolved_turn = p_turn_number,
          updated_at = now()
      WHERE battle_id = p_battle_id;
  END IF;

  RETURN public.get_pvp_turn_resolution(p_battle_id, p_turn_number);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_authoritative_pvp_battle(p_battle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_b public.pvp_battles;
  v_winner uuid;
  v_rating record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_b FROM public.pvp_battles WHERE id = p_battle_id FOR UPDATE;
  IF v_b.id IS NULL OR v_uid NOT IN (v_b.challenger_id, v_b.opponent_id) THEN RAISE EXCEPTION 'Battle not found'; END IF;
  IF v_b.status = 'completed' THEN RETURN jsonb_build_object('already_completed', true, 'winner_id', v_b.winner_id); END IF;
  SELECT winner_id INTO v_winner FROM public.pvp_battle_state WHERE battle_id = p_battle_id;
  IF v_winner IS NULL THEN RAISE EXCEPTION 'Battle has not reached a server-authoritative outcome'; END IF;

  SELECT * INTO v_rating FROM public.apply_pvp_rating_pair(v_b.challenger_id, v_b.opponent_id, v_winner);
  UPDATE public.pvp_battles SET status = 'completed', winner_id = v_winner, completed_at = now(), ratings_applied = true,
    challenger_rating_before = v_rating.challenger_before, opponent_rating_before = v_rating.opponent_before,
    challenger_rating_after = v_rating.challenger_after, opponent_rating_after = v_rating.opponent_after
  WHERE id = p_battle_id;
  RETURN jsonb_build_object('already_completed', false, 'winner_id', v_winner,
    'challenger_rating_before', v_rating.challenger_before, 'opponent_rating_before', v_rating.opponent_before,
    'challenger_rating_after', v_rating.challenger_after, 'opponent_rating_after', v_rating.opponent_after);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_pvp_turn_action(uuid, integer, text, boolean, integer, integer, integer, integer, integer, numeric, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_pvp_battle(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_pvp_rating_pair(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pvp_max_hp(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pvp_base_damage(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pvp_defend_heal(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_authoritative_pvp_turn_action(uuid, integer, text, uuid, integer, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_authoritative_pvp_battle(uuid) TO authenticated;
