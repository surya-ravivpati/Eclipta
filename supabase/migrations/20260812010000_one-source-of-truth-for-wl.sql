-- One source of truth for a player's win/loss record.
--
-- The bug this fixes is visible to the player: the same account showed one
-- record on the Trophy Road standing card and a different one on the PvP
-- leaderboard.
--
-- They disagreed because they read different things. `player_ratings.wins` and
-- `.losses` are counters, incremented as matches resolve, and the Trophy Road
-- card and profile read those. The leaderboard stopped trusting them — see
-- 20260517214303_leaderboard-derives-wl-from-truth.sql — and started deriving
-- the record from the battle rows themselves. That was the right call. What
-- never happened is the other half: nothing moved the *other* surfaces onto the
-- derived numbers, so the counters kept being displayed next to figures
-- computed a different way.
--
-- Deriving in two places would just move the problem, so the derivation lives
-- in `player_wl` and both callers use it.

-- ── The derivation ───────────────────────────────────────────────────────────

/**
 * A player's record, counted from the matches that actually happened.
 *
 * Two sources, because a completed match is recorded in one of two shapes:
 *
 *   pvp_battles     — a live match against another person, one row per match,
 *                     counted once for each participant.
 *   battle_sessions — a match resolved against the server for one player, and
 *                     only once `rating_applied` is true, which is what marks a
 *                     session as having been folded into the ladder.
 *
 * `opponent_type IN ('ghost','bot')` keeps historical ghost results even though
 * Ghost PvP was removed in 20260812000000. Those matches genuinely happened and
 * genuinely counted at the time; dropping them would silently rewrite people's
 * records to make the feature removal look tidier.
 */
CREATE OR REPLACE FUNCTION public.player_wl(p_user uuid)
RETURNS TABLE (wins integer, losses integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT
    coalesce(sum(w), 0)::integer,
    coalesce(sum(l), 0)::integer
  FROM (
    SELECT CASE WHEN winner_id = challenger_id THEN 1 ELSE 0 END AS w,
           CASE WHEN winner_id = challenger_id THEN 0 ELSE 1 END AS l
      FROM public.pvp_battles
     WHERE status = 'completed' AND winner_id IS NOT NULL AND challenger_id = p_user
    UNION ALL
    SELECT CASE WHEN winner_id = opponent_id THEN 1 ELSE 0 END,
           CASE WHEN winner_id = opponent_id THEN 0 ELSE 1 END
      FROM public.pvp_battles
     WHERE status = 'completed' AND winner_id IS NOT NULL AND opponent_id = p_user
    UNION ALL
    SELECT CASE WHEN won THEN 1 ELSE 0 END,
           CASE WHEN won THEN 0 ELSE 1 END
      FROM public.battle_sessions
     WHERE user_id = p_user
       AND rating_applied = true
       AND opponent_type IN ('ghost', 'bot')
  ) e;
$fn$;

-- ── What every surface reads ─────────────────────────────────────────────────

/**
 * Everything the Trophy Road standing card, the profile and the battle header
 * need, in one call, using the same derivation the leaderboard uses.
 *
 * Defaults to the caller. The parameter exists so a future profile page can
 * show someone else's public standing; it is not sensitive (the leaderboard
 * already publishes rating and record), but it is still explicit rather than
 * implicit.
 */
CREATE OR REPLACE FUNCTION public.get_player_standing(p_user uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT jsonb_build_object(
    'user_id', p_user,
    -- A player with no row yet is unrated, not broken: 1000 is the same
    -- starting rating `player_ratings` defaults to.
    'rating', coalesce((SELECT rating FROM public.player_ratings WHERE user_id = p_user), 1000),
    'peak_rating',
      coalesce((SELECT peak_rating FROM public.player_ratings WHERE user_id = p_user), 1000),
    'wins', (SELECT wins FROM public.player_wl(p_user)),
    'losses', (SELECT losses FROM public.player_wl(p_user)),
    'ranked', EXISTS (SELECT 1 FROM public.player_ratings WHERE user_id = p_user)
  );
$fn$;

-- ── The leaderboard, on the same derivation ──────────────────────────────────

/**
 * Rebuilt on `player_wl` so it cannot drift from the standing card again.
 *
 * Two behaviour changes beyond the shared derivation:
 *
 *   1. LEFT JOIN LATERAL, not an inner join on a pre-aggregated CTE. The old
 *      shape dropped anyone whose derived record was empty — including players
 *      who hold a real rating row. Combined with bot battles not currently
 *      marking `rating_applied`, that hid most of the ladder.
 *   2. Rated-but-unplayed players are included and sort last. `games` is
 *      returned so the client can mark them provisional rather than implying a
 *      1000 with no matches behind it means the same as a 1000 that was earned.
 */
CREATE OR REPLACE FUNCTION public.get_pvp_leaderboard(p_limit integer DEFAULT 10)
RETURNS TABLE (
  user_id uuid,
  username text,
  rating integer,
  wins integer,
  losses integer,
  games integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT pr.user_id,
         up.username,
         pr.rating,
         wl.wins,
         wl.losses,
         (wl.wins + wl.losses)::integer AS games
    FROM public.player_ratings pr
    LEFT JOIN public.user_profiles up ON up.user_id = pr.user_id
    CROSS JOIN LATERAL public.player_wl(pr.user_id) wl
   ORDER BY (wl.wins + wl.losses) > 0 DESC,  -- played players first
            pr.rating DESC,
            wl.wins DESC,
            wl.losses ASC,
            pr.updated_at ASC
   LIMIT LEAST(GREATEST(coalesce(p_limit, 10), 1), 100);
$fn$;

-- ── Grants ───────────────────────────────────────────────────────────────────
-- `player_wl` is an internal helper: it is only ever reached through the two
-- functions above, both of which are SECURITY DEFINER and already scoped.

REVOKE ALL ON FUNCTION public.player_wl(uuid) FROM public;

REVOKE ALL ON FUNCTION public.get_player_standing(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_player_standing(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_pvp_leaderboard(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_pvp_leaderboard(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
