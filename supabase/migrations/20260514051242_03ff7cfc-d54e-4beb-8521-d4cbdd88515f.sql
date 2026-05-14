CREATE OR REPLACE FUNCTION public.get_ghost_session(p_player_rating integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record;
BEGIN
  SELECT bs.id, bs.archetype, bs.won, bs.rating, bs.total_questions,
         bs.correct_answers, bs.best_streak, bs.question_records,
         up.username
    INTO r
    FROM public.battle_sessions bs
    LEFT JOIN public.user_profiles up ON up.user_id = bs.user_id
   WHERE (auth.uid() IS NULL OR bs.user_id <> auth.uid())
     AND abs(bs.rating - p_player_rating) <= 200
   ORDER BY random()
   LIMIT 1;

  IF r.id IS NULL THEN
    SELECT bs.id, bs.archetype, bs.won, bs.rating, bs.total_questions,
           bs.correct_answers, bs.best_streak, bs.question_records,
           up.username
      INTO r
      FROM public.battle_sessions bs
      LEFT JOIN public.user_profiles up ON up.user_id = bs.user_id
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
    'username', r.username
  );
END $function$;