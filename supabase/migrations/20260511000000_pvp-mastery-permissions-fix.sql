-- ════════════════════════════════════════════════════════════════════════
-- PvP Architecture + Archetype Mastery + Permission Fixes
--
-- This migration brings main branch up to date with:
--   1. Archetype mastery table + record_battle_mastery RPC
--   2. PvP tables: battle_sessions, pvp_queue, pvp_battles, player_ratings
--   3. PvP RPCs: find_pvp_match, update_pvp_rating, get_ghost_session,
--                get_pvp_leaderboard
--   4. Updated claim_chest with all 16 chest labels (Trophy Road redesign)
--   5. EXECUTE grants for all previously-revoked SECURITY DEFINER functions
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Archetype Mastery ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.archetype_mastery (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  archetype       text        NOT NULL,
  battles_played  integer     NOT NULL DEFAULT 0,
  wins            integer     NOT NULL DEFAULT 0,
  best_streak     integer     NOT NULL DEFAULT 0,
  total_correct   integer     NOT NULL DEFAULT 0,
  total_questions integer     NOT NULL DEFAULT 0,
  perfect_battles integer     NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, archetype)
);

ALTER TABLE public.archetype_mastery ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own mastery" ON public.archetype_mastery;
CREATE POLICY "Users manage own mastery"
  ON public.archetype_mastery FOR ALL
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.record_battle_mastery(
  p_archetype   text,
  p_won         boolean,
  p_best_streak integer,
  p_correct     integer,
  p_total       integer,
  p_perfect     boolean
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.archetype_mastery
    (user_id, archetype, battles_played, wins, best_streak, total_correct, total_questions, perfect_battles, updated_at)
  VALUES
    (v_user_id, p_archetype, 1, p_won::int, p_best_streak, p_correct, p_total, p_perfect::int, now())
  ON CONFLICT (user_id, archetype) DO UPDATE SET
    battles_played  = archetype_mastery.battles_played  + 1,
    wins            = archetype_mastery.wins            + (p_won::int),
    best_streak     = GREATEST(archetype_mastery.best_streak, p_best_streak),
    total_correct   = archetype_mastery.total_correct   + p_correct,
    total_questions = archetype_mastery.total_questions + p_total,
    perfect_battles = archetype_mastery.perfect_battles + (p_perfect::int),
    updated_at      = now();
END $$;

-- ── 2. Battle Sessions (Ghost PvP source data) ───────────────────────────

CREATE TABLE IF NOT EXISTS public.battle_sessions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL,
  archetype       text        NOT NULL,
  won             boolean     NOT NULL,
  rating          integer     NOT NULL DEFAULT 1000,
  total_questions integer     NOT NULL DEFAULT 0,
  correct_answers integer     NOT NULL DEFAULT 0,
  best_streak     integer     NOT NULL DEFAULT 0,
  question_records jsonb      NOT NULL DEFAULT '[]',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS battle_sessions_rating_idx
  ON public.battle_sessions (rating, created_at DESC);
CREATE INDEX IF NOT EXISTS battle_sessions_user_idx
  ON public.battle_sessions (user_id, created_at DESC);

ALTER TABLE public.battle_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own sessions" ON public.battle_sessions;
CREATE POLICY "Users manage own sessions" ON public.battle_sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authenticated read ghost sessions" ON public.battle_sessions;
CREATE POLICY "Authenticated read ghost sessions" ON public.battle_sessions
  FOR SELECT TO authenticated USING (true);

-- ── 3. PvP Queue ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pvp_queue (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL UNIQUE,
  username   text,
  archetype  text        NOT NULL,
  rating     integer     NOT NULL DEFAULT 1000,
  queued_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pvp_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own queue entry" ON public.pvp_queue;
CREATE POLICY "Users manage own queue entry" ON public.pvp_queue
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authenticated read queue" ON public.pvp_queue;
CREATE POLICY "Authenticated read queue" ON public.pvp_queue
  FOR SELECT TO authenticated USING (true);

-- ── 4. PvP Battles ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pvp_battles (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_id        uuid        NOT NULL,
  opponent_id          uuid        NOT NULL,
  challenger_archetype text        NOT NULL,
  opponent_archetype   text        NOT NULL,
  status               text        NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active','complete','abandoned')),
  winner_id            uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  completed_at         timestamptz
);

ALTER TABLE public.pvp_battles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Battle participants access" ON public.pvp_battles;
CREATE POLICY "Battle participants access" ON public.pvp_battles
  FOR ALL USING (auth.uid() = challenger_id OR auth.uid() = opponent_id);

-- ── 5. Player Ratings ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.player_ratings (
  user_id         uuid        PRIMARY KEY,
  rating          integer     NOT NULL DEFAULT 1000,
  peak_rating     integer     NOT NULL DEFAULT 1000,
  wins            integer     NOT NULL DEFAULT 0,
  losses          integer     NOT NULL DEFAULT 0,
  season          integer     NOT NULL DEFAULT 1,
  last_battle_at  timestamptz
);

ALTER TABLE public.player_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own rating" ON public.player_ratings;
CREATE POLICY "Users manage own rating" ON public.player_ratings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authenticated read ratings" ON public.player_ratings;
CREATE POLICY "Authenticated read ratings" ON public.player_ratings
  FOR SELECT TO authenticated USING (true);

-- ── 6. find_pvp_match RPC ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.find_pvp_match(
  p_archetype text,
  p_rating    integer
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_opponent record;
  v_battle   uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_opponent
  FROM public.pvp_queue
  WHERE user_id != v_uid
    AND ABS(rating - p_rating) <= 200
  ORDER BY queued_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN json_build_object('matched', false);
  END IF;

  INSERT INTO public.pvp_battles
    (challenger_id, opponent_id, challenger_archetype, opponent_archetype)
  VALUES
    (v_uid, v_opponent.user_id, p_archetype, v_opponent.archetype)
  RETURNING id INTO v_battle;

  DELETE FROM public.pvp_queue
  WHERE user_id IN (v_uid, v_opponent.user_id);

  RETURN json_build_object(
    'matched',            true,
    'battle_id',          v_battle::text,
    'opponent_user_id',   v_opponent.user_id::text,
    'opponent_username',  v_opponent.username,
    'opponent_archetype', v_opponent.archetype,
    'opponent_rating',    v_opponent.rating
  );
END $$;

-- ── 7. update_pvp_rating RPC ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_pvp_rating(
  p_opponent_rating integer,
  p_won             boolean
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid      uuid    := auth.uid();
  v_cur      record;
  v_expected float;
  v_k        integer;
  v_new      integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  INSERT INTO public.player_ratings (user_id)
  VALUES (v_uid)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_cur FROM public.player_ratings WHERE user_id = v_uid;

  v_expected := 1.0 / (1.0 + POWER(10.0, (p_opponent_rating::float - v_cur.rating) / 400.0));
  v_k        := CASE WHEN (v_cur.wins + v_cur.losses) < 20 THEN 32 ELSE 16 END;
  v_new      := GREATEST(100,
                  v_cur.rating + ROUND(v_k * ((CASE WHEN p_won THEN 1 ELSE 0 END)::float - v_expected))::integer
                );

  UPDATE public.player_ratings SET
    rating         = v_new,
    peak_rating    = GREATEST(peak_rating, v_new),
    wins           = wins   + (CASE WHEN p_won THEN 1 ELSE 0 END),
    losses         = losses + (CASE WHEN p_won THEN 0 ELSE 1 END),
    last_battle_at = now()
  WHERE user_id = v_uid;

  RETURN v_new;
END $$;

-- ── 8. get_ghost_session RPC ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_ghost_session(
  p_player_rating integer
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_session record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_session
  FROM public.battle_sessions
  WHERE user_id         != v_uid
    AND ABS(rating - p_player_rating) <= 150
    AND total_questions >= 3
    AND created_at      >  now() - interval '30 days'
  ORDER BY RANDOM()
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT * INTO v_session
    FROM public.battle_sessions
    WHERE user_id         != v_uid
      AND total_questions >= 3
    ORDER BY RANDOM()
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN row_to_json(v_session);
END $$;

-- ── 9. get_pvp_leaderboard RPC ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_pvp_leaderboard(p_limit integer DEFAULT 10)
RETURNS TABLE(
  user_id    uuid,
  username   text,
  rating     integer,
  wins       integer,
  losses     integer,
  avatar_url text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pr.user_id, up.username, pr.rating, pr.wins, pr.losses, up.avatar_url
  FROM   public.player_ratings pr
  JOIN   public.user_profiles  up ON up.user_id = pr.user_id
  WHERE  pr.wins + pr.losses >= 1
  ORDER  BY pr.rating DESC
  LIMIT  LEAST(p_limit, 50);
$$;

-- ── 10. claim_chest — full 16-label Trophy Road redesign ─────────────────

CREATE OR REPLACE FUNCTION public.claim_chest(p_node_id integer, p_chest_label text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_bonus integer; v_new integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_bonus := CASE p_chest_label
    WHEN 'Bronze Chest'    THEN 75
    WHEN 'Bronze Cache'    THEN 150
    WHEN 'Silver Chest'    THEN 200
    WHEN 'Silver Cache'    THEN 350
    WHEN 'Gold Chest'      THEN 450
    WHEN 'Gold Cache'      THEN 600
    WHEN 'Diamond Chest'   THEN 800
    WHEN 'Diamond Cache'   THEN 1000
    WHEN 'Platinum Chest'  THEN 1200
    WHEN 'Platinum Cache'  THEN 1500
    WHEN 'Champion Chest'  THEN 1800
    WHEN 'Champion Cache'  THEN 2200
    WHEN 'Unreal Chest'    THEN 2600
    WHEN 'Unreal Cache'    THEN 3000
    WHEN 'God Cache'       THEN 4000
    WHEN 'God Vault'       THEN 5500
    ELSE 0 END;
  IF v_bonus = 0 THEN RAISE EXCEPTION 'Unknown chest label: %', p_chest_label; END IF;
  INSERT INTO public.user_chest_claims(user_id, node_id, chest_label, bonus_xp)
    VALUES (v_uid, p_node_id, p_chest_label, v_bonus);
  INSERT INTO public.xp_award_log(user_id, event, amount)
    VALUES (v_uid, 'chest:'||p_chest_label, v_bonus);
  UPDATE public.user_profiles SET xp = xp + v_bonus WHERE user_id = v_uid RETURNING xp INTO v_new;
  RETURN v_bonus;
END $$;

-- ── 11. EXECUTE grants ────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.record_battle_mastery(text, boolean, integer, integer, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_pvp_match(text, integer)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_pvp_rating(integer, boolean)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ghost_session(integer)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pvp_leaderboard(integer)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_chest(integer, text)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.award_battle_xp(integer, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.award_xp(text)                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(integer)               TO authenticated;
