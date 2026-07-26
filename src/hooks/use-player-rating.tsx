/**
 * Hook: live competitive rating from Supabase `player_ratings`.
 *
 * The Trophy Road's XP track (`usePlayerXp`) is the permanent, loss-proof
 * "Ascent" — it only ever goes up. This hook surfaces the *other* progression
 * spine: the seasonal, gain-and-loss competitive rating that drives PvP and the
 * leaderboard. Keeping both visible on the road is the whole point — skill and
 * dedication are different journeys, and the player should see both at once.
 *
 * Mirrors the realtime pattern in use-player-xp: initial fetch + a Realtime
 * subscription so a freshly-resolved battle updates standing instantly, with a
 * visibility-change refresh as a safety net.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

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

const DEFAULT: Omit<PlayerRatingState, "loading"> = {
  rating: 1000,
  peakRating: 1000,
  wins: 0,
  losses: 0,
  ranked: false,
};

export function usePlayerRating() {
  const [state, setState] = useState<PlayerRatingState>({ ...DEFAULT, loading: true });
  const userIdRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    userIdRef.current = user?.id ?? null;
    if (!user) { setState({ ...DEFAULT, loading: false }); return; }

    const { data } = await supabase
      .from("player_ratings")
      .select("rating, peak_rating, wins, losses")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!data) { setState({ ...DEFAULT, loading: false }); return; }
    setState({
      rating:     data.rating      ?? 1000,
      peakRating: data.peak_rating ?? 1000,
      wins:       data.wins        ?? 0,
      losses:     data.losses      ?? 0,
      ranked:     (data.wins ?? 0) + (data.losses ?? 0) > 0,
      loading:    false,
    });
  }, []);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    (async () => {
      await refresh();
      if (cancelled || !userIdRef.current) return;
      channel = supabase
        .channel(`rating:${userIdRef.current}:${Math.random().toString(36).slice(2)}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "player_ratings", filter: `user_id=eq.${userIdRef.current}` },
          () => { void refresh(); }
        )
        .subscribe();
    })();

    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { ...state, refresh };
}
