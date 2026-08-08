CREATE TABLE public.battle_question_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  battle_id uuid REFERENCES public.pvp_battles(id) ON DELETE CASCADE,
  prompt text NOT NULL,
  options integer[] NOT NULL,
  answer integer NOT NULL,
  topic text NOT NULL,
  difficulty text NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '5 minutes',
  answered_at timestamptz,
  is_correct boolean,
  rewarded_at timestamptz,
  CONSTRAINT battle_question_challenges_options_count CHECK (cardinality(options) = 4)
);

CREATE INDEX battle_question_challenges_active_user_idx
  ON public.battle_question_challenges (user_id, expires_at)
  WHERE answered_at IS NULL;

ALTER TABLE public.battle_question_challenges ENABLE ROW LEVEL SECURITY;

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
  IF p_battle_id IS NULL AND 50 <= (
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

CREATE OR REPLACE FUNCTION public.submit_battle_answer(
  p_challenge_id uuid,
  p_answer integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_challenge public.battle_question_challenges;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_challenge
  FROM public.battle_question_challenges
  WHERE id = p_challenge_id
    AND user_id = v_uid
  FOR UPDATE;

  IF v_challenge.id IS NULL THEN RAISE EXCEPTION 'Challenge not found'; END IF;
  IF v_challenge.answered_at IS NOT NULL THEN RAISE EXCEPTION 'Challenge already answered'; END IF;
  IF v_challenge.expires_at <= now() THEN RAISE EXCEPTION 'Challenge expired'; END IF;

  UPDATE public.battle_question_challenges
  SET answered_at = now(), is_correct = p_answer = v_challenge.answer
  WHERE id = v_challenge.id;

  RETURN jsonb_build_object(
    'correct', p_answer = v_challenge.answer,
    'answer', v_challenge.answer,
    'topic', v_challenge.topic,
    'difficulty', v_challenge.difficulty,
    'battle_id', v_challenge.battle_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.award_verified_battle_xp(p_challenge_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_correct integer;
  v_new integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF cardinality(p_challenge_ids) IS NULL OR cardinality(p_challenge_ids) < 1
     OR cardinality(p_challenge_ids) > 50 THEN
    RAISE EXCEPTION 'Invalid battle challenges';
  END IF;

  WITH claimed AS (
    UPDATE public.battle_question_challenges
       SET rewarded_at = now()
     WHERE id = ANY(p_challenge_ids)
       AND user_id = v_uid
       AND battle_id IS NULL
       AND answered_at IS NOT NULL
       AND rewarded_at IS NULL
       AND created_at > now() - interval '1 hour'
     RETURNING is_correct
  )
  SELECT count(*) FILTER (WHERE is_correct) INTO v_correct FROM claimed;

  IF v_correct IS NULL OR v_correct = 0 THEN
    SELECT xp INTO v_new FROM public.user_profiles WHERE user_id = v_uid;
    RETURN coalesce(v_new, 0);
  END IF;

  INSERT INTO public.xp_award_log(user_id, event, amount)
  VALUES (v_uid, 'verified_battle', v_correct * 15);
  UPDATE public.user_profiles
     SET xp = xp + v_correct * 15
   WHERE user_id = v_uid
  RETURNING xp INTO v_new;
  RETURN coalesce(v_new, 0);
END;
$$;

REVOKE ALL ON TABLE public.battle_question_challenges FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.issue_battle_question(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_battle_answer(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.award_verified_battle_xp(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_battle_question(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_battle_answer(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.award_verified_battle_xp(uuid[]) TO authenticated;
