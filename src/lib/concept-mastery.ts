/**
 * Shared concept-mastery store access (docs/battle-redesign.md §17).
 *
 * Battles WRITE here (every answered question is an observation); Practice Weak
 * Spots READS here (struggling/developing concepts become coaching targets).
 * Courses' readiness engine and Luna's memory can read the same store.
 *
 * Every call is best-effort: if the migration hasn't run, writes/reads no-op
 * rather than throwing, so the battle loop and Practice degrade gracefully.
 */

import { supabase } from "@/integrations/supabase/client";

export type MasteryState = "struggling" | "developing" | "solid" | "mastered";

export interface ConceptOutcome {
  concept: string;
  subject: string;
  difficulty: string; // easy|medium|hard
  correct: boolean;
  timeSpent?: number;
}

export interface WeakConcept {
  concept: string;
  subject: string;
  state: MasteryState;
  confidence: number;
  evidenceCount: number;
}

/** Map a rolling accuracy + evidence count to a mastery state. */
export function deriveState(ratio: number, evidence: number): MasteryState {
  // Until there's enough evidence, never promote past "developing".
  if (evidence < 3) return ratio < 0.5 ? "struggling" : "developing";
  if (ratio < 0.45) return "struggling";
  if (ratio < 0.7) return "developing";
  if (ratio < 0.9) return "solid";
  return "mastered";
}

function nextReviewISO(state: MasteryState): string {
  const days = state === "struggling" ? 1 : state === "developing" ? 3 : state === "solid" ? 7 : 21;
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

/**
 * Persist a batch of question outcomes (one battle / practice set) and fold them
 * into the per-concept mastery aggregates. Fire-and-forget.
 */
export async function recordOutcomes(userId: string, outcomes: ConceptOutcome[]): Promise<void> {
  if (!userId || outcomes.length === 0) return;
  try {
    // 1) Append the raw evidence stream.
    await supabase.from("battle_question_records").insert(
      outcomes.map((o) => ({
        user_id: userId,
        concept: o.concept,
        subject: o.subject,
        difficulty: o.difficulty,
        correct: o.correct,
        time_spent: o.timeSpent ?? null,
      })),
    );

    // 2) Aggregate this batch per concept.
    const byConcept = new Map<string, { subject: string; total: number; correct: number }>();
    for (const o of outcomes) {
      const e = byConcept.get(o.concept) ?? { subject: o.subject, total: 0, correct: 0 };
      e.total++;
      if (o.correct) e.correct++;
      byConcept.set(o.concept, e);
    }
    const concepts = [...byConcept.keys()];

    // 3) Merge onto existing mastery rows (read-then-upsert; best-effort).
    const { data: existing } = await supabase
      .from("concept_mastery")
      .select("concept,evidence_count,correct_count")
      .eq("user_id", userId)
      .in("concept", concepts);
    const prevByConcept = new Map((existing ?? []).map((r) => [r.concept, r]));

    const rows = concepts.map((concept) => {
      const agg = byConcept.get(concept)!;
      const prev = prevByConcept.get(concept);
      const evidence = (prev?.evidence_count ?? 0) + agg.total;
      const correct = (prev?.correct_count ?? 0) + agg.correct;
      const ratio = evidence > 0 ? correct / evidence : 0;
      const state = deriveState(ratio, evidence);
      return {
        user_id: userId,
        concept,
        subject: agg.subject,
        evidence_count: evidence,
        correct_count: correct,
        confidence: Math.round(ratio * 100) / 100,
        state,
        last_seen: new Date().toISOString(),
        next_review: nextReviewISO(state),
      };
    });
    await supabase.from("concept_mastery").upsert(rows, { onConflict: "user_id,concept" });
  } catch (e) {
    console.warn("concept_mastery write skipped:", e);
  }
}

/** The learner's weakest concepts (struggling/developing), weakest first. */
export async function getWeakConcepts(userId: string, limit = 8): Promise<WeakConcept[]> {
  if (!userId) return [];
  try {
    const { data } = await supabase
      .from("concept_mastery")
      .select("concept,subject,state,confidence,evidence_count")
      .eq("user_id", userId)
      .in("state", ["struggling", "developing"])
      .order("confidence", { ascending: true })
      .limit(limit);
    return (data ?? []).map((r) => ({
      concept: r.concept,
      subject: r.subject,
      state: r.state as MasteryState,
      confidence: r.confidence,
      evidenceCount: r.evidence_count,
    }));
  } catch {
    return [];
  }
}
