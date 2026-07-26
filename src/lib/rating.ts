/**
 * ELO-style player rating system for competitive battles.
 * Only live and ghost matches affect rating — bots never do.
 */
import { supabase } from "@/integrations/supabase/client";
import { completeGhostBattleRpc, getPlayerRating } from "@/repositories/battles";
import { RATING_LEAGUES, type RatingLeague } from "@/config/battle-tuning";

export type { RatingLeague };

export interface PlayerRating {
  rating: number;
  peakRating: number;
  wins: number;
  losses: number;
}

const UNRATED: PlayerRating = { rating: 1000, peakRating: 1000, wins: 0, losses: 0 };

export async function fetchPlayerRating(): Promise<PlayerRating> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return UNRATED;

  const row = await getPlayerRating(user.id);
  if (!row) return UNRATED;

  return {
    rating: row.rating,
    peakRating: row.peak_rating,
    wins: row.wins,
    losses: row.losses,
  };
}

/** Complete a recorded Ghost PvP battle exactly once and return the authoritative rating result. */
export async function completeGhostBattle(
  sessionId: string,
  opponentRating: number,
): Promise<{ ratingAfter: number; ratingDelta: number }> {
  return completeGhostBattleRpc(sessionId, opponentRating);
}

/** Human-readable tier name for a given ELO rating. */
export function ratingToTier(rating: number): string {
  return ratingLeague(rating).name;
}

/** The competitive league a rating currently sits in. See src/config/battle-tuning.ts for the league table itself. */
export function ratingLeague(rating: number): RatingLeague {
  for (let i = RATING_LEAGUES.length - 1; i >= 0; i--) {
    const league = RATING_LEAGUES[i];
    if (league && rating >= league.floor) return league;
  }
  const bronze = RATING_LEAGUES[0];
  if (!bronze) throw new Error("RATING_LEAGUES must have at least one league");
  return bronze;
}

/** Progress (0–1) through the current league, and points to the next gate. */
export function leagueProgress(rating: number): {
  pct: number;
  toNext: number | null;
  next: RatingLeague | null;
} {
  const league = ratingLeague(rating);
  if (league.ceiling === null) return { pct: 1, toNext: null, next: null };
  const span = league.ceiling - league.floor;
  const pct = Math.max(0, Math.min(1, (rating - league.floor) / span));
  const next = RATING_LEAGUES[RATING_LEAGUES.findIndex((l) => l.id === league.id) + 1] ?? null;
  return { pct, toNext: league.ceiling - rating, next };
}

/** Signed delta string e.g. "+18" or "-12". */
export function formatRatingDelta(oldRating: number, newRating: number): string {
  const d = newRating - oldRating;
  return d >= 0 ? `+${d}` : `${d}`;
}
