-- ─────────────────────────────────────────────────────────────────────
-- 1. PvP rating table
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.player_ratings (
  user_id     uuid PRIMARY KEY,
  rating      integer NOT NULL DEFAULT 1000,
  peak_rating integer NOT NULL DEFAULT 1000,
  wins        integer NOT NULL DEFAULT 0,
  losses      integer NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.player_ratings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view ratings" ON public.player_ratings;
CREATE POLICY "Anyone can view ratings"
  ON public.player_ratings FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can manage own rating" ON public.player_ratings;
CREATE POLICY "Users can manage own rating"
  ON public.player_ratings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────
-- 2. PvP queue
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pvp_queue (
  user_id   uuid PRIMARY KEY,
  username  text,
  archetype text NOT NULL,
  rating    integer NOT NULL DEFAULT 1000,
  queued_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pvp_queue_rating ON public.pvp_queue(rating);
CREATE INDEX IF NOT EXISTS idx_pvp_queue_queued_at ON public.pvp_queue(queued_at);
ALTER TABLE public.pvp_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth users see queue" ON public.pvp_queue;
CREATE POLICY "Auth users see queue"
  ON public.pvp_queue FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Users manage own queue entry" ON public.pvp_queue;
CREATE POLICY "Users manage own queue entry"
  ON public.pvp_queue FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────
-- 3. PvP battles (active/finished match metadata)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pvp_battles (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_id        uuid NOT NULL,
  opponent_id          uuid NOT NULL,
  challenger_archetype text NOT NULL,
  opponent_archetype   text NOT NULL,
  status               text NOT NULL DEFAULT 'active',
  winner_id            uuid,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pvp_battles_players ON public.pvp_battles(challenger_id, opponent_id);
CREATE INDEX IF NOT EXISTS idx_pvp_battles_created ON public.pvp_battles(created_at DESC);
ALTER TABLE public.pvp_battles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Participants view battles" ON public.pvp_battles;
CREATE POLICY "Participants view battles"
  ON public.pvp_battles FOR SELECT
  USING (auth.uid() = challenger_id OR auth.uid() = opponent_id);
DROP POLICY IF EXISTS "Participants update battles" ON public.pvp_battles;
CREATE POLICY "Participants update battles"
  ON public.pvp_battles FOR UPDATE
  USING (auth.uid() = challenger_id OR auth.uid() = opponent_id);

-- ─────────────────────────────────────────────────────────────────────
-- 4. Battle sessions (used for ghost replays)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.battle_sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL,
  archetype        text NOT NULL,
  won              boolean NOT NULL,
  rating           integer NOT NULL DEFAULT 1000,
  total_questions  integer NOT NULL DEFAULT 0,
  correct_answers  integer NOT NULL DEFAULT 0,
  best_streak      integer NOT NULL DEFAULT 0,
  question_records jsonb   NOT NULL DEFAULT '[]'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_battle_sessions_rating ON public.battle_sessions(rating);
CREATE INDEX IF NOT EXISTS idx_battle_sessions_created ON public.battle_sessions(created_at DESC);
ALTER TABLE public.battle_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view battle sessions" ON public.battle_sessions;
CREATE POLICY "Anyone can view battle sessions"
  ON public.battle_sessions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users insert own session" ON public.battle_sessions;
CREATE POLICY "Users insert own session"
  ON public.battle_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────
-- 5. Matchmaking RPC
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.find_pvp_match(p_archetype text, p_rating integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_opp record;
  v_battle_id uuid;
  v_my_username text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Sweep stale queue entries (>20s old)
  DELETE FROM public.pvp_queue WHERE queued_at < now() - interval '20 seconds';

  -- Find best candidate within ±300 rating, oldest first
  SELECT user_id, username, archetype, rating
    INTO v_opp
    FROM public.pvp_queue
   WHERE user_id <> v_uid
     AND abs(rating - p_rating) <= 300
   ORDER BY queued_at ASC
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  IF v_opp.user_id IS NULL THEN
    RETURN jsonb_build_object('matched', false);
  END IF;

  SELECT username INTO v_my_username FROM public.user_profiles WHERE user_id = v_uid;

  v_battle_id := gen_random_uuid();
  INSERT INTO public.pvp_battles
    (id, challenger_id, opponent_id, challenger_archetype, opponent_archetype, status)
  VALUES
    (v_battle_id, v_uid, v_opp.user_id, p_archetype, v_opp.archetype, 'active');

  -- Remove both from queue
  DELETE FROM public.pvp_queue WHERE user_id IN (v_uid, v_opp.user_id);

  RETURN jsonb_build_object(
    'matched', true,
    'battle_id', v_battle_id,
    'opponent_user_id', v_opp.user_id,
    'opponent_username', v_opp.username,
    'opponent_archetype', v_opp.archetype,
    'opponent_rating', v_opp.rating
  );
END $$;
REVOKE ALL ON FUNCTION public.find_pvp_match(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_pvp_match(text, integer) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 6. ELO update RPC
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_pvp_rating(p_opponent_rating integer, p_won boolean)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cur integer;
  v_peak integer;
  v_expected numeric;
  v_score numeric;
  v_k constant integer := 24;
  v_delta integer;
  v_new integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  INSERT INTO public.player_ratings(user_id) VALUES (v_uid)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT rating, peak_rating INTO v_cur, v_peak
    FROM public.player_ratings WHERE user_id = v_uid;

  v_expected := 1.0 / (1.0 + power(10.0, (p_opponent_rating - v_cur) / 400.0));
  v_score    := CASE WHEN p_won THEN 1.0 ELSE 0.0 END;
  v_delta    := round(v_k * (v_score - v_expected));
  v_new      := GREATEST(0, v_cur + v_delta);

  UPDATE public.player_ratings
     SET rating       = v_new,
         peak_rating  = GREATEST(v_peak, v_new),
         wins         = wins   + CASE WHEN p_won THEN 1 ELSE 0 END,
         losses       = losses + CASE WHEN p_won THEN 0 ELSE 1 END,
         updated_at   = now()
   WHERE user_id = v_uid;

  RETURN v_new;
END $$;
REVOKE ALL ON FUNCTION public.update_pvp_rating(integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_pvp_rating(integer, boolean) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 7. PvP leaderboard RPC
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_pvp_leaderboard(p_limit integer DEFAULT 10)
RETURNS TABLE(user_id uuid, username text, rating integer, wins integer, losses integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pr.user_id, up.username, pr.rating, pr.wins, pr.losses
    FROM public.player_ratings pr
    LEFT JOIN public.user_profiles up ON up.user_id = pr.user_id
   WHERE pr.wins + pr.losses > 0
   ORDER BY pr.rating DESC
   LIMIT LEAST(p_limit, 100);
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 8. Ghost session RPC
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ghost_session(p_player_rating integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record;
BEGIN
  SELECT id, archetype, won, rating, total_questions, correct_answers, best_streak, question_records
    INTO r
    FROM public.battle_sessions
   WHERE auth.uid() IS NULL OR user_id <> auth.uid()
     AND abs(rating - p_player_rating) <= 200
   ORDER BY random()
   LIMIT 1;

  IF r.id IS NULL THEN
    SELECT id, archetype, won, rating, total_questions, correct_answers, best_streak, question_records
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
    'question_records', r.question_records
  );
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 9. Realtime publication for PvP-relevant tables
-- ─────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.pvp_battles;    EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.pvp_queue;      EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.player_ratings; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.user_ecliptars; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
ALTER TABLE public.pvp_battles    REPLICA IDENTITY FULL;
ALTER TABLE public.player_ratings REPLICA IDENTITY FULL;

-- ─────────────────────────────────────────────────────────────────────
-- 10. Legacy archetype/ecliptar cleanup
--    Delete any user_ecliptars that the user does NOT actually qualify
--    for under the current Trophy Road XP gating.
-- ─────────────────────────────────────────────────────────────────────
WITH gate(archetype, min_xp) AS (
  VALUES
    ('speedster',     400),
    ('tank',          9000),
    ('chud',          22000),
    ('gambler',       46000),
    ('healer',        84000),
    ('fulcrum',       157000),
    ('accelerator',   285000),
    ('god',           495000)
)
DELETE FROM public.user_ecliptars ue
USING gate g, public.user_profiles up
WHERE ue.archetype = g.archetype
  AND ue.user_id   = up.user_id
  AND up.xp        < g.min_xp;

-- Unequip any avatar that no longer maps to an owned ecliptar
UPDATE public.user_profiles up
   SET equipped_ecliptar = NULL
 WHERE equipped_ecliptar IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.user_ecliptars ue
      WHERE ue.user_id = up.user_id
        AND ue.ecliptar_slug = up.equipped_ecliptar
   );