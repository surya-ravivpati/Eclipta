/**
 * The battles domain's one door into the database. Nothing outside this
 * file calls `supabase.from()` or `supabase.rpc()` for these tables - see
 * AGENTS.md's "Database" section. Queries still go through the Supabase
 * client rather than a direct Postgres connection, so Row Level Security
 * keeps applying; Drizzle (src/db/schema/battles.ts) supplies the row types.
 */
import type { InferSelectModel } from "drizzle-orm";
import { supabase } from "@/integrations/supabase/client";
import type { playerRatings, StoredQuestionRecord } from "@/db/schema/battles";
import type { ArchetypeId } from "@/components/battles/types";
import type { Json, PvpMatchAttempt } from "@/integrations/supabase/database";
import type { ArchetypeMastery } from "@/lib/archetype-mastery";

export type PlayerRatingRow = InferSelectModel<typeof playerRatings>;

/** A player who has never completed a rated match has no row yet - not an error. */
export async function getPlayerRating(userId: string): Promise<PlayerRatingRow | null> {
  const { data, error } = await supabase
    .from("player_ratings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

/** A player's ladder standing, with W/L derived the same way the board derives it. */
export interface PlayerStanding {
  rating: number;
  peakRating: number;
  wins: number;
  losses: number;
  /** True once a rating row exists - i.e. the player has entered the ladder. */
  ranked: boolean;
}

/**
 * Read a player's standing through `get_player_standing`.
 *
 * Deliberately not a `player_ratings` select: the `wins`/`losses` columns on
 * that table are counters that the leaderboard stopped trusting, and reading
 * them here is what made the Trophy Road card disagree with the board. The RPC
 * derives both from the match rows, so every surface shows one number.
 */
export async function getPlayerStanding(userId: string): Promise<PlayerStanding | null> {
  const { data, error } = await supabase.rpc("get_player_standing", { p_user: userId });
  if (error) throw new Error(error.message);
  const d = data as {
    rating?: number;
    peak_rating?: number;
    wins?: number;
    losses?: number;
    ranked?: boolean;
  } | null;
  if (!d) return null;
  return {
    rating: d.rating ?? 1000,
    peakRating: d.peak_rating ?? 1000,
    wins: d.wins ?? 0,
    losses: d.losses ?? 0,
    ranked: d.ranked ?? false,
  };
}

// -- Matchmaking -------------------------------------------------------------

/**
 * Joins the live PvP queue. Rating and username are read server-side from
 * authoritative tables inside the SECURITY DEFINER RPC, not supplied by the
 * caller - a client can't spoof either.
 */
export async function enqueuePvpRpc(archetype: ArchetypeId): Promise<void> {
  const { error } = await supabase.rpc("enqueue_pvp", { p_archetype: archetype });
  if (error) throw new Error(error.message);
}

/** Sends a direct PvP challenge to another player. */
export async function createPvpChallengeRpc(
  challengedId: string,
  archetype: ArchetypeId,
): Promise<void> {
  const { error } = await supabase.rpc("create_pvp_challenge", {
    p_challenged_id: challengedId,
    p_archetype: archetype,
  });
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
 * `find_pvp_match` only tells the challenger they've been matched - the
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

// -- Battle session recording ------------------------------------------------

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
 * Persists a completed battle. The server-side RPC validates and clamps every
 * field - a client can't fabricate a rating or correct-answer count that
 * bypasses the matchmaking pipeline. Returns null (rather than throwing) on
 * failure: recording is best-effort and must never block the player from
 * seeing their own result.
 */
export async function recordBattleSessionRpc(
  payload: RecordBattleSessionPayload,
): Promise<string | null> {
  // `StoredQuestionRecord[]` is a closed object shape with no index
  // signature, so it can never satisfy `extends Json` under TypeScript's
  // rules even though every value it can hold is valid JSON - the same gap
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

// -- Concept-mastery evidence stream -----------------------------------------

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

// -- Archetype mastery --------------------------------------------------------

const MASTERY_COLUMNS =
  "archetype,battles_played,wins,best_streak,total_correct,total_questions,perfect_battles";

/**
 * Atomically upserts one battle into archetype_mastery via the SECURITY
 * DEFINER RPC (avoids the 1-row-must-exist constraint). Best-effort, like
 * recordBattleSessionRpc above: a failed mastery update must never block the
 * player from seeing their own battle result.
 */
export async function recordArchetypeMasteryRpc(
  archetype: ArchetypeId,
  won: boolean,
  bestStreak: number,
  correct: number,
  total: number,
  perfect: boolean,
): Promise<void> {
  const { error } = await supabase.rpc("record_battle_mastery", {
    p_archetype: archetype,
    p_won: won,
    p_best_streak: bestStreak,
    p_correct: correct,
    p_total: total,
    p_perfect: perfect,
  });
  if (error) console.warn("recordArchetypeMasteryRpc failed", error);
}

/** Fetch one archetype's mastery row for a user. Returns null if never recorded - not an error. */
export async function getArchetypeMastery(
  userId: string,
  archetype: ArchetypeId,
): Promise<ArchetypeMastery | null> {
  const { data, error } = await supabase
    .from("archetype_mastery")
    .select(MASTERY_COLUMNS)
    .eq("user_id", userId)
    .eq("archetype", archetype)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

/** Fetch every archetype mastery row a user has. */
export async function getAllArchetypeMastery(userId: string): Promise<ArchetypeMastery[]> {
  const { data, error } = await supabase
    .from("archetype_mastery")
    .select(MASTERY_COLUMNS)
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** How a bot battle moved the ladder, once the server has judged it. */
export interface BotBattleOutcome {
  /** False when too few verified answers came back to judge the session. */
  rated: boolean;
  /** The server's verdict, not the browser's. Absent on an unrated session. */
  won: boolean | null;
  ratingAfter: number | null;
  ratingDelta: number;
}

/**
 * Apply a finished bot battle to the ladder.
 *
 * The outcome is recomputed from `battle_question_challenges` - the questions
 * the server issued and marked itself - rather than taken from the browser's
 * account of who won. That is the whole reason this exists: the older
 * `complete_bot_battle` trusted a client-written `won` flag, which made a
 * forged victory worth free rating, and was revoked rather than fixed.
 *
 * No session id is passed because none exists to pass. Client-minted sessions
 * were revoked for the same reason, so the routine writes its own row from what
 * it verified - which is also what puts bot results back in front of
 * `player_wl`, the shared win/loss derivation.
 */
export async function completeBotBattleVerified(
  challengeIds: string[],
  archetype: string,
  ecliptarSlug: string | null,
): Promise<BotBattleOutcome> {
  const { data, error } = await supabase.rpc("complete_bot_battle_verified", {
    p_challenge_ids: challengeIds,
    p_archetype: archetype,
    p_ecliptar_slug: ecliptarSlug,
  });
  if (error) throw new Error(error.message);

  return {
    rated: data?.rated === true,
    won: typeof data?.won === "boolean" ? data.won : null,
    ratingAfter: typeof data?.rating_after === "number" ? data.rating_after : null,
    ratingDelta: typeof data?.rating_delta === "number" ? data.rating_delta : 0,
  };
}
