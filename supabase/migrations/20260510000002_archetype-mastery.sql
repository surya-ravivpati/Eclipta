
-- ================================================================
-- Archetype Mastery System
--
-- Tracks per-archetype battle statistics for each user.
-- Drives rank labels, win-rate displays, and identity formation
-- in the class-select screen and post-battle report.
--
-- Design notes:
--   record_battle_mastery is SECURITY DEFINER so it can UPSERT
--   without the row already existing — no pre-INSERT needed.
--   The GREATEST() on best_streak ensures concurrent sessions
--   never race-overwrite a higher streak.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.archetype_mastery (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  archetype       text        NOT NULL,
  battles_played  integer     NOT NULL DEFAULT 0,
  wins            integer     NOT NULL DEFAULT 0,
  best_streak     integer     NOT NULL DEFAULT 0,
  total_correct   integer     NOT NULL DEFAULT 0,
  total_questions integer     NOT NULL DEFAULT 0,
  perfect_battles integer     NOT NULL DEFAULT 0,   -- won with 100% accuracy
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, archetype)
);

ALTER TABLE public.archetype_mastery ENABLE ROW LEVEL SECURITY;

-- Users may read and write only their own rows.
-- No cross-user reads needed: mastery is a private identity layer.
DROP POLICY IF EXISTS "Users manage own mastery" ON public.archetype_mastery;
CREATE POLICY "Users manage own mastery"
  ON public.archetype_mastery
  FOR ALL
  USING (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- record_battle_mastery
--
-- Atomically upserts one battle's stats into the mastery record.
-- Called from the BattleReport on the client side.
--
-- Parameters:
--   p_archetype    — the ArchetypeId string (e.g. "speedster")
--   p_won          — whether the player won
--   p_best_streak  — longest consecutive correct answers this battle
--   p_correct      — total correct answers this battle
--   p_total        — total questions answered this battle
--   p_perfect      — true when won AND p_correct === p_total (flawless)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_battle_mastery(
  p_archetype     text,
  p_won           boolean,
  p_best_streak   integer,
  p_correct       integer,
  p_total         integer,
  p_perfect       boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.archetype_mastery (
    user_id, archetype,
    battles_played, wins, best_streak,
    total_correct, total_questions, perfect_battles,
    updated_at
  )
  VALUES (
    v_user_id, p_archetype,
    1, p_won::int, p_best_streak,
    p_correct, p_total, p_perfect::int,
    now()
  )
  ON CONFLICT (user_id, archetype) DO UPDATE SET
    battles_played  = archetype_mastery.battles_played  + 1,
    wins            = archetype_mastery.wins            + (p_won::int),
    -- GREATEST prevents a poor run from overwriting a lifetime best
    best_streak     = GREATEST(archetype_mastery.best_streak, p_best_streak),
    total_correct   = archetype_mastery.total_correct   + p_correct,
    total_questions = archetype_mastery.total_questions + p_total,
    perfect_battles = archetype_mastery.perfect_battles + (p_perfect::int),
    updated_at      = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_battle_mastery FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.record_battle_mastery TO authenticated;
