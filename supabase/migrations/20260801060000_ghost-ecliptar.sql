-- Record which Ecliptar a battle was fought with, so ghost replays bring the
-- creature the original player actually used.
--
-- Ghosts previously replayed as an archetype with no Ecliptar: no sprite, and —
-- since ultimates are keyed by Ecliptar slug — no ultimate either. A ghost was
-- therefore strictly weaker than a bot, which had both.
--
-- Existing rows cannot be backfilled: the information was never captured. The
-- client derives a stable stand-in from the archetype for those, so old ghosts
-- are coherent; new ones are faithful.

ALTER TABLE public.battle_sessions
  ADD COLUMN IF NOT EXISTS ecliptar_slug text;

COMMENT ON COLUMN public.battle_sessions.ecliptar_slug IS
  'Ecliptar the player fought with. NULL for sessions recorded before this was captured — clients derive a deterministic stand-in from the archetype in that case.';

-- Recreate the recorder with the new parameter.
--
-- The old 8-argument function must be DROPPED first. `CREATE OR REPLACE` only
-- replaces a function with an identical signature — adding a parameter creates a
-- SECOND overload instead, and PostgREST then cannot choose between
-- `record_battle_session(8 args)` and `record_battle_session(9 args, 1 default)`
-- for an 8-argument call. It fails with "Could not choose the best candidate
-- function", which would silently break battle recording for every client that
-- has not reloaded.
DROP FUNCTION IF EXISTS public.record_battle_session(
  text, boolean, integer, integer, integer, integer, jsonb, text
);

CREATE OR REPLACE FUNCTION public.record_battle_session(
  p_archetype text,
  p_won boolean,
  p_rating integer,
  p_total_questions integer,
  p_correct_answers integer,
  p_best_streak integer,
  p_question_records jsonb,
  p_opponent_type text,
  -- Defaulted so a caller that does not know about Ecliptars still works.
  p_ecliptar_slug text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  INSERT INTO public.battle_sessions (
    user_id, archetype, won, rating, total_questions, correct_answers,
    best_streak, question_records, opponent_type, ecliptar_slug
  ) VALUES (
    v_uid,
    p_archetype,
    coalesce(p_won, false),
    greatest(0, least(coalesce(p_rating, 1000), 4000)),
    greatest(0, least(coalesce(p_total_questions, 0), 500)),
    greatest(0, least(coalesce(p_correct_answers, 0), 500)),
    greatest(0, least(coalesce(p_best_streak, 0), 500)),
    coalesce(p_question_records, '[]'::jsonb),
    coalesce(p_opponent_type, 'bot'),
    p_ecliptar_slug
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Return the slug alongside the rest of the ghost payload.
CREATE OR REPLACE FUNCTION public.get_ghost_session(p_player_rating integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record;
BEGIN
  SELECT id, archetype, won, rating, total_questions, correct_answers,
         best_streak, question_records, ecliptar_slug
    INTO r
    FROM public.battle_sessions
   WHERE auth.uid() IS NULL OR user_id <> auth.uid()
     AND abs(rating - p_player_rating) <= 200
   ORDER BY random()
   LIMIT 1;

  IF r.id IS NULL THEN
    SELECT id, archetype, won, rating, total_questions, correct_answers,
           best_streak, question_records, ecliptar_slug
      INTO r FROM public.battle_sessions
     ORDER BY random() LIMIT 1;
  END IF;

  IF r.id IS NULL THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'id', r.id,
    'archetype', r.archetype,
    'won', r.won,
    'rating', r.rating,
    'total_questions', r.total_questions,
    'correct_answers', r.correct_answers,
    'best_streak', r.best_streak,
    'question_records', r.question_records,
    'ecliptar_slug', r.ecliptar_slug
  );
END $$;

GRANT EXECUTE ON FUNCTION public.record_battle_session(text, boolean, integer, integer, integer, integer, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ghost_session(integer) TO authenticated;
