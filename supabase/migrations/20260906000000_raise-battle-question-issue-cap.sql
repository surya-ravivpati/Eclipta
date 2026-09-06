-- Raise the per-hour cap on issued bot-battle questions.
--
-- `issue_battle_question` throttled bot-battle questions to 50 per rolling
-- hour per user. Every battle turn draws exactly one question, and a single
-- bot battle runs 10-30 turns, so a few battles in an hour cross 50 - and from
-- then on *every* action fails with "Couldn't prepare a secure battle
-- question" until the hour rolls over. A page reload does not help, because the
-- cap is server-side and time-based. For an actively-playing account this reads
-- as the error happening on every attack, always.
--
-- The cap was never what protects XP from farming: award_xp/award_battle_xp
-- enforce their own limits (30 xp_award_log inserts per minute, and
-- LEAST(1000, ...) per battle), and award_verified_battle_xp claims each
-- challenge's reward exactly once via rewarded_at. So this counter only bounds
-- how many challenge rows a user can mint per hour - a storage/DoS guard, not a
-- reward gate. 300/hour keeps that guard (roughly 10-15 full battles an hour)
-- while leaving normal play well clear of it.
--
-- Only the cap constant changes; the rest of the body is reproduced verbatim
-- from 20260808000006_server_authoritative_battle_challenges.sql. CREATE OR
-- REPLACE preserves the existing grants.

CREATE OR REPLACE FUNCTION public.issue_battle_question(
  p_difficulty text,
  p_battle_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_a integer;
  v_b integer;
  v_c integer;
  v_answer integer;
  v_prompt text;
  v_topic text;
  v_options integer[];
  v_challenge_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_difficulty NOT IN ('easy', 'medium', 'hard') THEN RAISE EXCEPTION 'Invalid difficulty'; END IF;
  IF p_battle_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pvp_battles
    WHERE id = p_battle_id
      AND status = 'active'
      AND v_uid IN (challenger_id, opponent_id)
  ) THEN
    RAISE EXCEPTION 'Battle not found';
  END IF;
  IF p_battle_id IS NULL AND 300 <= (
    SELECT count(*) FROM public.battle_question_challenges
    WHERE user_id = v_uid
      AND battle_id IS NULL
      AND created_at > now() - interval '1 hour'
  ) THEN
    RAISE EXCEPTION 'Battle question limit reached; try again later';
  END IF;

  IF p_difficulty = 'easy' THEN
    v_a := 2 + floor(random() * 29)::integer;
    v_b := 2 + floor(random() * 29)::integer;
    IF random() < 0.5 THEN
      v_answer := v_a + v_b;
      v_prompt := format('%s + %s', v_a, v_b);
      v_topic := 'Addition';
    ELSE
      IF v_a < v_b THEN
        v_c := v_a;
        v_a := v_b;
        v_b := v_c;
      END IF;
      v_answer := v_a - v_b;
      v_prompt := format('%s - %s', v_a, v_b);
      v_topic := 'Subtraction';
    END IF;
  ELSIF p_difficulty = 'medium' THEN
    v_a := 3 + floor(random() * 13)::integer;
    v_b := 3 + floor(random() * 10)::integer;
    IF random() < 0.5 THEN
      v_answer := v_a * v_b;
      v_prompt := format('%s * %s', v_a, v_b);
      v_topic := 'Multiplication';
    ELSE
      v_answer := 2 + floor(random() * 14)::integer;
      v_a := v_answer * v_b;
      v_prompt := format('%s / %s', v_a, v_b);
      v_topic := 'Division';
    END IF;
  ELSE
    v_a := 2 + floor(random() * 14)::integer;
    v_b := 2 + floor(random() * 14)::integer;
    v_c := 2 + floor(random() * 7)::integer;
    IF random() < 0.5 THEN
      v_answer := v_a + v_b * v_c;
      v_prompt := format('%s + %s * %s', v_a, v_b, v_c);
      v_topic := 'Order of Operations';
    ELSE
      v_answer := v_a;
      v_prompt := format('x + %s = %s, x = ?', v_b, v_a + v_b);
      v_topic := 'Algebra';
    END IF;
  END IF;

  SELECT array_agg(option_value ORDER BY random())
    INTO v_options
    FROM (
      SELECT DISTINCT option_value
      FROM unnest(ARRAY[
        v_answer,
        v_answer + 1 + floor(random() * greatest(5, abs(v_answer)))::integer,
        v_answer - 1 - floor(random() * greatest(5, abs(v_answer)))::integer,
        v_answer + 2 + floor(random() * greatest(5, abs(v_answer)))::integer,
        v_answer - 2 - floor(random() * greatest(5, abs(v_answer)))::integer
      ]) AS option_value
      LIMIT 4
    ) options;

  WHILE cardinality(v_options) < 4 LOOP
    v_options := array_append(v_options, v_answer + 10 + floor(random() * 100)::integer);
    SELECT array_agg(DISTINCT option_value ORDER BY option_value)
      INTO v_options
      FROM unnest(v_options) AS option_value;
  END LOOP;

  INSERT INTO public.battle_question_challenges (
    user_id, battle_id, prompt, options, answer, topic, difficulty
  ) VALUES (
    v_uid, p_battle_id, v_prompt, v_options, v_answer, v_topic, p_difficulty
  ) RETURNING id INTO v_challenge_id;

  RETURN jsonb_build_object(
    'challenge_id', v_challenge_id,
    'prompt', v_prompt,
    'options', to_jsonb(v_options),
    'topic', v_topic,
    'difficulty', p_difficulty,
    'expires_at', now() + interval '5 minutes'
  );
END;
$$;
