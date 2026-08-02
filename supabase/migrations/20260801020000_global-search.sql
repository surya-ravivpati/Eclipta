-- Global search.
--
-- Search runs in Postgres, not the client. The alternative — fetch rows and
-- fuzzy-match in JS — cannot rank across entity types, cannot use an index, and
-- degrades the moment a table outgrows a page of results. Doing it here gives
-- typo tolerance from pg_trgm, relevance from ts_rank, and one round trip.
--
-- Scope note: this searches the entities that actually exist. Flashcards,
-- quizzes, practice sets, clubs, events, seasons and tournaments have no tables
-- in this schema, so they are deliberately absent rather than stubbed — a filter
-- chip that can never match anything is worse than no chip.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ── Indexes ──────────────────────────────────────────────────────────────────
-- GIN + trigram: supports both prefix ("integrat") and typo ("integrasion")
-- matching on the same index, which a btree or plain tsvector cannot.

CREATE INDEX IF NOT EXISTS idx_forum_threads_title_trgm
  ON public.forum_threads USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_forum_threads_body_trgm
  ON public.forum_threads USING gin (body gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_user_courses_title_trgm
  ON public.user_courses USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_user_courses_summary_trgm
  ON public.user_courses USING gin (summary gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_course_modules_title_trgm
  ON public.course_modules USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_study_rooms_name_trgm
  ON public.study_rooms USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_user_profiles_username_trgm
  ON public.user_profiles USING gin (username gin_trgm_ops);

-- ── Recent searches, synced across devices ───────────────────────────────────
-- Server-side rather than localStorage, because the requirement is that recents
-- follow the user between devices.

CREATE TABLE IF NOT EXISTS public.search_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query text NOT NULL,
  -- What the user opened from this search, when they opened something. A search
  -- that led nowhere is a weaker signal than one that ended in a click.
  chosen_kind text,
  chosen_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- One row per (user, query): re-searching the same thing bumps it rather than
  -- filling the list with duplicates.
  CONSTRAINT search_history_user_query_key UNIQUE (user_id, query)
);

CREATE INDEX IF NOT EXISTS idx_search_history_user_recent
  ON public.search_history (user_id, created_at DESC);

ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own search history" ON public.search_history;
CREATE POLICY "own search history" ON public.search_history
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Trending ─────────────────────────────────────────────────────────────────
-- Aggregate across users, so it needs to bypass the per-user RLS above; hence
-- SECURITY DEFINER with a fixed search_path. Only the query text and a count
-- leave the function — never who searched.

CREATE OR REPLACE FUNCTION public.get_trending_searches(p_limit integer DEFAULT 6)
RETURNS TABLE (query text, hits bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT h.query, count(*) AS hits
    FROM public.search_history h
   WHERE h.created_at > now() - interval '7 days'
     -- A query only trends once several distinct people ran it, so one user
     -- hammering the box cannot manufacture a trend.
   GROUP BY h.query
  HAVING count(DISTINCT h.user_id) >= 3
   ORDER BY hits DESC, h.query
   LIMIT least(greatest(coalesce(p_limit, 6), 1), 20);
$$;

CREATE OR REPLACE FUNCTION public.record_search(
  p_query text,
  p_chosen_kind text DEFAULT NULL,
  p_chosen_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_q text := btrim(p_query);
BEGIN
  IF v_uid IS NULL OR v_q = '' OR length(v_q) > 200 THEN RETURN; END IF;

  INSERT INTO public.search_history (user_id, query, chosen_kind, chosen_id)
  VALUES (v_uid, v_q, p_chosen_kind, p_chosen_id)
  ON CONFLICT (user_id, query) DO UPDATE
     SET created_at = now(),
         -- Keep the previous choice when this pass chose nothing, so an
         -- exploratory re-search does not erase a known-good destination.
         chosen_kind = coalesce(EXCLUDED.chosen_kind, public.search_history.chosen_kind),
         chosen_id   = coalesce(EXCLUDED.chosen_id, public.search_history.chosen_id);

  -- Cap the list. Unbounded history is a slow leak and nobody scrolls it.
  DELETE FROM public.search_history
   WHERE user_id = v_uid
     AND id NOT IN (
       SELECT id FROM public.search_history
        WHERE user_id = v_uid
        ORDER BY created_at DESC
        LIMIT 50
     );
END;
$$;

-- ── The search itself ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.global_search(
  p_query text,
  -- NULL searches everything; otherwise restrict to these kinds.
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
  -- Surfaced so the client can badge a personalised hit ("in your course").
  personal boolean
)
LANGUAGE plpgsql
STABLE
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

  -- Trigram threshold governs typo tolerance. 0.18 is deliberately loose:
  -- "integrasion" should still find "Integration". Precision is recovered by
  -- ranking rather than by refusing to match.
  PERFORM set_limit(0.18);

  RETURN QUERY
  WITH q AS (SELECT lower(unaccent(v_q)) AS needle),

  -- Courses the caller can see: their own, plus anything published.
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

  -- Modules stand in for "lessons"/"topics": they are the titled units inside a
  -- course. course_blocks hold the actual content but are typed JSON with no
  -- reliable title field, so they are not searched directly.
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
             -- A solved, upvoted thread is a better answer than a bare one.
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
             -- People you follow rank above strangers with the same name.
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

  -- "Groups" in the product are study rooms.
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

  -- Battle history is private by nature, so this arm is always personal.
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

  unioned AS (
    SELECT * FROM courses
    UNION ALL SELECT * FROM lessons
    UNION ALL SELECT * FROM threads
    UNION ALL SELECT * FROM people
    UNION ALL SELECT * FROM groups
    UNION ALL SELECT * FROM battles
  )
  SELECT u.kind, u.id, u.title, u.subtitle, u.url, u.score::real, u.personal
    FROM unioned u
   WHERE (v_wants IS NULL OR u.kind = ANY (v_wants))
     AND u.score > 0
   ORDER BY
     -- Personalisation is a tiebreaker on top of relevance, never a substitute:
     -- a weak personal hit must not outrank a strong global one.
     (u.score + CASE WHEN u.personal THEN 0.12 ELSE 0 END) DESC,
     u.title
   LIMIT v_lim;
END;
$$;

REVOKE ALL ON FUNCTION public.global_search(text, text[], integer) FROM public;
GRANT EXECUTE ON FUNCTION public.global_search(text, text[], integer) TO authenticated;
REVOKE ALL ON FUNCTION public.get_trending_searches(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_trending_searches(integer) TO authenticated;
REVOKE ALL ON FUNCTION public.record_search(text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.record_search(text, text, text) TO authenticated;
