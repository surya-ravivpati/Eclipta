-- Mission Control dashboard payload.
--
-- One RPC rather than a dozen client queries. A dashboard that fires twelve
-- requests renders twelve times, each with its own spinner, and the numbers
-- disagree with each other because they were read at twelve different instants.
-- Assembling server-side gives one round trip and one consistent snapshot.
--
-- Everything below reads from tables that already exist. Sections the product
-- brief asked for but which have no data model — seasons, tournaments, calendar
-- assignments and exams, Ecliptar levels and evolutions — are deliberately
-- absent rather than returned as zeroes.

CREATE OR REPLACE FUNCTION public.get_dashboard(p_user uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(

    -- ── Hero: resume, XP, streak ────────────────────────────────────────────
    'profile', coalesce((
      SELECT jsonb_build_object(
               'username', username,
               'xp', xp,
               'daily_streak', daily_streak,
               'best_streak', best_streak,
               'streak_freezes', streak_freezes,
               'last_practice_date', last_practice_date,
               'equipped_ecliptar', equipped_ecliptar)
        FROM public.user_profiles WHERE user_id = p_user), '{}'::jsonb),

    -- The single most recently opened, unfinished course. This is the whole
    -- point of the hero: one button that puts you back where you were.
    'resume', (
      SELECT jsonb_build_object(
               'course_slug', course_slug,
               'course_title', course_title,
               'current_block_id', current_block_id,
               'percent', percent,
               'lessons_done', lessons_done,
               'lessons_total', lessons_total,
               'last_opened_at', last_opened_at)
        FROM public.course_progress
       WHERE user_id = p_user AND completed_at IS NULL
       ORDER BY last_opened_at DESC
       LIMIT 1),

    -- Today's activity, for the goal ring.
    'today', jsonb_build_object(
      'xp', coalesce((SELECT sum(amount) FROM public.xp_award_log
                       WHERE user_id = p_user AND awarded_at::date = current_date), 0),
      'questions', coalesce((SELECT count(*) FROM public.learning_history
                              WHERE user_id = p_user AND created_at::date = current_date), 0),
      'battles', coalesce((SELECT count(*) FROM public.battle_sessions
                            WHERE user_id = p_user AND created_at::date = current_date), 0),
      'practised', EXISTS (SELECT 1 FROM public.learning_history
                            WHERE user_id = p_user AND created_at::date = current_date)),

    -- Last 7 days of XP, for the sparkline.
    'xp_week', coalesce((
      SELECT jsonb_agg(jsonb_build_object('day', d::date, 'xp', coalesce(x.total, 0)) ORDER BY d)
        FROM generate_series(current_date - 6, current_date, interval '1 day') d
        LEFT JOIN (
          SELECT awarded_at::date AS day, sum(amount) AS total
            FROM public.xp_award_log
           WHERE user_id = p_user AND awarded_at >= current_date - 6
           GROUP BY 1) x ON x.day = d::date), '[]'::jsonb),

    -- ── Competitive ─────────────────────────────────────────────────────────
    'rating', coalesce((
      SELECT jsonb_build_object('rating', rating, 'peak_rating', peak_rating,
                                'wins', wins, 'losses', losses)
        FROM public.player_ratings WHERE user_id = p_user), '{}'::jsonb),

    'recent_battles', coalesce((
      SELECT jsonb_agg(b) FROM (
        SELECT id, archetype, won, correct_answers, total_questions,
               rating_delta, opponent_type, created_at
          FROM public.battle_sessions
         WHERE user_id = p_user
         ORDER BY created_at DESC
         LIMIT 5) b), '[]'::jsonb),

    -- ── Ecliptars ───────────────────────────────────────────────────────────
    -- "Most used" is derived from archetype_mastery, since battles are recorded
    -- per archetype rather than per creature.
    'ecliptars_owned', coalesce((
      SELECT count(*) FROM public.user_ecliptars WHERE user_id = p_user), 0),

    'archetype_use', coalesce((
      SELECT jsonb_agg(a ORDER BY (a->>'battles_played')::int DESC) FROM (
        SELECT jsonb_build_object(
                 'archetype', archetype,
                 'battles_played', battles_played,
                 'wins', wins,
                 'total_correct', total_correct,
                 'total_questions', total_questions) AS a
          FROM public.archetype_mastery
         WHERE user_id = p_user AND battles_played > 0) t), '[]'::jsonb),

    -- ── Trophy Road ─────────────────────────────────────────────────────────
    'chests_claimed', coalesce((
      SELECT jsonb_agg(node_id) FROM public.user_chest_claims WHERE user_id = p_user), '[]'::jsonb),

    -- ── Smart insights ──────────────────────────────────────────────────────
    -- Weakest concepts with enough evidence to be worth acting on. A concept
    -- seen once is noise, not a weakness.
    'weakest', coalesce((
      SELECT jsonb_agg(w) FROM (
        SELECT jsonb_build_object('concept', concept, 'subject', subject,
                                  'confidence', round(confidence::numeric, 2)) AS w
          FROM public.concept_mastery
         WHERE user_id = p_user AND evidence_count >= 3
         ORDER BY confidence ASC
         LIMIT 4) t), '[]'::jsonb),

    -- Concepts whose review window has arrived.
    'due_review', coalesce((
      SELECT count(*) FROM public.concept_mastery
       WHERE user_id = p_user AND next_review IS NOT NULL AND next_review <= now()), 0),

    'strongest', coalesce((
      SELECT jsonb_agg(s) FROM (
        SELECT jsonb_build_object('subject', subject,
                                  'confidence', round(avg(confidence)::numeric, 2)) AS s
          FROM public.concept_mastery
         WHERE user_id = p_user
         GROUP BY subject
        HAVING count(*) >= 3
         ORDER BY avg(confidence) DESC
         LIMIT 3) t), '[]'::jsonb),

    -- ── Community ───────────────────────────────────────────────────────────
    'notifications', coalesce((
      SELECT jsonb_agg(n) FROM (
        SELECT id, type, link, meta, read, created_at
          FROM public.notifications
         WHERE user_id = p_user
         ORDER BY created_at DESC
         LIMIT 6) n), '[]'::jsonb),

    'unread_count', coalesce((
      SELECT count(*) FROM public.notifications
       WHERE user_id = p_user AND NOT read), 0),

    -- ── Continue anywhere ───────────────────────────────────────────────────
    'recent_courses', coalesce((
      SELECT jsonb_agg(c) FROM (
        SELECT course_slug, course_title, percent, last_opened_at
          FROM public.course_progress
         WHERE user_id = p_user
         ORDER BY last_opened_at DESC
         LIMIT 4) c), '[]'::jsonb),

    'recent_topics', coalesce((
      SELECT jsonb_agg(DISTINCT t.topic) FROM (
        SELECT topic FROM public.learning_history
         WHERE user_id = p_user AND topic IS NOT NULL
         ORDER BY created_at DESC
         LIMIT 12) t), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.get_dashboard(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_dashboard(uuid) TO authenticated;
