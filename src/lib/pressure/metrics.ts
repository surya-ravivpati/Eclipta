/**
 * Pressure Mode scoring.
 *
 * The brief asks for a Pressure Score built from hesitation, speed, confidence,
 * accuracy and consistency — and, in the same breath, for the experience to feel
 * "supportive rather than punitive". Those pull against each other, so the design
 * resolves the tension explicitly:
 *
 *   - **Accuracy is never punished twice.** Getting a question wrong already
 *     costs accuracy; it does not additionally cost confidence or composure.
 *     Otherwise one bad question compounds into four falling numbers, which is
 *     what makes a practice tool feel like an accusation.
 *   - **Confidence is measured as calibration, not bravado.** The useful signal
 *     is whether a learner's certainty matches their correctness. Being unsure
 *     and wrong is well-calibrated and scores *well* — it means they know what
 *     they don't know, which is the skill that actually transfers to an exam.
 *   - **Hesitation is not slowness.** Thinking for 40 seconds and answering
 *     correctly is good exam technique. Hesitation means *thrash*: revisiting,
 *     changing answers, starting and stopping. That is what breaks under
 *     pressure, and it is separable from deliberate pace.
 *   - **Every sub-score is reported alongside the behaviour that produced it**,
 *     so the review can say "you changed three answers in the last two minutes"
 *     rather than only "composure: 61".
 *
 * All pure functions over a recorded session, so scoring is reproducible: the
 * same events always yield the same score, and the review can recompute it.
 */

export type PressureFormat = "exam" | "interview" | "rapid";

/** One answered (or skipped) question inside a pressure session. */
export interface PressureItem {
  id: string;
  /** Seconds from the question appearing to the answer being committed. */
  timeSpent: number;
  correct: boolean;
  /** Skipped or left blank when time ran out. */
  answered: boolean;
  /** How many times the learner changed their selection before committing. */
  answerChanges: number;
  /** How many times they navigated away and came back to this question. */
  revisits: number;
  /** Self-reported certainty, 0–1, when the format collects it. */
  statedConfidence?: number;
  /** Difficulty 1–10, so speed can be judged against how hard the item was. */
  difficulty: number;
}

/** Something that happened during the session, outside of answering. */
export interface PressureEvent {
  at: number;
  kind:
    | "start"
    | "submit"
    | "answer_change"
    | "revisit"
    | "break_start"
    | "break_end"
    /** Window lost focus — a distraction, not necessarily misconduct. */
    | "focus_lost"
    | "focus_regained"
    /** The learner left fullscreen. Recorded, never punished. */
    | "fullscreen_exit"
    | "distraction_played"
    | "interruption";
}

export interface SubScores {
  /** Share correct, weighted by difficulty. 0–100. */
  accuracy: number;
  /** Pace relative to the time the format allows. 0–100. */
  speed: number;
  /** Freedom from thrash: changes and revisits under time pressure. 0–100. */
  composure: number;
  /** Calibration between stated certainty and correctness. 0–100. */
  calibration: number;
  /** Evenness of performance across the session. 0–100. */
  consistency: number;
}

export interface PressureResult {
  score: number;
  sub: SubScores;
  /** Plain-language observations, each tied to the number it explains. */
  observations: string[];
  /** Where the learner is strongest — always populated, always shown first. */
  strengths: string[];
  /** Actionable next steps. Never more than three: a list of ten is a wall. */
  recommendations: string[];
  /** True when signals suggest the learner is distressed rather than stretched. */
  strainDetected: boolean;
}

/** Per-format weighting. An interview is not scored like a timed exam. */
const WEIGHTS: Record<PressureFormat, SubScores> = {
  // A timed exam rewards getting things right and finishing.
  exam: { accuracy: 0.4, speed: 0.2, composure: 0.15, calibration: 0.1, consistency: 0.15 },
  // An interview is mostly about holding it together and knowing your own
  // certainty; raw speed barely matters.
  interview: { accuracy: 0.3, speed: 0.05, composure: 0.3, calibration: 0.25, consistency: 0.1 },
  // Rapid-fire is speed and evenness.
  rapid: { accuracy: 0.35, speed: 0.35, composure: 0.1, calibration: 0.05, consistency: 0.15 },
};

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

/**
 * Difficulty-weighted accuracy.
 *
 * A correct answer on a level-9 item counts for more than on a level-2 one, so a
 * learner who attempts hard material is not scored below one who plays safe.
 * Unanswered items count as incorrect — the brief asks for a penalty, and on a
 * real exam a blank is a blank — but they are surfaced separately in the
 * observations so "ran out of time" never reads as "didn't know it".
 */
export function accuracyScore(items: PressureItem[]): number {
  if (items.length === 0) return 0;
  let earned = 0;
  let possible = 0;
  for (const it of items) {
    const weight = 0.6 + (it.difficulty / 10) * 0.8;
    possible += weight;
    if (it.correct && it.answered) earned += weight;
  }
  return possible > 0 ? clamp((earned / possible) * 100) : 0;
}

/**
 * Pace against the time allowed, judged per item against a difficulty-adjusted
 * budget rather than a flat average — spending 90s on the hardest question is
 * good technique, not slowness.
 *
 * Answering far *faster* than the budget is not rewarded beyond full marks:
 * rushing is not a skill, and paying for speed encourages guessing.
 */
export function speedScore(items: PressureItem[], secondsPerItem: number): number {
  const answered = items.filter((i) => i.answered);
  if (answered.length === 0) return 0;
  let total = 0;
  for (const it of answered) {
    const budget = secondsPerItem * (0.7 + (it.difficulty / 10) * 0.6);
    const ratio = budget > 0 ? it.timeSpent / budget : 1;
    // At or under budget → full marks. Over budget → falls off, floored at 0.
    total += ratio <= 1 ? 100 : clamp(100 - (ratio - 1) * 70);
  }
  return clamp(total / answered.length);
}

/**
 * Composure: freedom from thrash.
 *
 * Counts answer changes and revisits, *not* time. One change is normal — people
 * reconsider, and penalising that would teach learners to lock in a first guess.
 * The penalty starts from the second change on the same item.
 */
export function composureScore(items: PressureItem[]): number {
  if (items.length === 0) return 100;
  let penalty = 0;
  for (const it of items) {
    penalty += Math.max(0, it.answerChanges - 1) * 6;
    penalty += Math.max(0, it.revisits - 1) * 3;
  }
  return clamp(100 - penalty / items.length);
}

/**
 * Calibration between stated certainty and correctness.
 *
 * Scored as the inverse of Brier-style error, so:
 *   confident + correct   → high
 *   unsure + wrong        → ALSO high (they knew they didn't know)
 *   confident + wrong     → low (the dangerous case, worth surfacing)
 *   unsure + correct      → mid (they knew it but didn't trust themselves)
 *
 * That last case is the one worth coaching, and it is invisible to any metric
 * that treats confidence as a thing to maximise.
 */
export function calibrationScore(items: PressureItem[]): number {
  const rated = items.filter((i) => i.statedConfidence !== undefined && i.answered);
  if (rated.length === 0) return 100; // nothing stated ⇒ nothing to be wrong about
  let error = 0;
  for (const it of rated) {
    const stated = it.statedConfidence ?? 0.5;
    const actual = it.correct ? 1 : 0;
    error += (stated - actual) ** 2;
  }
  return clamp((1 - error / rated.length) * 100);
}

/**
 * Consistency: does performance hold up across the session, or collapse?
 *
 * Compares accuracy in the first and second halves and measures the spread of
 * per-item times. A learner who starts strong and fades is exactly who pressure
 * training is for, so this is reported prominently rather than folded away.
 */
export function consistencyScore(items: PressureItem[]): number {
  if (items.length < 4) return 100;
  const mid = Math.floor(items.length / 2);
  const rate = (list: PressureItem[]) =>
    list.length === 0 ? 0 : list.filter((i) => i.correct && i.answered).length / list.length;
  const drop = Math.max(0, rate(items.slice(0, mid)) - rate(items.slice(mid)));

  const times = items.filter((i) => i.answered).map((i) => i.timeSpent);
  const mean = times.reduce((a, b) => a + b, 0) / Math.max(1, times.length);
  const variance =
    times.reduce((a, t) => a + (t - mean) ** 2, 0) / Math.max(1, times.length);
  // Coefficient of variation: spread relative to pace, so a slow-but-even
  // session is not marked down for being slow.
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;

  return clamp(100 - drop * 120 - Math.max(0, cv - 0.5) * 60);
}

/**
 * Strain detection — the guardrail that keeps this supportive.
 *
 * Pressure training is meant to stretch, not distress. When several signals move
 * together — accuracy collapsing in the back half, heavy thrash, repeated
 * focus loss — the session offers an exit and the review leads with support
 * rather than a score. Deliberately conservative: a false positive costs one
 * gentle message, a false negative means pushing someone who is struggling.
 */
export function detectStrain(items: PressureItem[], events: PressureEvent[]): boolean {
  if (items.length < 6) return false;
  const mid = Math.floor(items.length / 2);
  const rate = (list: PressureItem[]) =>
    list.length === 0 ? 1 : list.filter((i) => i.correct && i.answered).length / list.length;
  const collapsed = rate(items.slice(0, mid)) - rate(items.slice(mid)) > 0.4;
  const thrash = items.reduce((a, i) => a + i.answerChanges, 0) / items.length > 2.5;
  const focusLost = events.filter((e) => e.kind === "focus_lost").length >= 4;
  const abandoned = items.filter((i) => !i.answered).length / items.length > 0.35;
  // Two independent signals, not one — any single one has innocent explanations.
  return [collapsed, thrash, focusLost, abandoned].filter(Boolean).length >= 2;
}

export function scorePressureSession(
  items: PressureItem[],
  events: PressureEvent[],
  format: PressureFormat,
  secondsPerItem: number,
): PressureResult {
  const sub: SubScores = {
    accuracy: accuracyScore(items),
    speed: speedScore(items, secondsPerItem),
    composure: composureScore(items),
    calibration: calibrationScore(items),
    consistency: consistencyScore(items),
  };

  const w = WEIGHTS[format];
  const score = clamp(
    Math.round(
      sub.accuracy * w.accuracy +
        sub.speed * w.speed +
        sub.composure * w.composure +
        sub.calibration * w.calibration +
        sub.consistency * w.consistency,
    ),
  );

  const unanswered = items.filter((i) => !i.answered).length;
  const changes = items.reduce((a, i) => a + i.answerChanges, 0);
  const overconfident = items.filter(
    (i) => (i.statedConfidence ?? 0) >= 0.75 && i.answered && !i.correct,
  ).length;
  const underconfident = items.filter(
    (i) => (i.statedConfidence ?? 1) <= 0.35 && i.answered && i.correct,
  ).length;

  // Strengths first, always. A review that opens with failures is one the
  // learner stops opening.
  const strengths: string[] = [];
  const entries = Object.entries(sub) as [keyof SubScores, number][];
  const best = [...entries].sort((a, b) => b[1] - a[1])[0];
  if (best && best[1] >= 60) strengths.push(STRENGTH_COPY[best[0]]);
  if (sub.consistency >= 75) strengths.push("Your performance held steady from start to finish.");
  if (unanswered === 0 && items.length > 0) strengths.push("You reached every question in time.");
  if (strengths.length === 0) {
    strengths.push("You finished a full pressure session — that is the part most people skip.");
  }

  const observations: string[] = [];
  if (unanswered > 0) {
    observations.push(
      `${unanswered} ${unanswered === 1 ? "question was" : "questions were"} left unanswered — that is pacing, not knowledge.`,
    );
  }
  if (changes >= items.length) {
    observations.push(`You changed your answer ${changes} times across ${items.length} questions.`);
  }
  if (overconfident > 0) {
    observations.push(
      `${overconfident} ${overconfident === 1 ? "answer" : "answers"} you were sure about turned out wrong — worth reviewing those specifically.`,
    );
  }
  if (underconfident > 0) {
    observations.push(
      `You got ${underconfident} right while doubting yourself. Your instincts are better than you're crediting.`,
    );
  }
  if (sub.consistency < 60) {
    observations.push("Accuracy dropped in the back half — stamina, not ability.");
  }

  const recommendations: string[] = [];
  if (unanswered > 0) recommendations.push("Practise a shorter set at the same time limit to build pace.");
  if (sub.composure < 60) recommendations.push("Try committing to your first answer and moving on.");
  if (underconfident > 0) recommendations.push("Trust the first instinct — it was right more often than not.");
  if (overconfident > 0) recommendations.push("Slow down on questions that feel obvious.");
  if (recommendations.length === 0) recommendations.push("Step up one difficulty band next session.");

  return {
    score,
    sub,
    observations,
    strengths,
    recommendations: recommendations.slice(0, 3),
    strainDetected: detectStrain(items, events),
  };
}

const STRENGTH_COPY: Record<keyof SubScores, string> = {
  accuracy: "Your accuracy under time pressure is strong.",
  speed: "You work through questions at a good pace.",
  composure: "You commit to answers and keep moving — that holds up under pressure.",
  calibration: "You have a clear sense of what you do and don't know.",
  consistency: "You perform evenly across a whole session.",
};

/**
 * Rating change for a completed session.
 *
 * Elo-shaped against an expected score for the learner's current rating, so
 * improvement is measured against yourself rather than a global bar — and the
 * floor means a bad session costs less than a good one gains. Pressure practice
 * that can tank your rating is practice people avoid.
 */
export function ratingDelta(currentRating: number, score: number): number {
  const expected = clamp(40 + (currentRating - 1000) / 20, 10, 90);
  const raw = (score - expected) * 0.4;
  return Math.round(raw >= 0 ? raw : raw * 0.5);
}
