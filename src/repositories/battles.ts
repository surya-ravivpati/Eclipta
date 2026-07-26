/**
 * The battles domain's one door into the database. Nothing outside this
 * file calls `supabase.from()` or `supabase.rpc()` for these tables — see
 * AGENTS.md's "Database" section. Queries still go through the Supabase
 * client rather than a direct Postgres connection, so Row Level Security
 * keeps applying; Drizzle (src/db/schema/battles.ts) supplies the row types.
 */
import type { InferSelectModel } from "drizzle-orm";
import { supabase } from "@/integrations/supabase/client";
import type { playerRatings } from "@/db/schema/battles";

export type PlayerRatingRow = InferSelectModel<typeof playerRatings>;

export interface CompleteGhostBattleResult {
  ratingAfter: number;
  ratingDelta: number;
}

/** A player who has never completed a rated match has no row yet — not an error. */
export async function getPlayerRating(userId: string): Promise<PlayerRatingRow | null> {
  const { data, error } = await supabase
    .from("player_ratings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

/** Applies a completed Ghost PvP battle's rating change exactly once, server-side. */
export async function completeGhostBattleRpc(
  sessionId: string,
  opponentRating: number,
): Promise<CompleteGhostBattleResult> {
  const { data, error } = await supabase.rpc("complete_ghost_battle", {
    p_session_id: sessionId,
    p_opponent_rating: opponentRating,
  });

  if (error) throw new Error(error.message);
  return {
    ratingAfter: data?.rating_after ?? 1000,
    ratingDelta: data?.rating_delta ?? 0,
  };
}
