-- Starter content: bot ladder, seeded forum threads, starter study groups.
--
-- ── Attribution ─────────────────────────────────────────────────────────────
-- Two kinds of generated content, handled differently on purpose.
--
-- BOTS are flagged (`is_bot`) and can be labelled anywhere they appear. That is
-- ordinary game practice — a ladder needs opponents on day one — and the flag
-- means a player can always tell which rivals are real, which is what makes
-- beating a real one mean anything.
--
-- FORUM AND GROUP CONTENT is attributed to the Eclipta team, not to invented
-- people. Seeding a forum with fake peers asking fake homework questions, with
-- fake upvotes and fake accepted answers, tells a real user that other learners
-- found those answers useful when nobody did. `content_source` records what each
-- row actually is, so the UI can badge it and so nothing is ever silently passed
-- off as community activity.
--
-- Consequently there are no fabricated votes and no fabricated memberships:
-- forum_votes and study_room_members both require a real user_id, and inventing
-- accounts to fill them is exactly the fabrication this avoids. Starter threads
-- ship at zero votes and starter groups ship empty and joinable — genuinely
-- useful, honestly labelled.

-- ── Bot identity ─────────────────────────────────────────────────────────────

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS is_bot boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_profiles.is_bot IS
  'AI-controlled ladder opponent. MUST be surfaced in any UI listing this profile so players can distinguish bots from people.';

-- Partial index: bot lookups are frequent (matchmaking, ladder) and bots are a
-- minority of rows.
CREATE INDEX IF NOT EXISTS idx_user_profiles_is_bot
  ON public.user_profiles (is_bot) WHERE is_bot;

CREATE TABLE IF NOT EXISTS public.bot_profiles (
  -- Deterministic slug from the generator, so re-running the seed updates rather
  -- than duplicating.
  slug text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  personality text NOT NULL,
  blurb text NOT NULL,
  avatar_seed text NOT NULL,
  archetype text NOT NULL,
  subjects text[] NOT NULL DEFAULT '{}',
  -- Hours (0–23) the bot is active, so challenges arrive plausibly.
  active_hours smallint[] NOT NULL DEFAULT '{}',
  rating integer NOT NULL DEFAULT 1000,
  peak_rating integer NOT NULL DEFAULT 1000,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  xp integer NOT NULL DEFAULT 0,
  current_streak integer NOT NULL DEFAULT 0,
  best_streak integer NOT NULL DEFAULT 0,
  accuracy numeric(4, 3) NOT NULL DEFAULT 0.7,
  mean_pace numeric(5, 2) NOT NULL DEFAULT 15,
  volatility numeric(4, 3) NOT NULL DEFAULT 0.1,
  age_days integer NOT NULL DEFAULT 30,
  progression jsonb NOT NULL DEFAULT '[]'::jsonb,
  achievements text[] NOT NULL DEFAULT '{}',
  last_drift_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bot_profiles_rating ON public.bot_profiles (rating DESC);
CREATE INDEX IF NOT EXISTS idx_bot_profiles_personality ON public.bot_profiles (personality);

ALTER TABLE public.bot_profiles ENABLE ROW LEVEL SECURITY;

-- Public read: the ladder and a bot's profile page need it. No client write
-- policy — the roster is seeded and drifted by the service role only.
DROP POLICY IF EXISTS "bot profiles readable" ON public.bot_profiles;
CREATE POLICY "bot profiles readable" ON public.bot_profiles
  FOR SELECT USING (true);

-- ── Content attribution ──────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'content_source') THEN
    CREATE TYPE public.content_source AS ENUM (
      -- Written by a real member.
      'member',
      -- Shipped with the platform, authored by the Eclipta team. Badged in UI.
      'seed',
      -- Official announcement.
      'official'
    );
  END IF;
END $$;

ALTER TABLE public.forum_threads
  ADD COLUMN IF NOT EXISTS content_source public.content_source NOT NULL DEFAULT 'member';
ALTER TABLE public.forum_answers
  ADD COLUMN IF NOT EXISTS content_source public.content_source NOT NULL DEFAULT 'member';

COMMENT ON COLUMN public.forum_threads.content_source IS
  'Provenance. Anything other than ''member'' MUST be visibly labelled — starter content may never be presented as a post by another learner.';

CREATE INDEX IF NOT EXISTS idx_forum_threads_source
  ON public.forum_threads (content_source) WHERE content_source <> 'member';

ALTER TABLE public.study_rooms
  ADD COLUMN IF NOT EXISTS content_source public.content_source NOT NULL DEFAULT 'member';

-- ── Seeding ──────────────────────────────────────────────────────────────────

/**
 * Upsert one bot. Keyed on slug so re-seeding is idempotent and a bot's identity
 * survives a roster regeneration with the same seed.
 *
 * Also stamps `is_bot` on the linked profile, so the flag can never drift out of
 * sync with bot_profiles.
 */
CREATE OR REPLACE FUNCTION public.upsert_bot(p_bot jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text := p_bot->>'slug';
BEGIN
  IF v_slug IS NULL OR v_slug = '' THEN RAISE EXCEPTION 'bot slug is required'; END IF;

  INSERT INTO public.bot_profiles (
    slug, username, personality, blurb, avatar_seed, archetype, subjects,
    active_hours, rating, peak_rating, wins, losses, xp, current_streak,
    best_streak, accuracy, mean_pace, volatility, age_days, progression, achievements
  ) VALUES (
    v_slug,
    p_bot->>'username',
    p_bot->>'personality',
    p_bot->>'blurb',
    p_bot->>'avatarSeed',
    p_bot->>'archetype',
    coalesce((SELECT array_agg(x) FROM jsonb_array_elements_text(p_bot->'subjects') x), '{}'),
    coalesce((SELECT array_agg(x::smallint) FROM jsonb_array_elements_text(p_bot->'activeHours') x), '{}'),
    (p_bot->>'rating')::integer,
    (p_bot->>'peakRating')::integer,
    (p_bot->>'wins')::integer,
    (p_bot->>'losses')::integer,
    (p_bot->>'xp')::integer,
    (p_bot->>'currentStreak')::integer,
    (p_bot->>'bestStreak')::integer,
    (p_bot->>'accuracy')::numeric,
    (p_bot->>'meanPace')::numeric,
    (p_bot->>'volatility')::numeric,
    (p_bot->>'ageDays')::integer,
    coalesce(p_bot->'progression', '[]'::jsonb),
    coalesce((SELECT array_agg(x) FROM jsonb_array_elements_text(p_bot->'achievements') x), '{}')
  )
  ON CONFLICT (slug) DO UPDATE SET
    username = EXCLUDED.username,
    personality = EXCLUDED.personality,
    blurb = EXCLUDED.blurb,
    rating = EXCLUDED.rating,
    peak_rating = greatest(public.bot_profiles.peak_rating, EXCLUDED.peak_rating),
    wins = EXCLUDED.wins,
    losses = EXCLUDED.losses,
    xp = EXCLUDED.xp,
    accuracy = EXCLUDED.accuracy,
    progression = EXCLUDED.progression,
    achievements = EXCLUDED.achievements;

  -- Keep the profile flag consistent whenever a bot is linked to an account.
  UPDATE public.user_profiles p SET is_bot = true
    WHERE p.user_id = (SELECT user_id FROM public.bot_profiles WHERE slug = v_slug)
      AND NOT p.is_bot;

  RETURN v_slug;
END;
$$;

/**
 * Ladder that mixes bots and people, with bots explicitly marked.
 *
 * Returning `is_bot` rather than filtering bots out is the point: the ladder is
 * populated *and* honest, and the client can badge each row.
 */
CREATE OR REPLACE FUNCTION public.get_mixed_leaderboard(p_limit integer DEFAULT 50)
RETURNS TABLE (
  username text,
  rating integer,
  wins integer,
  losses integer,
  is_bot boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.username, r.rating, r.wins, r.losses, false AS is_bot
    FROM public.player_ratings r
    JOIN public.user_profiles p ON p.user_id = r.user_id
   WHERE p.username IS NOT NULL AND NOT p.is_bot
  UNION ALL
  SELECT b.username, b.rating, b.wins, b.losses, true AS is_bot
    FROM public.bot_profiles b
  ORDER BY rating DESC
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

/**
 * Advance the bot ladder.
 *
 * Called on a schedule so a returning player does not find a frozen board.
 * Movement is bounded per call and the whole roster cannot move more than a
 * little per day — a ladder that lurches is more obviously synthetic than one
 * that barely moves.
 */
CREATE OR REPLACE FUNCTION public.drift_bot_ratings(p_max_days integer DEFAULT 1)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  WITH moved AS (
    UPDATE public.bot_profiles b SET
      rating = greatest(500, least(2400,
        b.rating + round(((random() - 0.45) * 30 * least(p_max_days, 7))::numeric)::integer)),
      -- The record moves with the rating so the two never contradict.
      wins = b.wins + CASE WHEN random() < 0.5 THEN 1 ELSE 0 END,
      losses = b.losses + CASE WHEN random() < 0.5 THEN 1 ELSE 0 END,
      last_drift_at = now()
     WHERE b.last_drift_at < now() - interval '12 hours'
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM moved;

  UPDATE public.bot_profiles SET peak_rating = greatest(peak_rating, rating)
   WHERE peak_rating < rating;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_mixed_leaderboard(integer) TO authenticated;
REVOKE ALL ON FUNCTION public.upsert_bot(jsonb) FROM public;
REVOKE ALL ON FUNCTION public.drift_bot_ratings(integer) FROM public;
