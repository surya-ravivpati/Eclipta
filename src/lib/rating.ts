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
    .from("player_ratings" as any)
    .select("rating, peak_rating, wins, losses")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) return { rating: 1000, peakRating: 1000, wins: 0, losses: 0 };
  const d = data as any;
  return {
    rating:     d.rating      ?? 1000,
    peakRating: d.peak_rating ?? 1000,
    wins:       d.wins        ?? 0,
    losses:     d.losses      ?? 0,
  };
}

/** Call after every live or ghost match. Returns the new rating. */
export async function updateRating(opponentRating: number, won: boolean): Promise<number> {
  const { data } = await supabase.rpc("update_pvp_rating" as any, {
    p_opponent_rating: opponentRating,
    p_won: won,
  });
  return (data as number | null) ?? 1000;
}

/** Human-readable tier name for a given ELO rating. */
export function ratingToTier(rating: number): string {
  if (rating >= 2000) return "Unreal";
  if (rating >= 1800) return "Champion";
  if (rating >= 1600) return "Platinum";
  if (rating >= 1400) return "Diamond";
  if (rating >= 1200) return "Gold";
  if (rating >= 1050) return "Silver";
  return "Bronze";
}

/** Signed delta string e.g. "+18" or "-12". */
export function formatRatingDelta(oldRating: number, newRating: number): string {
  const d = newRating - oldRating;
  return d >= 0 ? `+${d}` : `${d}`;
}
