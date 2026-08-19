/**
 * Hook: live competitive rating from Supabase `player_ratings`.
 *
 * The Trophy Road's XP track (`usePlayerXp`) is the permanent, loss-proof
 * "Ascent" - it only ever goes up. This hook surfaces the *other* progression
 * spine: the seasonal, gain-and-loss competitive rating that drives PvP and the
 * leaderboard. Keeping both visible on the road is the whole point - skill and
 * dedication are different journeys, and the player should see both at once.
 *
 * TanStack Query owns the fetch, cache, and loading state. A Supabase Realtime
 * subscription is still needed on top: nothing about a normal query tells this
 * client that a *different* process (the battle-completion RPC, running
 * server-side) just changed this row, so a completed battle invalidates the
 * cached query instead of writing to it directly - the next fetch re-reads
 * from the same repository function everything else uses.
 *
 * Window-focus refetching (Query's default) replaces the previous
 * visibilitychange listener - Query's focus manager already reacts to tab
 * visibility changes in a browser environment, so the manual listener this
 * hook used before TanStack Query would now just be redundant.
 */
import { useEffect } from "react";
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { getPlayerStanding } from "@/repositories/battles";
import { UNRATED_RATING } from "@/config/battle-tuning";

export interface PlayerRatingState {
  rating: number;
  peakRating: number;
  wins: number;
  losses: number;
  /** true until the first fetch resolves */
  loading: boolean;
  /** true once a real rating row exists (i.e. the player has battled) */
  ranked: boolean;
}

export interface UsePlayerRatingResult extends PlayerRatingState {
  refresh: () => void;
}

const DEFAULT: Omit<PlayerRatingState, "loading"> = {
  rating: UNRATED_RATING,
  peakRating: UNRATED_RATING,
  wins: 0,
  losses: 0,
  ranked: false,
};

function playerRatingQueryKey(userId: string) {
  return ["player-rating", userId] as const;
}

export function usePlayerRating(): UsePlayerRatingResult {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: user ? playerRatingQueryKey(user.id) : ["player-rating", "signed-out"],
    queryFn: user ? () => getPlayerStanding(user.id) : skipToken,
  });

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`rating:${user.id}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "player_ratings", filter: `user_id=eq.${user.id}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: playerRatingQueryKey(user.id) });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  const refresh = () => void query.refetch();

  if (!user) {
    return { ...DEFAULT, loading: false, refresh };
  }

  const row = query.data;
  if (!row) {
    return { ...DEFAULT, loading: query.isLoading, refresh };
  }

  return {
    rating: row.rating,
    peakRating: row.peakRating,
    wins: row.wins,
    losses: row.losses,
    // "Ranked" now means "has entered the ladder", which the RPC answers from
    // the rating row itself. Deriving it from wins + losses > 0 hid every
    // player who holds a rating but has not finished a match yet.
    ranked: row.ranked,
    loading: query.isLoading,
    refresh,
  };
}
