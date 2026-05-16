-- ════════════════════════════════════════════════════════════════════════
-- Fix Live PvP wins/losses tracking, status='completed' constraint, and
-- the rematch flow.
--
-- Root cause: 20260510000006_pvp-architecture.sql created pvp_battles with
--   CHECK (status IN ('active','complete','abandoned'))
-- but later code (complete_pvp_battle, request_pvp_rematch, the backfill loop,
-- the client realtime subscription) all read/write status = 'completed'.
-- The CHECK constraint rejects 'completed', so:
--   * complete_pvp_battle's UPDATE fails → entire transaction (including the
--     apply_pvp_rating_pair wins/losses update) is rolled back. Live wins
--     and losses never land on player_ratings.
--   * pvp_battles row stays at status='active' forever → request_pvp_rematch
--     raises "Battle must be completed before rematch" so live rematches
--     can never succeed.
--   * The client's realtime UPDATE subscription, which only acts when
--     status === 'completed', never fires, so the loser never even hears
--     about the result via the DB path.
--
-- Fix: drop the broken CHECK and replace with one that accepts the value the
-- code actually writes ('completed'). Keep 'complete' as a synonym so any
-- historical rows survive the migration. Then re-finish any battles that
-- got stuck mid-flight while the constraint was broken, so leaderboard
-- standings reflect every completed match.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Replace the status CHECK constraint ──────────────────────────────
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.pvp_battles'::regclass
       AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.pvp_battles DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

-- Normalise any pre-existing rows that used the legacy spelling.
UPDATE public.pvp_battles SET status = 'completed' WHERE status = 'complete';

ALTER TABLE public.pvp_battles
  ADD CONSTRAINT pvp_battles_status_check
  CHECK (status IN ('active', 'completed', 'abandoned'));

-- ── 2. Heal pvp_battles rows that finished while the constraint was wrong ─
-- complete_pvp_battle now also recovers ratings_applied=true rows where the
-- previous failed transaction left only the per-player rating delta but no
-- updated battle status. The same applies to any battle with a determined
-- winner whose status never flipped off 'active'.
DO $$
DECLARE
  r record;
  v_winner uuid;
  v_rating record;
BEGIN
  FOR r IN
    SELECT b.*
      FROM public.pvp_battles b
     WHERE b.status = 'active'
       AND b.ratings_applied = false
       AND b.created_at < now() - interval '2 minutes'
  LOOP
    -- Prefer outcome from recorded turn actions (HP <= 0 implies a winner).
    -- Otherwise fall back to the battle_sessions persisted by each client,
    -- mirroring the older backfill logic.
    v_winner := NULL;

    SELECT
      CASE
        WHEN sum(CASE WHEN actor_id = r.challenger_id THEN damage ELSE 0 END)
           > sum(CASE WHEN actor_id = r.opponent_id   THEN damage ELSE 0 END)
          THEN r.challenger_id
        WHEN sum(CASE WHEN actor_id = r.opponent_id   THEN damage ELSE 0 END)
           > sum(CASE WHEN actor_id = r.challenger_id THEN damage ELSE 0 END)
          THEN r.opponent_id
        ELSE NULL
      END
    INTO v_winner
    FROM public.pvp_turn_actions
    WHERE battle_id = r.id;

    IF v_winner IS NULL THEN
      DECLARE
        v_ch record;
        v_op record;
      BEGIN
        SELECT * INTO v_ch FROM public.battle_sessions
         WHERE user_id = r.challenger_id AND created_at >= r.created_at
         ORDER BY created_at ASC LIMIT 1;
        SELECT * INTO v_op FROM public.battle_sessions
         WHERE user_id = r.opponent_id AND created_at >= r.created_at
         ORDER BY created_at ASC LIMIT 1;

        IF v_ch.id IS NOT NULL AND v_op.id IS NOT NULL THEN
          IF v_ch.won = true AND v_op.won = false THEN
            v_winner := r.challenger_id;
          ELSIF v_op.won = true AND v_ch.won = false THEN
            v_winner := r.opponent_id;
          ELSIF coalesce(v_ch.correct_answers, 0) <> coalesce(v_op.correct_answers, 0) THEN
            v_winner := CASE
              WHEN coalesce(v_ch.correct_answers, 0) > coalesce(v_op.correct_answers, 0)
                THEN r.challenger_id ELSE r.opponent_id
            END;
          ELSE
            v_winner := CASE
              WHEN coalesce(v_ch.best_streak, 0) >= coalesce(v_op.best_streak, 0)
                THEN r.challenger_id ELSE r.opponent_id
            END;
          END IF;
        END IF;
      END;
    END IF;

    IF v_winner IS NULL THEN
      -- Not enough data to determine a winner yet. Abandon if the row has
      -- been sitting idle for more than an hour so the queue does not stay
      -- haunted by zombie battles.
      IF r.created_at < now() - interval '1 hour' THEN
        UPDATE public.pvp_battles
           SET status = 'abandoned',
               completed_at = now()
         WHERE id = r.id;
      END IF;
      CONTINUE;
    END IF;

    SELECT * INTO v_rating
      FROM public.apply_pvp_rating_pair(r.challenger_id, r.opponent_id, v_winner);

    UPDATE public.pvp_battles
       SET status = 'completed',
           winner_id = v_winner,
           completed_at = COALESCE(completed_at, now()),
           ratings_applied = true,
           challenger_rating_before = v_rating.challenger_before,
           opponent_rating_before   = v_rating.opponent_before,
           challenger_rating_after  = v_rating.challenger_after,
           opponent_rating_after    = v_rating.opponent_after
     WHERE id = r.id;
  END LOOP;
END $$;

-- ── 3. Harden complete_pvp_battle ───────────────────────────────────────
-- The previous version mixed the rating write and the battle-row UPDATE in a
-- single transaction. If the rating write went through but the row UPDATE
-- later failed for any reason (constraint, RLS, advisory lock, etc.), the
-- whole thing rolled back — but if the call partially succeeded on a retry
-- it could double-count wins. Lock the row first, decide once whether to
-- apply rating, and never run the rating math twice.
CREATE OR REPLACE FUNCTION public.complete_pvp_battle(p_battle_id uuid, p_winner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_b record;
  v_rating record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_b FROM public.pvp_battles WHERE id = p_battle_id FOR UPDATE;
  IF v_b.id IS NULL THEN RAISE EXCEPTION 'Battle not found'; END IF;
  IF v_uid NOT IN (v_b.challenger_id, v_b.opponent_id) THEN
    RAISE EXCEPTION 'Not a participant';
  END IF;
  IF p_winner_id NOT IN (v_b.challenger_id, v_b.opponent_id) THEN
    RAISE EXCEPTION 'Winner must be a battle participant';
  END IF;

  -- Idempotency: once status is completed AND ratings were applied, just
  -- echo back the already-stored result. Two clients race to call this RPC
  -- after every match — the second caller must never double-count W/L.
  IF v_b.status = 'completed' AND v_b.ratings_applied = true AND v_b.winner_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'already_completed', true,
      'winner_id', v_b.winner_id,
      'challenger_rating_before', v_b.challenger_rating_before,
      'opponent_rating_before',   v_b.opponent_rating_before,
      'challenger_rating_after',  v_b.challenger_rating_after,
      'opponent_rating_after',    v_b.opponent_rating_after
    );
  END IF;

  -- If a prior crashed transaction managed to mark ratings_applied=true but
  -- not flip status, just clean up the row without re-applying rating.
  IF v_b.ratings_applied = true AND v_b.winner_id IS NOT NULL THEN
    UPDATE public.pvp_battles
       SET status = 'completed',
           completed_at = COALESCE(completed_at, now())
     WHERE id = p_battle_id;
    RETURN jsonb_build_object(
      'already_completed', true,
      'winner_id', v_b.winner_id,
      'challenger_rating_before', v_b.challenger_rating_before,
      'opponent_rating_before',   v_b.opponent_rating_before,
      'challenger_rating_after',  v_b.challenger_rating_after,
      'opponent_rating_after',    v_b.opponent_rating_after
    );
  END IF;

  SELECT * INTO v_rating
    FROM public.apply_pvp_rating_pair(v_b.challenger_id, v_b.opponent_id, p_winner_id);

  UPDATE public.pvp_battles
     SET status = 'completed',
         winner_id = p_winner_id,
         completed_at = now(),
         ratings_applied = true,
         challenger_rating_before = v_rating.challenger_before,
         opponent_rating_before   = v_rating.opponent_before,
         challenger_rating_after  = v_rating.challenger_after,
         opponent_rating_after    = v_rating.opponent_after
   WHERE id = p_battle_id;

  RETURN jsonb_build_object(
    'already_completed', false,
    'winner_id', p_winner_id,
    'challenger_rating_before', v_rating.challenger_before,
    'opponent_rating_before',   v_rating.opponent_before,
    'challenger_rating_after',  v_rating.challenger_after,
    'opponent_rating_after',    v_rating.opponent_after
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_pvp_battle(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_pvp_battle(uuid, uuid) TO authenticated;

-- ── 4. Make rematch tolerant of legacy 'complete' rows ──────────────────
-- (The CHECK above already disallows the old spelling for new writes, but
-- existing functions that compare against the literal need to handle both
-- transition periods cleanly.)
CREATE OR REPLACE FUNCTION public.request_pvp_rematch(p_battle_id uuid, p_archetype text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_b record;
  v_new_id uuid;
  v_requests uuid[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_archetype IS NULL OR length(p_archetype) < 2 THEN RAISE EXCEPTION 'Invalid archetype'; END IF;

  SELECT * INTO v_b FROM public.pvp_battles WHERE id = p_battle_id FOR UPDATE;
  IF v_b.id IS NULL THEN RAISE EXCEPTION 'Battle not found'; END IF;
  IF v_uid NOT IN (v_b.challenger_id, v_b.opponent_id) THEN
    RAISE EXCEPTION 'Not a participant';
  END IF;
  IF v_b.status NOT IN ('completed', 'complete') THEN
    RAISE EXCEPTION 'Battle must be completed before rematch';
  END IF;

  v_requests := array(SELECT DISTINCT unnest(v_b.rematch_requested_by || v_uid));

  IF array_length(v_requests, 1) >= 2 THEN
    IF v_b.rematch_battle_id IS NULL THEN
      v_new_id := gen_random_uuid();
      INSERT INTO public.pvp_battles(
        id, challenger_id, opponent_id,
        challenger_archetype, opponent_archetype, status
      )
      VALUES (
        v_new_id,
        v_b.opponent_id,
        v_b.challenger_id,
        CASE WHEN v_uid = v_b.opponent_id   THEN p_archetype ELSE v_b.opponent_archetype END,
        CASE WHEN v_uid = v_b.challenger_id THEN p_archetype ELSE v_b.challenger_archetype END,
        'active'
      );
      UPDATE public.pvp_battles
         SET rematch_requested_by = v_requests,
             rematch_battle_id = v_new_id
       WHERE id = p_battle_id;
    ELSE
      v_new_id := v_b.rematch_battle_id;
      UPDATE public.pvp_battles SET rematch_requested_by = v_requests WHERE id = p_battle_id;
    END IF;

    RETURN jsonb_build_object(
      'ready', true,
      'battle_id', v_new_id,
      'requests', to_jsonb(v_requests)
    );
  END IF;

  UPDATE public.pvp_battles SET rematch_requested_by = v_requests WHERE id = p_battle_id;
  RETURN jsonb_build_object(
    'ready', false,
    'battle_id', NULL,
    'requests', to_jsonb(v_requests)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_pvp_rematch(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_pvp_rematch(uuid, text) TO authenticated;
