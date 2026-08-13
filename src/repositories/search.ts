import { supabase } from "@/integrations/supabase/client";
import type { SearchKind } from "@/lib/search/query";

/**
 * Search data access. One RPC per concern, all of it server-ranked - see
 * migration 20260801020000 for why the ranking is not done here.
 */

export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle: string | null;
  url: string;
  score: number;
  /** True when the hit is the caller's own, or from someone they follow. */
  personal: boolean;
}

export async function globalSearch(
  query: string,
  kinds: SearchKind[],
  limit = 20,
): Promise<SearchHit[]> {
  const { data, error } = await supabase.rpc("global_search", {
    p_query: query,
    p_kinds: kinds.length > 0 ? kinds : null,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as SearchHit[];
}

export interface RecentSearch {
  query: string;
  chosen_kind: string | null;
  chosen_id: string | null;
  created_at: string;
}

/** Recents come from the server, so they follow the user between devices. */
export async function getRecentSearches(limit = 8): Promise<RecentSearch[]> {
  const { data, error } = await supabase
    .from("search_history")
    .select("query, chosen_kind, chosen_id, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/**
 * Record a search, optionally with what the user opened from it.
 *
 * Fire-and-forget: a failed write must never delay navigation, and a lost
 * history row costs the user nothing.
 */
export function recordSearch(query: string, chosenKind?: string, chosenId?: string): void {
  void supabase
    .rpc("record_search", {
      p_query: query,
      p_chosen_kind: chosenKind ?? null,
      p_chosen_id: chosenId ?? null,
    })
    .then(() => undefined);
}

export async function clearRecentSearches(): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from("search_history").delete().eq("user_id", user.id);
  if (error) throw error;
}

export interface TrendingSearch {
  query: string;
  hits: number;
}

export async function getTrendingSearches(limit = 6): Promise<TrendingSearch[]> {
  const { data, error } = await supabase.rpc("get_trending_searches", { p_limit: limit });
  if (error) throw error;
  return data ?? [];
}
