-- The Wild action was replaced by per-Ecliptar Ultimates, so a turn can now be
-- submitted as 'ultimate'. `submit_pvp_turn_action` validated the action name
-- against a hardcoded four-value list and raised 'Invalid action' otherwise, so
-- without this a live PvP ultimate is rejected by the server.
--
-- 'wild' stays valid: pvp_turn_actions rows from before this change still hold
-- it, and a client that has not reloaded yet would otherwise start failing
-- mid-match. The new value is added, nothing is removed.
--
-- Only the validation line changes; the rest of the body is reproduced verbatim
-- from 20260515002226 because CREATE OR REPLACE FUNCTION needs the whole thing.

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
  IF p_action NOT IN ('attack','defend','charge','ultimate','wild') THEN RAISE EXCEPTION 'Invalid action'; END IF;

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
