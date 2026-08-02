/**
 * The battles domain's one door into the database. Nothing outside this
 * file calls `supabase.from()` or `supabase.rpc()` for these tables — see
 * AGENTS.md's "Database" section. Queries still go through the Supabase
 * client rather than a direct Postgres connection, so Row Level Security
 * keeps applying; Drizzle (src/db/schema/battles.ts) supplies the row types.
 */
import type { InferSelectModel } from "drizzle-orm";
import { supabase } from "@/integrations/supabase/client";
import type { playerRatings, StoredQuestionRecord } from "@/db/schema/battles";
import type { ArchetypeId } from "@/components/battles/types";
import type { Json, PvpMatchAttempt } from "@/integrations/supabase/database";

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

// ── Matchmaking ─────────────────────────────────────────────────────────────

/**
 * Joins the live PvP queue. Rating and username are read server-side from
 * authoritative tables inside the SECURITY DEFINER RPC, not supplied by the
 * caller — a client can't spoof either.
 */
export async function enqueuePvpRpc(archetype: ArchetypeId): Promise<void> {
  const { error } = await supabase.rpc("enqueue_pvp", { p_archetype: archetype });
  if (error) throw new Error(error.message);
}

export async function leavePvpQueue(userId: string): Promise<void> {
  const { error } = await supabase.from("pvp_queue").delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** Atomically matches the caller with a queued opponent, or reports no match yet. */
export async function findPvpMatchRpc(
  archetype: ArchetypeId,
  rating: number,
): Promise<PvpMatchAttempt> {
  const { data, error } = await supabase.rpc("find_pvp_match", {
    p_archetype: archetype,
    p_rating: rating,
  });
  if (error) throw new Error(error.message);
  return data;
}

/** The subset of a pvp_battles row the matchmaker's opponent-side poll actually reads. */
export interface ActivePvpBattle {
  id: string;
  challenger_id: string;
  opponent_id: string;
  challenger_archetype: string;
  opponent_archetype: string;
  status: string;
}

/**
 * `find_pvp_match` only tells the challenger they've been matched — the
 * opponent is removed from the queue silently and must discover the match by
 * polling this instead. Scoped to the last 30 seconds so a stale, long-since-
 * resolved battle can never be picked up by a new search.
 */
export async function findActivePvpBattleForUser(userId: string): Promise<ActivePvpBattle | null> {
  const since = new Date(Date.now() - 30_000).toISOString();
  const { data, error } = await supabase
    .from("pvp_battles")
    .select("id,challenger_id,opponent_id,challenger_archetype,opponent_archetype,status")
    .or(`challenger_id.eq.${userId},opponent_id.eq.${userId}`)
    .eq("status", "active")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw new Error(error.message);
  return data?.[0] ?? null;
}

// ── Battle session recording and Ghost replay ───────────────────────────────

export interface RecordBattleSessionPayload {
  p_archetype: ArchetypeId;
  p_won: boolean;
  p_rating: number;
  p_total_questions: number;
  p_correct_answers: number;
  p_best_streak: number;
  p_question_records: StoredQuestionRecord[];
  p_opponent_type: string;
  /** Ecliptar the run was fought with; NULL when none was equipped. */
  p_ecliptar_slug?: string | null;
}

/**
 * Persists a completed battle so it becomes available as Ghost replay data.
 * The server-side RPC validates and clamps every field — a client can't
 * fabricate a rating or correct-answer count that bypasses the matchmaking
 * pipeline. Returns null (rather than throwing) on failure: recording a
 * finished battle for future ghosts is best-effort and must never block the
 * player from seeing their own result.
 */
export async function recordBattleSessionRpc(
  payload: RecordBattleSessionPayload,
): Promise<string | null> {
  // `StoredQuestionRecord[]` is a closed object shape with no index
  // signature, so it can never satisfy `extends Json` under TypeScript's
  // rules even though every value it can hold is valid JSON — the same gap
  // documented in src/db/schema/battles.verify.ts. The RPC's own Postgres
  // signature accepts jsonb regardless of this array's declared TS shape.
  const { data, error } = await supabase.rpc("record_battle_session", {
    ...payload,
    p_question_records: payload.p_question_records as unknown as Json,
  });
  if (error) {
    console.warn("recordBattleSession failed", error);
    return null;
  }
  return data ?? null;
}

// ── Concept-mastery evidence stream ─────────────────────────────────────────

export interface BattleQuestionRecordInsert {
  user_id: string;
  concept: string;
  subject: string;
  difficulty: string;
  correct: boolean;
  time_spent: number | null;
}

/** Appends one battle's answered questions to the evidence stream src/lib/concept-mastery.ts aggregates from. */
export async function insertBattleQuestionRecords(
  rows: BattleQuestionRecordInsert[],
): Promise<void> {
  const { error } = await supabase.from("battle_question_records").insert(rows);
  if (error) throw new Error(error.message);
}

/** The raw ghost session row shape the RPC returns, before src/lib/battle-replay.ts reshapes it. */
export interface RawGhostSession {
  id: string;
  archetype: string;
  won: boolean;
  rating: number;
  total_questions: number;
  correct_answers: number;
  best_streak: number;
  username: string | null;
  question_records: unknown;
  /** NULL for sessions recorded before the slug was captured. */
  ecliptar_slug?: string | null;
}

/**
 * Fetches a real-player Ghost session within ±200 rating of the given
 * rating. Returns null (rather than throwing) on failure — no ghost is
 * available is an ordinary outcome the matchmaker falls back from, not an
 * error condition.
 */
export async function getGhostSessionRpc(playerRating: number): Promise<RawGhostSession | null> {
  const { data, error } = await supabase.rpc("get_ghost_session", {
    p_player_rating: playerRating,
  });
  if (error) {
    console.warn("fetchGhostSession failed", error);
    return null;
  }
  return data;
}
