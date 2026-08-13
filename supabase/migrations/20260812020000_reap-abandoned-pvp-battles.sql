-- Resolve live battles that nobody is playing any more.
--
-- The explicit Forfeit button already confirms and takes the loss. What was
-- never handled is the commoner case: a player closes the tab, loses signal, or
-- walks away. Nothing marked the match resolved, so it sat `active` forever and
-- the *other* player — who did nothing wrong — was left staring at a turn that
-- would never come, with no result and no rating movement.
--
-- It has to be server-side. A client that has gone away cannot report its own
-- loss, which is the whole difficulty: the one participant who knows the match
-- ended is the one who is no longer there.

-- Records who walked, so an abandonment stays distinguishable from a fought
-- finish long after the fact. Deliberately additive: the match is still marked
-- `completed` with a winner, so the leaderboard, `player_wl` and the rating
-- pair all keep working unchanged and a forfeit counts exactly like any other
-- loss — which is the point of having one.
ALTER TABLE public.pvp_battles
  ADD COLUMN IF NOT EXISTS abandoned_by uuid;

COMMENT ON COLUMN public.pvp_battles.abandoned_by IS
  'Set when a battle was decided by walk-away rather than played to a finish. The row is still status=completed with a winner_id, so every existing query counts it as a normal result.';

/**
 * Resolve every live battle that has gone quiet.
 *
 * A battle is quiet when neither `pvp_battle_state.updated_at` nor its own
 * `created_at` has moved inside `p_stale_after`. The default of 3 minutes is
 * comfortably longer than the longest legal turn (a 30s question clock plus
 * animation), so a slow player is never mistaken for an absent one.
 *
 * Three outcomes, in order:
 *
 *   1. The state already carries a winner — the match genuinely finished and
 *      the client died before reporting it. That is not an abandonment, so it
 *      completes normally and nobody is marked as having walked.
 *   2. Someone has taken a turn. The player who acted most recently is the one
 *      still present, so the other forfeits. Rating moves through the same
 *      `apply_pvp_rating_pair` a played finish uses — a forfeit that cost
 *      nothing would just teach people to close the tab when losing.
 *   3. Nobody ever acted. The match is voided: `abandoned`, no winner, no
 *      rating change. Two people who never played have not earned a result
 *      between them, and handing one a win for loading faster would be worse
 *      than leaving it undecided.
 *
 * Returns the number of battles resolved. Bounded per run so one sweep over a
 * long backlog cannot run unboundedly.
 */
CREATE OR REPLACE FUNCTION public.reap_abandoned_pvp_battles(
  p_stale_after interval DEFAULT '3 minutes',
  p_limit integer DEFAULT 200
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r            record;
  v_last_actor uuid;
  v_winner     uuid;
  v_loser      uuid;
  v_rating     record;
  v_count      integer := 0;
BEGIN
  FOR r IN
    SELECT b.id, b.challenger_id, b.opponent_id, s.winner_id AS state_winner
      FROM public.pvp_battles b
      LEFT JOIN public.pvp_battle_state s ON s.battle_id = b.id
     WHERE b.status = 'active'
       AND greatest(b.created_at, coalesce(s.updated_at, b.created_at))
             < now() - p_stale_after
     ORDER BY b.created_at
     LIMIT greatest(coalesce(p_limit, 200), 1)
  LOOP
    -- (1) Finished but never reported.
    IF r.state_winner IS NOT NULL THEN
      v_winner := r.state_winner;
      v_loser  := NULL;
    ELSE
      SELECT actor_id INTO v_last_actor
        FROM public.pvp_turn_actions
       WHERE battle_id = r.id
       ORDER BY created_at DESC
       LIMIT 1;

      -- (3) Nobody played. Void it rather than inventing a winner.
      IF v_last_actor IS NULL THEN
        UPDATE public.pvp_battles
           SET status = 'abandoned', completed_at = now()
         WHERE id = r.id AND status = 'active';
        v_count := v_count + 1;
        CONTINUE;
      END IF;

      -- (2) The player who acted last is the one still here.
      v_winner := v_last_actor;
      v_loser  := CASE WHEN v_winner = r.challenger_id THEN r.opponent_id
                       ELSE r.challenger_id END;
    END IF;

    SELECT * INTO v_rating
      FROM public.apply_pvp_rating_pair(r.challenger_id, r.opponent_id, v_winner);

    -- Guarded on `status = 'active'` so a client finishing the match between
    -- the SELECT above and here wins the race instead of being overwritten.
    UPDATE public.pvp_battles
       SET status                   = 'completed',
           winner_id                = v_winner,
           completed_at             = now(),
           ratings_applied          = true,
           abandoned_by             = v_loser,
           challenger_rating_before = v_rating.challenger_before,
           opponent_rating_before   = v_rating.opponent_before,
           challenger_rating_after  = v_rating.challenger_after,
           opponent_rating_after    = v_rating.opponent_after
     WHERE id = r.id AND status = 'active';

    IF FOUND THEN v_count := v_count + 1; END IF;
  END LOOP;

  RETURN v_count;
END;
$fn$;

-- Nobody calls this over the API: a player must not be able to decide when
-- their opponent counts as gone. pg_cron runs it as its own owner.
REVOKE ALL ON FUNCTION public.reap_abandoned_pvp_battles(interval, integer) FROM public, anon, authenticated;

-- ── Scheduling ───────────────────────────────────────────────────────────────
-- Every two minutes. A player waiting on an opponent who has already closed
-- their laptop should get an answer in about the time it takes to wonder
-- whether something is broken, not on the next hourly sweep.

DO $do$
BEGIN
  IF to_regnamespace('cron') IS NULL THEN
    RAISE NOTICE 'pg_cron is not installed, so abandoned battles are not reaped. After enabling it run: SELECT cron.schedule(''reap-abandoned-pvp'', ''*/2 * * * *'', ''SELECT public.reap_abandoned_pvp_battles()'');';
    RETURN;
  END IF;

  -- Re-running this migration must not stack duplicate jobs.
  EXECUTE $q$ SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'reap-abandoned-pvp' $q$;
  EXECUTE $q$ SELECT cron.schedule('reap-abandoned-pvp', '*/2 * * * *',
                                   'SELECT public.reap_abandoned_pvp_battles()') $q$;
END
$do$;

NOTIFY pgrst, 'reload schema';
