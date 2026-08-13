/**
 * Battle session recording.
 *
 * Every completed battle is stored in `battle_sessions`. Nothing replays those
 * rows any more - Ghost PvP was removed - but the record is still the source of
 * the weekly report's battle figures and the per-question history a post-battle
 * review needs, so it is written exactly as before.
 */
import { supabase } from "@/integrations/supabase/client";
import type { QuestionRecord } from "@/components/battles/types";
import type { ArchetypeId } from "@/components/battles/types";
import { recordBattleSessionRpc } from "@/repositories/battles";

/** Persist a completed battle. */
export async function recordBattleSession(params: {
  archetype: ArchetypeId;
  won: boolean;
  rating: number;
  records: QuestionRecord[];
  bestStreak: number;
  opponentType?: "live" | "bot";
  /** Which creature this run was actually fought with. */
  ecliptarSlug?: string | null;
}): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Server-side RPC validates and clamps fields; clients can't fabricate
  // rating/correct values that bypass the matchmaking pipeline.
  return recordBattleSessionRpc({
    p_archetype: params.archetype,
    p_won: params.won,
    p_rating: params.rating,
    p_total_questions: params.records.length,
    p_correct_answers: params.records.filter((r) => r.correct).length,
    p_best_streak: params.bestStreak,
    p_ecliptar_slug: params.ecliptarSlug ?? null,
    p_question_records: params.records.map((r) => ({
      action: r.action,
      correct: r.correct,
      timeSpent: r.timeSpent,
    })),
    p_opponent_type: params.opponentType ?? "unknown",
  });
}
