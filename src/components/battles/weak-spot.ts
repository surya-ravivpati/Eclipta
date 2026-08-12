import type { QuestionRecord } from "./types";

/**
 * Which topic a finished battle should send the learner to drill.
 *
 * Extracted from BattleReport so the choice can be tested without rendering a
 * report, and so the button that opens Practice and the panel that names the
 * weak spot cannot disagree about what the weak spot is.
 *
 * ── Why not rank by miss *rate* ──────────────────────────────────────────────
 * The obvious ranking — wrong ÷ total, highest first — is wrong at battle
 * scale. A battle is a handful of questions, so a topic seen once and missed
 * once scores 1.00 and beats a topic missed three times out of five. That sends
 * the learner to drill their unluckiest topic rather than their weakest one.
 *
 * Miss *count* leads instead, with rate as the tie-break: three misses is more
 * evidence than one, whatever the denominators. Alphabetical order settles a
 * remaining tie so the same battle always produces the same recommendation.
 */
export interface TopicTally {
  topic: string;
  total: number;
  wrong: number;
  /** Share of this topic's questions the learner got wrong, 0–1. */
  missRate: number;
}

/** Per-topic totals for a battle, in no particular order. */
export function tallyTopics(records: QuestionRecord[]): Map<string, TopicTally> {
  const tallies = new Map<string, TopicTally>();
  for (const r of records) {
    const topic = r.question.topic;
    const t = tallies.get(topic) ?? { topic, total: 0, wrong: 0, missRate: 0 };
    t.total += 1;
    if (!r.correct) t.wrong += 1;
    t.missRate = t.total > 0 ? t.wrong / t.total : 0;
    tallies.set(topic, t);
  }
  return tallies;
}

/**
 * Topics worth drilling, worst first. Topics the learner got entirely right
 * are omitted — there is nothing to practise there.
 */
export function rankWeakTopics(records: QuestionRecord[]): TopicTally[] {
  return [...tallyTopics(records).values()]
    .filter((t) => t.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || b.missRate - a.missRate || a.topic.localeCompare(b.topic));
}

/**
 * The single topic to drill, or null when the learner missed nothing.
 *
 * Null is a real outcome, not a failure: a clean battle has no weak spot, and
 * the caller should say so rather than inventing one.
 */
export function pickDrillTopic(records: QuestionRecord[]): string | null {
  return rankWeakTopics(records)[0]?.topic ?? null;
}
