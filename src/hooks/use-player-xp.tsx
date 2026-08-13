/**
 * Hooks: live player XP and owned-Ecliptar tracking from Supabase.
 *
 * Same shape as src/hooks/use-player-rating.tsx - TanStack Query owns the
 * fetch/cache/loading state, a Realtime subscription invalidates the query
 * when a battle or course completion changes the row server-side, and
 * window-focus refetching (Query's default) replaces the old manual
 * visibilitychange listener.
 *
 * The previous `usePlayerXp` wrote a Realtime UPDATE payload's `xp` field
 * straight into state as a micro-optimisation, skipping a round trip. That
 * path is gone: invalidate-then-refetch is simpler, matches every other
 * migrated hook, and cannot drift from what the query function actually
 * fetches if that ever grows beyond a single column.
 */
import { useEffect } from "react";
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { getOwnedEcliptarSlugs, getUserXp } from "@/repositories/profile";

function playerXpQueryKey(userId: string) {
  return ["player-xp", userId] as const;
}

export function usePlayerXp() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: user ? playerXpQueryKey(user.id) : ["player-xp", "signed-out"],
    queryFn: user ? () => getUserXp(user.id) : skipToken,
  });

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`xp:${user.id}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "user_profiles",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: playerXpQueryKey(user.id) });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  return {
    xp: user ? (query.data ?? 0) : 0,
    loading: user ? query.isLoading : false,
    refresh: () => void query.refetch(),
  };
}

function ownedEcliptarsQueryKey(userId: string) {
  return ["owned-ecliptars", userId] as const;
}

export function useOwnedEcliptars() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: user ? ownedEcliptarsQueryKey(user.id) : ["owned-ecliptars", "signed-out"],
    queryFn: user ? () => getOwnedEcliptarSlugs(user.id) : skipToken,
  });

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`ecliptars:${user.id}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_ecliptars", filter: `user_id=eq.${user.id}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ownedEcliptarsQueryKey(user.id) });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  return {
    slugs: user ? new Set(query.data ?? []) : new Set<string>(),
    loading: user ? query.isLoading : false,
    refresh: () => void query.refetch(),
  };
}
