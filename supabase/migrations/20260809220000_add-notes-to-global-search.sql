-- Fix: global_search has shipped a "note" kind in its return type and the
-- client (src/lib/search/query.ts, GlobalSearch.tsx) has offered it as a
-- filter chip and inferred it from phrasing ("luna chat about X", "ai
-- explained X") since search launched — but the function's UNION never
-- actually included an arm for it. Filtering by "note", or typing a phrase
-- that infers it, always returned zero results. Add the missing arm,
-- backed by learning_history (Luna's chat/topic log), scoped to the caller.
CREATE OR REPLACE FUNCTION public.global_search(
  p_query text,
  p_kinds text[] DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  kind text,
  id text,
  title text,
  subtitle text,
  url text,
  score real,
  personal boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_q text := btrim(p_query);
  v_lim integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_wants text[] := p_kinds;
BEGIN
  IF v_q = '' OR length(v_q) < 2 THEN RETURN; END IF;

  PERFORM set_limit(0.18);

  RETURN QUERY
  WITH q AS (SELECT lower(unaccent(v_q)) AS needle),

  courses AS (
    SELECT 'course'::text AS kind,
           c.id::text,
           c.title,
           coalesce(c.summary, c.level) AS subtitle,
           '/courses/' || c.slug AS url,
           similarity(lower(unaccent(c.title)), (SELECT needle FROM q)) * 1.0
             + similarity(lower(unaccent(coalesce(c.summary, ''))), (SELECT needle FROM q)) * 0.35
             AS score,
           (c.user_id = v_uid) AS personal
      FROM public.user_courses c
     WHERE (c.user_id = v_uid OR c.status = 'published')
       AND (lower(unaccent(c.title)) % (SELECT needle FROM q)
            OR lower(unaccent(c.title)) ILIKE '%' || (SELECT needle FROM q) || '%'
            OR lower(unaccent(coalesce(c.summary, ''))) % (SELECT needle FROM q))
  ),

  lessons AS (
    SELECT 'lesson'::text AS kind,
           m.id::text,
           m.title,
           c.title AS subtitle,
           '/courses/' || c.slug AS url,
           similarity(lower(unaccent(m.title)), (SELECT needle FROM q)) AS score,
           (c.user_id = v_uid) AS personal
      FROM public.course_modules m
      JOIN public.user_courses c ON c.id = m.course_id
     WHERE (c.user_id = v_uid OR c.status = 'published')
       AND (lower(unaccent(m.title)) % (SELECT needle FROM q)
            OR lower(unaccent(m.title)) ILIKE '%' || (SELECT needle FROM q) || '%')
  ),

  threads AS (
    SELECT 'thread'::text AS kind,
           t.id::text,
           t.title,
           t.author_name AS subtitle,
           '/forum/' || t.id::text AS url,
           similarity(lower(unaccent(t.title)), (SELECT needle FROM q)) * 1.0
             + similarity(lower(unaccent(t.body)), (SELECT needle FROM q)) * 0.25
             + least(t.votes, 20) * 0.01
             + CASE WHEN t.solved THEN 0.06 ELSE 0 END
             AS score,
           (t.user_id = v_uid) AS personal
      FROM public.forum_threads t
     WHERE t.hidden_at IS NULL
       AND t.moderation_status <> 'blocked'
       AND (lower(unaccent(t.title)) % (SELECT needle FROM q)
            OR lower(unaccent(t.title)) ILIKE '%' || (SELECT needle FROM q) || '%'
            OR lower(unaccent(t.body)) ILIKE '%' || (SELECT needle FROM q) || '%'
            OR (SELECT needle FROM q) = ANY (SELECT lower(tag) FROM unnest(t.tags) AS tag))
  ),

  people AS (
    SELECT 'user'::text AS kind,
           p.user_id::text,
           p.username AS title,
           NULL::text AS subtitle,
           '/u/' || p.username AS url,
           similarity(lower(unaccent(p.username)), (SELECT needle FROM q))
             + CASE WHEN EXISTS (
                 SELECT 1 FROM public.user_follows f
                  WHERE f.follower_id = v_uid AND f.following_id = p.user_id
               ) THEN 0.30 ELSE 0 END
             AS score,
           EXISTS (
             SELECT 1 FROM public.user_follows f
              WHERE f.follower_id = v_uid AND f.following_id = p.user_id
           ) AS personal
      FROM public.user_profiles p
     WHERE p.username IS NOT NULL
       AND (lower(unaccent(p.username)) % (SELECT needle FROM q)
            OR lower(unaccent(p.username)) ILIKE (SELECT needle FROM q) || '%')
  ),

  groups AS (
    SELECT 'group'::text AS kind,
           r.id::text,
           r.name AS title,
           coalesce(r.topic, r.goal_text) AS subtitle,
           '/groups/' || r.id::text AS url,
           similarity(lower(unaccent(r.name)), (SELECT needle FROM q)) * 1.0
             + similarity(lower(unaccent(coalesce(r.topic, ''))), (SELECT needle FROM q)) * 0.5
             AS score,
           EXISTS (
             SELECT 1 FROM public.study_room_members m
              WHERE m.room_id = r.id AND m.user_id = v_uid
           ) AS personal
      FROM public.study_rooms r
     WHERE (r.is_public OR EXISTS (
             SELECT 1 FROM public.study_room_members m
              WHERE m.room_id = r.id AND m.user_id = v_uid))
       AND (lower(unaccent(r.name)) % (SELECT needle FROM q)
            OR lower(unaccent(r.name)) ILIKE '%' || (SELECT needle FROM q) || '%'
            OR lower(unaccent(coalesce(r.topic, ''))) % (SELECT needle FROM q))
  ),

  battles AS (
    SELECT 'battle'::text AS kind,
           b.id::text,
           b.archetype || ' · ' || CASE WHEN b.won THEN 'win' ELSE 'loss' END AS title,
           b.correct_answers::text || '/' || b.total_questions::text || ' correct' AS subtitle,
           '/battles' AS url,
           similarity(lower(b.archetype), (SELECT needle FROM q)) AS score,
           true AS personal
      FROM public.battle_sessions b
     WHERE b.user_id = v_uid
       AND lower(b.archetype) % (SELECT needle FROM q)
  ),

  -- Luna chat/topic history — always personal, always the caller's own.
  notes AS (
    SELECT 'note'::text AS kind,
           h.id::text,
           coalesce(h.topic, 'Luna chat') AS title,
           h.luna_summary AS subtitle,
           '/luna' AS url,
           similarity(lower(unaccent(coalesce(h.topic, ''))), (SELECT needle FROM q)) * 1.0
             + similarity(lower(unaccent(coalesce(h.luna_summary, ''))), (SELECT needle FROM q)) * 0.6
             AS score,
           true AS personal
      FROM public.learning_history h
     WHERE h.user_id = v_uid
       AND h.session_type IN ('chat', 'luna-session')
       AND (h.topic IS NOT NULL OR h.luna_summary IS NOT NULL)
       AND (lower(unaccent(coalesce(h.topic, ''))) % (SELECT needle FROM q)
            OR lower(unaccent(coalesce(h.topic, ''))) ILIKE '%' || (SELECT needle FROM q) || '%'
            OR lower(unaccent(coalesce(h.luna_summary, ''))) ILIKE '%' || (SELECT needle FROM q) || '%')
  ),

  unioned AS (
    SELECT * FROM courses
    UNION ALL SELECT * FROM lessons
    UNION ALL SELECT * FROM threads
    UNION ALL SELECT * FROM people
    UNION ALL SELECT * FROM groups
    UNION ALL SELECT * FROM battles
    UNION ALL SELECT * FROM notes
  )
  SELECT u.kind, u.id, u.title, u.subtitle, u.url, u.score::real, u.personal
    FROM unioned u
   WHERE (v_wants IS NULL OR u.kind = ANY (v_wants))
     AND u.score > 0
   ORDER BY
     (u.score + CASE WHEN u.personal THEN 0.12 ELSE 0 END) DESC,
     u.title
   LIMIT v_lim;
END;
$$;

REVOKE ALL ON FUNCTION public.global_search(text, text[], integer) FROM public;
GRANT EXECUTE ON FUNCTION public.global_search(text, text[], integer) TO authenticated;
