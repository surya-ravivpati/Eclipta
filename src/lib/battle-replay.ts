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

  const { data } = await supabase.from("battle_sessions" as any).insert({
    user_id:          user.id,
    archetype:        params.archetype,
    won:              params.won,
    rating:           params.rating,
    total_questions:  params.records.length,
    correct_answers:  params.records.filter(r => r.correct).length,
    best_streak:      params.bestStreak,
    question_records: params.records.map(r => ({
      action:    r.action,
      correct:   r.correct,
      timeSpent: r.timeSpent,
    })),
    opponent_type:    params.opponentType ?? "unknown",
  }).select("id").maybeSingle();

  return (data as { id?: string } | null)?.id ?? null;
}

/** Fetch a real player ghost session within ±150 rating of the player. */
export async function fetchGhostSession(playerRating: number): Promise<GhostSession | null> {
  const { data } = await supabase.rpc("get_ghost_session" as any, {
    p_player_rating: playerRating,
  });
  if (!data) return null;

  const d = data as any;
  return {
    id:              d.id,
    archetype:       d.archetype as ArchetypeId,
    won:             d.won,
    rating:          d.rating,
    totalQuestions:  d.total_questions,
    correctAnswers:  d.correct_answers,
    bestStreak:      d.best_streak,
    username:        d.username ?? null,
    questionRecords: (d.question_records ?? []) as GhostSession["questionRecords"],
  };
}
