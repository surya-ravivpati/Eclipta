/**
 * Luna calibration engine - pure, framework-free.
 *
 * A short diagnostic that measures the dimensions that actually predict good
 * tutoring (NOT the debunked "learning styles" myth): prior ability, working-
 * memory / chunk tolerance, pace, struggle response, *scaffold response*, and
 * metacognitive accuracy (confidence vs. correctness). See
 * docs/luna-learner-model.md for the rationale.
 *
 * What makes this distinct: the scaffold items teach a *made-up* rule two ways
 * (worked-example-first vs. discover-the-pattern), then test transfer - so we
 * measure how a person LEARNS something new, not what they already know. And
 * we capture a pre-answer confidence on every item, so Luna can tell whether a
 * learner knows what they know and correct over/under-confidence.
 *
 * This module has no UI and no I/O. It produces a LearningProfile from the
 * recorded responses; persistence + rendering live elsewhere.
 */

export type ChunkSize = "small" | "medium" | "large";
export type Pace = "deliberate" | "standard" | "fast";
export type StruggleTolerance = "low" | "medium" | "high";
export type Scaffold = "worked_example_first" | "socratic_first";
export type Metacognition = "overconfident" | "calibrated" | "underconfident";
export type Lean = "conceptual" | "procedural" | "balanced";

export type Confidence = 1 | 2 | 3 | 4;

export interface LearningProfile {
  version: 1;
  /** Suggested starting difficulty, 1 (gentle) - 5 (stretch). */
  ability: number;
  pace: Pace;
  chunk_size: ChunkSize;
  struggle_tolerance: StruggleTolerance;
  scaffold: Scaffold;
  metacognition: Metacognition;
  lean: Lean;
  /** ISO date the calibration was taken. */
  calibrated_at: string;
  /** 0-1: how much data backs this profile. One calibration caps ~0.7. */
  confidence: number;
}

export type ItemRole =
  | "ladder"
  | "chunk"
  | "transfer_worked"
  | "transfer_socratic"
  | "procedural"
  | "conceptual"
  | "struggle";

export interface CalibrationItem {
  id: string;
  role: ItemRole;
  /** 1-5 */
  difficulty: number;
  prompt: string;
  options: string[];
  correctIndex: number;
  /** struggle item offers a hint + skip so we can read the behavioral response */
  allowHint?: boolean;
  hint?: string;
}

export interface TeachStep {
  kind: "teach";
  id: string;
  title: string;
  body: string;
}
export interface QuestionStep {
  kind: "question";
  item: CalibrationItem;
}
export type CalibrationStep = TeachStep | QuestionStep;

export interface CalibrationResponse {
  itemId: string;
  role: ItemRole;
  correct: boolean;
  /** time from item shown to answer submitted, ms */
  ms: number;
  confidence: Confidence;
  /** how they engaged - only "struggle" items can be hinted/skipped */
  action: "answered" | "hint" | "skipped";
}

/* -- Item bank ---------------------------------------------------------
   Domain-light reasoning/numeracy so the test measures learning behavior,
   not a specific curriculum. correctIndex is always the intended answer. */

const I = (x: Omit<CalibrationItem, "options"> & { options: string[] }): QuestionStep => ({
  kind: "question",
  item: x,
});

export const CALIBRATION_STEPS: CalibrationStep[] = [
  // -- Ability ladder (graded difficulty) ------------------------------
  I({
    id: "lad1",
    role: "ladder",
    difficulty: 2,
    prompt: "A shirt costs 20 dollars and is 25% off. What's the sale price?",
    options: ["15 dollars", "5 dollars", "25 dollars", "16 dollars"],
    correctIndex: 0,
  }),
  I({
    id: "lad2",
    role: "ladder",
    difficulty: 3,
    prompt: "If 3 pens cost 7.50 at a fixed rate, what do 5 pens cost?",
    options: ["10.00", "11.50", "12.50", "15.00"],
    correctIndex: 2,
  }),
  I({
    id: "lad3",
    role: "ladder",
    difficulty: 4,
    prompt: "A number is tripled, then 6 is added, and the result is 30. What was the number?",
    options: ["12", "10", "9", "8"],
    correctIndex: 3,
  }),

  // -- Working memory / chunk tolerance --------------------------------
  I({
    id: "chunk",
    role: "chunk",
    difficulty: 3,
    prompt:
      "Hold this in your head: start with 6, double it, add 8, then divide by 4. What's the result?",
    options: ["4", "5", "7", "8"],
    correctIndex: 1,
  }),

  // -- Scaffold A/B: worked-example-first ------------------------------
  {
    kind: "teach",
    id: "teach_worked",
    title: "A made-up rule: a ⊕ b",
    body: "Here's a brand-new rule. a ⊕ b means (2 x a) + b.\n\nWorked example: 3 ⊕ 4 = (2 x 3) + 4 = 10.",
  },
  I({
    id: "tw",
    role: "transfer_worked",
    difficulty: 3,
    prompt: "Using that same rule, what is 5 ⊕ 1?",
    options: ["6", "11", "7", "12"],
    correctIndex: 1,
  }),

  // -- Scaffold A/B: discover-the-pattern (Socratic) -------------------
  {
    kind: "teach",
    id: "teach_socratic",
    title: "Spot the pattern: a ⊗ b",
    body: "Here's another new rule, but this time figure out how it works yourself.\n\nYou're told: 2 ⊗ 1 = 5, and 4 ⊗ 2 = 10. Look for the pattern before the next question.",
  },
  I({
    id: "ts",
    role: "transfer_socratic",
    difficulty: 3,
    prompt: "Based on those two examples, what is 3 ⊗ 2?",
    options: ["8", "5", "11", "9"],
    correctIndex: 3,
  }),

  // -- Conceptual vs procedural ----------------------------------------
  I({
    id: "proc",
    role: "procedural",
    difficulty: 2,
    prompt: "What is 25% of 80?",
    options: ["20", "16", "25", "40"],
    correctIndex: 0,
  }),
  I({
    id: "concept",
    role: "conceptual",
    difficulty: 3,
    prompt: "Why does dividing a number by a fraction smaller than 1 make it larger?",
    options: [
      "Dividing always makes numbers larger.",
      "Fractions are negative, so the result flips.",
      "You're counting how many of those small pieces fit into the number, and a lot fit.",
      "The number's decimal point shifts right.",
    ],
    correctIndex: 2,
  }),

  // -- Struggle response (hard; hint + skip offered) -------------------
  I({
    id: "struggle",
    role: "struggle",
    difficulty: 5,
    allowHint: true,
    hint: "Each full day-and-night the snail nets +1 foot - but think hard about the final day, before it can slip back.",
    prompt:
      "A snail climbs 3 feet up a 10-foot wall each day, then slips 2 feet each night. On which day does it reach the top?",
    options: ["Day 7", "Day 8", "Day 9", "Day 10"],
    correctIndex: 1,
  }),
];

/** Total question items (for progress UI). */
export const CALIBRATION_QUESTION_COUNT = CALIBRATION_STEPS.filter(
  (s) => s.kind === "question",
).length;

/* -- Inference ------------------------------------------------------- */

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const byRole = (rs: CalibrationResponse[], role: ItemRole) => rs.find((r) => r.role === role);

/**
 * Turn recorded responses into a LearningProfile. Pure and deterministic.
 * Tolerant of missing/partial responses (e.g. a skipped struggle item).
 */
export function inferProfile(
  responses: CalibrationResponse[],
  now: Date = new Date(),
): LearningProfile {
  const answered = responses.filter((r) => r.action !== "skipped");

  // Difficulty weight of every question item, for the ability ratio.
  const diffOf: Record<string, number> = {};
  for (const s of CALIBRATION_STEPS) {
    if (s.kind === "question") diffOf[s.item.id] = s.item.difficulty;
  }

  // -- Ability: difficulty-weighted correctness over the graded items --
  let gotDiff = 0;
  let totalDiff = 0;
  for (const r of responses) {
    const d = diffOf[r.itemId] ?? 0;
    if (r.role === "struggle") continue; // struggle is behavioral, not ability
    totalDiff += d;
    if (r.correct) gotDiff += d;
  }
  const masteryRatio = totalDiff > 0 ? gotDiff / totalDiff : 0.5;
  const ability = clamp(Math.round(1 + masteryRatio * 4), 1, 5);

  // -- Pace: median time on answered questions (correct preferred) -----
  const correctMs = answered.filter((r) => r.correct).map((r) => r.ms);
  const paceMs = median(correctMs.length >= 2 ? correctMs : answered.map((r) => r.ms));
  const pace: Pace =
    paceMs === 0
      ? "standard"
      : paceMs < 14000
        ? "fast"
        : paceMs > 38000
          ? "deliberate"
          : "standard";

  // -- Chunk size: the multi-step mental item --------------------------
  const chunk = byRole(responses, "chunk");
  const chunk_size: ChunkSize =
    !chunk || chunk.action === "skipped"
      ? "medium"
      : chunk.correct
        ? chunk.ms < 28000
          ? "large"
          : "medium"
        : "small";

  // -- Struggle tolerance: behavior on the hard item -------------------
  const st = byRole(responses, "struggle");
  let struggle_tolerance: StruggleTolerance = "medium";
  if (st) {
    if (st.action === "skipped") struggle_tolerance = "low";
    else if (st.action === "hint") struggle_tolerance = "medium";
    else struggle_tolerance = st.correct || st.ms >= 8000 ? "high" : "low"; // rapid wrong guess = low
  }

  // -- Scaffold response: which teaching mode transferred better -------
  const tw = byRole(responses, "transfer_worked");
  const ts = byRole(responses, "transfer_socratic");
  const w = !!tw?.correct;
  const s = !!ts?.correct;
  let scaffold: Scaffold;
  if (w && !s) scaffold = "worked_example_first";
  else if (s && !w) scaffold = "socratic_first";
  else {
    // both or neither correct -> prefer the mode they were more fluent on
    // (higher confidence, then faster); default to worked-first for novices.
    const wc = tw?.confidence ?? 0;
    const sc = ts?.confidence ?? 0;
    if (sc > wc) scaffold = "socratic_first";
    else if (wc > sc) scaffold = "worked_example_first";
    else
      scaffold =
        (ts?.ms ?? Infinity) < (tw?.ms ?? Infinity) ? "socratic_first" : "worked_example_first";
  }

  // -- Metacognition: confidence vs. correctness gap -------------------
  const conf = answered.filter((r) => typeof r.confidence === "number");
  let metacognition: Metacognition = "calibrated";
  if (conf.length >= 3) {
    const meanConf = conf.reduce((a, r) => a + (r.confidence - 1) / 3, 0) / conf.length; // 0-1
    const accuracy = conf.reduce((a, r) => a + (r.correct ? 1 : 0), 0) / conf.length;
    const gap = meanConf - accuracy;
    metacognition = gap > 0.18 ? "overconfident" : gap < -0.18 ? "underconfident" : "calibrated";
  }

  // -- Conceptual vs procedural lean -----------------------------------
  const proc = byRole(responses, "procedural");
  const concept = byRole(responses, "conceptual");
  const p = !!proc?.correct;
  const c = !!concept?.correct;
  const lean: Lean = p && !c ? "procedural" : c && !p ? "conceptual" : "balanced";

  // -- Confidence in the profile: grows with sample size ---------------
  const profileConfidence = clamp(0.35 + 0.05 * answered.length, 0, 0.7);

  return {
    version: 1,
    ability,
    pace,
    chunk_size,
    struggle_tolerance,
    scaffold,
    metacognition,
    lean,
    calibrated_at: now.toISOString().slice(0, 10),
    confidence: Math.round(profileConfidence * 100) / 100,
  };
}

/* -- Human-readable rendering ---------------------------------------- */

const PACE_LABEL: Record<Pace, string> = {
  deliberate: "You take your time and think things through",
  standard: "You work at a steady, balanced pace",
  fast: "You move quickly and trust your instincts",
};
const SCAFFOLD_LABEL: Record<Scaffold, string> = {
  worked_example_first: "You learn fastest from a worked example before trying it yourself",
  socratic_first: "You learn fastest by spotting the pattern yourself first",
};
const META_LABEL: Record<Metacognition, string> = {
  overconfident:
    "You're decisive - Luna will have you double-check your reasoning before locking in",
  calibrated: "Your sense of what you know is well-calibrated",
  underconfident:
    "You often know more than you think - Luna will call out when your reasoning is sound",
};
const LEAN_LABEL: Record<Lean, string> = {
  conceptual: "You grasp the 'why' before the 'how'",
  procedural: "You get to the answer fast - Luna will make sure the 'why' lands too",
  balanced: "You balance the how and the why",
};

/** Friendly summary lines for the end-of-calibration screen. */
export function describeProfile(p: LearningProfile): { label: string; value: string }[] {
  return [
    { label: "Pace", value: PACE_LABEL[p.pace] },
    { label: "How you learn new ideas", value: SCAFFOLD_LABEL[p.scaffold] },
    { label: "Self-knowledge", value: META_LABEL[p.metacognition] },
    { label: "Thinking style", value: LEAN_LABEL[p.lean] },
  ];
}

/**
 * Compact block Luna reads each turn. Kept short and structured so a fast
 * model follows it precisely (a sprawling profile dump does not work).
 */
export function profileToLunaBlock(p: LearningProfile): string {
  const lines = [
    `Pace: ${p.pace} | Chunk size: ${p.chunk_size} | Struggle tolerance: ${p.struggle_tolerance}`,
    `Scaffold: ${p.scaffold === "worked_example_first" ? "show a worked example before asking them to try" : "let them spot the pattern before you confirm it"}`,
    `Thinking lean: ${p.lean}${p.lean === "procedural" ? " (make the 'why' explicit, not just the steps)" : ""}`,
  ];
  if (p.metacognition === "overconfident") {
    lines.push(
      `Metacognition: overconfident - before confirming, ask for a confidence level and a one-line justification.`,
    );
  } else if (p.metacognition === "underconfident") {
    lines.push(
      `Metacognition: underconfident - when their reasoning is right, say so plainly and explain why it generalizes.`,
    );
  }
  lines.push(`Suggested starting difficulty: ${p.ability}/5.`);
  return lines.join("\n");
}
