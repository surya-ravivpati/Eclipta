-- Pressure Mode: exam / interview / rapid-fire practice under realistic stress.
--
-- Two design commitments are enforced here rather than left to the client:
--
--  1. Cosmetics only. `pressure_rewards` has no stat column and no link to any
--     battle or course table, so there is no schema-level path by which a reward
--     could ever affect outcomes. "No pay-to-win" is a structural guarantee, not
--     a promise someone has to remember.
--  2. Integrity signals are observations, never accusations. focus_lost and
--     fullscreen_exit counts are stored so the learner can see their own
--     conditions in the review; nothing derives a penalty from them, and the
--     score column is computed from performance alone.

CREATE TYPE public.pressure_format AS ENUM ('exam', 'interview', 'rapid');

CREATE TABLE IF NOT EXISTS public.pressure_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  format public.pressure_format NOT NULL,
  subject text,
  -- Configured length and the actual elapsed time, which differ when a learner
  -- submits early or abandons.
  duration_seconds integer NOT NULL,
  elapsed_seconds integer,
  question_count integer NOT NULL DEFAULT 0,
  answered_count integer NOT NULL DEFAULT 0,
  correct_count integer NOT NULL DEFAULT 0,

  -- Score and its components, stored rather than recomputed so a later change to
  -- the weighting cannot silently rewrite a learner's history.
  score smallint CHECK (score BETWEEN 0 AND 100),
  accuracy_score smallint,
  speed_score smallint,
  composure_score smallint,
  calibration_score smallint,
  consistency_score smallint,

  -- Observations only. No penalty is computed from these.
  focus_lost_count integer NOT NULL DEFAULT 0,
  fullscreen_exit_count integer NOT NULL DEFAULT 0,
  hidden_seconds integer NOT NULL DEFAULT 0,

  distractions text[] NOT NULL DEFAULT '{}',
  -- Set when the strain heuristic fired, so support can lead the review.
  strain_detected boolean NOT NULL DEFAULT false,
  -- Full item and event log, for the replay and heatmap.
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  events jsonb NOT NULL DEFAULT '[]'::jsonb,

  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'abandoned')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_pressure_sessions_user
  ON public.pressure_sessions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pressure_sessions_leaderboard
  ON public.pressure_sessions (format, score DESC) WHERE status = 'completed';

ALTER TABLE public.pressure_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own pressure sessions" ON public.pressure_sessions;
CREATE POLICY "own pressure sessions" ON public.pressure_sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Rating ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pressure_ratings (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  format public.pressure_format NOT NULL,
  rating integer NOT NULL DEFAULT 1000,
  peak_rating integer NOT NULL DEFAULT 1000,
  sessions_played integer NOT NULL DEFAULT 0,
  best_score smallint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, format)
);

ALTER TABLE public.pressure_ratings ENABLE ROW LEVEL SECURITY;

-- Ratings are public: a leaderboard needs to read other people's.
DROP POLICY IF EXISTS "pressure ratings readable" ON public.pressure_ratings;
CREATE POLICY "pressure ratings readable" ON public.pressure_ratings
  FOR SELECT USING (true);

-- ── Cosmetic rewards ─────────────────────────────────────────────────────────
-- No stat columns, by construction. Adding one would need a migration, which is
-- a review checkpoint — exactly the friction that keeps this cosmetic.

CREATE TABLE IF NOT EXISTS public.pressure_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('badge', 'frame', 'title', 'theme')),
  season text,
  earned_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pressure_rewards_user_slug_key UNIQUE (user_id, slug)
);

ALTER TABLE public.pressure_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rewards readable" ON public.pressure_rewards;
CREATE POLICY "rewards readable" ON public.pressure_rewards
  FOR SELECT USING (true);

-- ── Completion ───────────────────────────────────────────────────────────────

/**
 * Finalise a session and apply the rating change.
 *
 * SECURITY DEFINER so the rating update cannot be forged from the client: the
 * caller supplies the measured score, but the *rating arithmetic* happens here.
 * A client that lies about its score is a separate problem (the item log is
 * stored, so it is auditable), but it cannot at least invent a rating jump.
 */
CREATE OR REPLACE FUNCTION public.complete_pressure_session(
  p_session uuid,
  p_score smallint,
  p_sub jsonb,
  p_items jsonb,
  p_events jsonb,
  p_integrity jsonb,
  p_strain boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_session public.pressure_sessions;
  v_rating integer;
  v_expected numeric;
  v_delta integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_score IS NULL OR p_score < 0 OR p_score > 100 THEN RAISE EXCEPTION 'Invalid score'; END IF;

  SELECT * INTO v_session FROM public.pressure_sessions
   WHERE id = p_session AND user_id = v_uid;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Session not found'; END IF;
  -- Idempotent: a double submit returns the first result rather than double-rating.
  IF v_session.status = 'completed' THEN
    RETURN jsonb_build_object('already_completed', true, 'score', v_session.score);
  END IF;

  INSERT INTO public.pressure_ratings (user_id, format)
  VALUES (v_uid, v_session.format)
  ON CONFLICT (user_id, format) DO NOTHING;

  SELECT rating INTO v_rating FROM public.pressure_ratings
   WHERE user_id = v_uid AND format = v_session.format;

  -- Mirrors ratingDelta() in src/lib/pressure/metrics.ts: measured against your
  -- own current rating, and a bad session costs half what a good one gains, so
  -- practising is never punished.
  v_expected := least(greatest(40 + (v_rating - 1000) / 20.0, 10), 90);
  v_delta := round((p_score - v_expected) * 0.4);
  IF v_delta < 0 THEN v_delta := round(v_delta * 0.5); END IF;

  UPDATE public.pressure_sessions SET
    status = 'completed',
    completed_at = now(),
    score = p_score,
    accuracy_score = (p_sub->>'accuracy')::smallint,
    speed_score = (p_sub->>'speed')::smallint,
    composure_score = (p_sub->>'composure')::smallint,
    calibration_score = (p_sub->>'calibration')::smallint,
    consistency_score = (p_sub->>'consistency')::smallint,
    items = coalesce(p_items, '[]'::jsonb),
    events = coalesce(p_events, '[]'::jsonb),
    focus_lost_count = coalesce((p_integrity->>'focusLostCount')::integer, 0),
    fullscreen_exit_count = coalesce((p_integrity->>'fullscreenExitCount')::integer, 0),
    hidden_seconds = coalesce((p_integrity->>'hiddenSeconds')::integer, 0),
    strain_detected = coalesce(p_strain, false),
    answered_count = coalesce(jsonb_array_length(p_items), 0)
   WHERE id = p_session;

  UPDATE public.pressure_ratings SET
    rating = greatest(100, rating + v_delta),
    peak_rating = greatest(peak_rating, greatest(100, rating + v_delta)),
    sessions_played = sessions_played + 1,
    best_score = greatest(best_score, p_score),
    updated_at = now()
   WHERE user_id = v_uid AND format = v_session.format;

  RETURN jsonb_build_object('score', p_score, 'rating_delta', v_delta,
                            'rating', greatest(100, v_rating + v_delta));
END;
$$;

/**
 * Leaderboard.
 *
 * Ranks by rating, not by best single score: a one-off lucky session should not
 * outrank sustained performance. Requires 3 sessions to appear, so the board is
 * not topped by someone who ran one easy set.
 */
CREATE OR REPLACE FUNCTION public.get_pressure_leaderboard(
  p_format public.pressure_format,
  p_limit integer DEFAULT 25
)
RETURNS TABLE (
  user_id uuid,
  username text,
  rating integer,
  peak_rating integer,
  sessions_played integer,
  best_score smallint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.user_id, p.username, r.rating, r.peak_rating, r.sessions_played, r.best_score
    FROM public.pressure_ratings r
    JOIN public.user_profiles p ON p.user_id = r.user_id
   WHERE r.format = p_format
     AND r.sessions_played >= 3
     AND p.username IS NOT NULL
   ORDER BY r.rating DESC, r.best_score DESC
   LIMIT least(greatest(coalesce(p_limit, 25), 1), 100);
$$;

GRANT EXECUTE ON FUNCTION public.complete_pressure_session(uuid, smallint, jsonb, jsonb, jsonb, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pressure_leaderboard(public.pressure_format, integer) TO authenticated;
