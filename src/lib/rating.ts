/**
 * ELO-style player rating system for competitive battles.
 * Only live and ghost matches affect rating — bots never do.
 */
import { supabase } from "@/integrations/supabase/client";

export interface PlayerRating {
  rating: number;
  peakRating: number;
  wins: number;
  losses: number;
}

export async function fetchPlayerRating(): Promise<PlayerRating> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { rating: 1000, peakRating: 1000, wins: 0, losses: 0 };

  const { data } = await supabase
    .from("player_ratings")
    .select("rating, peak_rating, wins, losses")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) return { rating: 1000, peakRating: 1000, wins: 0, losses: 0 };
  return {
    rating:     data.rating      ?? 1000,
    peakRating: data.peak_rating ?? 1000,
    wins:       data.wins        ?? 0,
    losses:     data.losses      ?? 0,
  };
}

/** Complete a recorded Ghost PvP battle exactly once and return the authoritative rating result. */
export async function completeGhostBattle(sessionId: string, opponentRating: number): Promise<{ ratingAfter: number; ratingDelta: number }> {
  const { data, error } = await supabase.rpc("complete_ghost_battle", {
    p_session_id: sessionId,
    p_opponent_rating: opponentRating,
  });
  if (error) throw error;
  return {
    ratingAfter: data?.rating_after ?? 1000,
    ratingDelta: data?.rating_delta ?? 0,
  };
}

/** Human-readable tier name for a given ELO rating. */
export function ratingToTier(rating: number): string {
  return ratingLeague(rating).name;
}

/**
 * Competitive leagues on the rating ladder. These are the *seasonal* standing
 * (gain/loss) — distinct from the Trophy Road's permanent XP tiers, but they
 * deliberately share the same vocabulary and color tokens (`--tr-<id>`) so the
 * player reads one world across two axes. Floors double as the league gates
 * referenced in the redesign blueprint (docs/trophy-road-redesign.md).
 */
export interface RatingLeague {
  /** matches the CSS color token `--tr-<id>` and TierId vocabulary */
  id: "bronze" | "silver" | "gold" | "diamond" | "platinum" | "champion" | "unreal";
  name: string;
  /** lowest rating in this league */
  floor: number;
  /** floor of the next league, or null at the top */
  ceiling: number | null;
}

const LEAGUES: RatingLeague[] = [
  { id: "bronze",   name: "Bronze",   floor: 0,    ceiling: 1050 },
  { id: "silver",   name: "Silver",   floor: 1050, ceiling: 1200 },
  { id: "gold",     name: "Gold",     floor: 1200, ceiling: 1400 },
  { id: "diamond",  name: "Diamond",  floor: 1400, ceiling: 1600 },
  { id: "platinum", name: "Platinum", floor: 1600, ceiling: 1800 },
  { id: "champion", name: "Champion", floor: 1800, ceiling: 2000 },
  { id: "unreal",   name: "Unreal",   floor: 2000, ceiling: null },
];

/** The competitive league a rating currently sits in. */
export function ratingLeague(rating: number): RatingLeague {
  for (let i = LEAGUES.length - 1; i >= 0; i--) {
    if (rating >= LEAGUES[i].floor) return LEAGUES[i];
  }
  return LEAGUES[0];
}

/** Progress (0–1) through the current league, and points to the next gate. */
export function leagueProgress(rating: number): { pct: number; toNext: number | null; next: RatingLeague | null } {
  const league = ratingLeague(rating);
  if (league.ceiling === null) return { pct: 1, toNext: null, next: null };
  const span = league.ceiling - league.floor;
  const pct = Math.max(0, Math.min(1, (rating - league.floor) / span));
  const next = LEAGUES[LEAGUES.findIndex(l => l.id === league.id) + 1] ?? null;
  return { pct, toNext: league.ceiling - rating, next };
}

/** Signed delta string e.g. "+18" or "-12". */
export function formatRatingDelta(oldRating: number, newRating: number): string {
  const d = newRating - oldRating;
  return d >= 0 ? `+${d}` : `${d}`;
}
