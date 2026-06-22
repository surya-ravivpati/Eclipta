/**
 * Battle session recording and ghost replay retrieval.
 *
 * Every completed battle is stored in battle_sessions so future players
 * can be matched against real human traces (Ghost PvP tier).
 */
import { supabase } from "@/integrations/supabase/client";
import type { QuestionRecord } from "@/components/battles/types";
import type { ArchetypeId } from "@/components/battles/types";

export interface GhostSession {
  id: string;
  archetype: ArchetypeId;
  won: boolean;
  rating: number;
  totalQuestions: number;
  correctAnswers: number;
  bestStreak: number;
  /** Original player's username, when available. */
  username: string | null;
  /** Ordered records — action chosen, outcome, and time taken per turn. */
  questionRecords: Array<{
    action: string;
    correct: boolean;
    timeSpent: number;
  }>;
}

/** Persist a completed battle so it becomes available as ghost replay data. */
export async function recordBattleSession(params: {
  archetype: ArchetypeId;
  won: boolean;
  rating: number;
  records: QuestionRecord[];
  bestStreak: number;
  opponentType?: "live" | "ghost" | "bot";
}): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Server-side RPC validates and clamps fields; clients can't fabricate
  // rating/correct values that bypass the matchmaking pipeline.
  const { data, error } = await supabase.rpc("record_battle_session" as any, {
    p_archetype:        params.archetype,
    p_won:              params.won,
    p_rating:           params.rating,
    p_total_questions:  params.records.length,
    p_correct_answers:  params.records.filter(r => r.correct).length,
    p_best_streak:      params.bestStreak,
    p_question_records: params.records.map(r => ({
      action:    r.action,
      correct:   r.correct,
      timeSpent: r.timeSpent,
    })),
    p_opponent_type:    params.opponentType ?? "unknown",
  });
  if (error) {
    console.warn("recordBattleSession failed", error);
    return null;
  }
  return (data as string | null) ?? null;
}

/**
 * Fetch a real-player ghost session within ±200 rating of the player.
 * Returns null if no usable session exists OR if the row's question_records
 * is empty — we'd rather drop to the bot tier than fake a "ghost" with no
 * actual recorded behaviour to replay.
 */
export async function fetchGhostSession(playerRating: number): Promise<GhostSession | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await supabase.rpc("get_ghost_session" as any, {
    p_player_rating: playerRating,
  });
  if (error) {
    console.warn("fetchGhostSession failed", error);
    return null;
  }
  if (!data) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;
  const records = (d.question_records ?? []) as GhostSession["questionRecords"];
  if (!Array.isArray(records) || records.length === 0) {
    // Authenticity guard: an empty record set isn't a ghost, it's a stub.
    // Refusing it here drops us cleanly through the matchmaker to the bot
    // tier instead of silently substituting AI moves under a ghost label.
    return null;
  }

  return {
    id:              d.id,
    archetype:       d.archetype as ArchetypeId,
    won:             d.won,
    rating:          d.rating,
    totalQuestions:  d.total_questions,
    correctAnswers:  d.correct_answers,
    bestStreak:      d.best_streak,
    username:        d.username ?? null,
    questionRecords: records,
  };
}
