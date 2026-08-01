import type { LucideIcon } from "lucide-react";
import type { MonsterArchetypeKey } from "@/lib/trophy-road-data";

export type Phase =
  | "idle"
  | "classSelect"
  | "searching"
  | "gamblerReveal"
  | "select"
  | "question"
  | "animate"
  | "result";
export type Action = "attack" | "defend" | "charge" | "ultimate";
export type Difficulty = "easy" | "medium" | "hard";
export type ArchetypeId = MonsterArchetypeKey;

export interface MathQuestion {
  q: string;
  answer: number;
  options: number[];
  difficulty: Difficulty;
  topic: string;
}

export interface QuestionRecord {
  question: MathQuestion;
  correct: boolean;
  timeSpent: number;
  action: Action;
}

export interface Fighter {
  name: string;
  hp: number;
  maxHp: number;
  focus: number;
  maxFocus: number;
  /** Absorb pool consumed before HP (Healer passive). Absent = 0. */
  shield?: number;
  icon: LucideIcon;
  /** Optional in-battle creature art (falls back to `icon` when absent/broken). */
  sprite?: string;
}

export interface Archetype {
  id: ArchetypeId;
  name: string;
  icon: LucideIcon;
  color: string;
  borderColor: string;
  description: string;
  passive: string;
  /** Direct mechanical values — no more 0-4 abstraction */
  maxHp: number;
  baseDamage: number;
  /** Incoming-damage reduction, 0–1 (0.20 = takes 20% less). Replaces the old
   *  maxHp-derived self-damage curve — durability is now one explicit stat. */
  defense: number;
  /** Extra damage on a crit, 0–1 (0.25 = +25%). Crit *chance* is a flat
   *  CRIT_CHANCE for every archetype; classes differ in how hard crits land. */
  critBonus: number;
  healAmount: number | null; // null = cannot heal (Tank)
  /** Absolute seconds on the clock per question — no longer a multiplier over
   *  a per-difficulty base, so the sheet value is what the player actually sees. */
  timeSeconds: number;
  diffMin: number; // min difficulty level 1–10
  diffMax: number; // max difficulty level 1–10
  focusPool: number;
  startFocus: number;
  /** Speedster: clock varies by question tier across [min, max] instead of a
   *  flat `timeSeconds` (easy → min, hard → max). */
  timeSecondsRange?: [number, number];
  damageIsTimeScaled?: boolean; // Speedster: bonus damage for fast answers
  damageRamps?: boolean; // Accelerator: +2 DMG and +2% score per correct answer
  healGrantsShield?: boolean; // Healer: Defend also grants an absorb shield
  healsOnCorrectStreak?: boolean; // God: every 3rd correct answer restores HP
  ragesWhenLow?: boolean; // Apex: +30% damage below RAGE_HP_THRESHOLD
  copiesPassive?: boolean; // Fulcrum: borrows a random passive each round
  statsAreRandom?: boolean; // Gambler: roll overrides at battle start
}

export interface GamblerRoll {
  maxHp: number;
  baseDamage: number;
  defense: number;
  healAmount: number;
  timeSeconds: number;
  critBonus: number;
  diffMin: number;
  diffMax: number;
}

export interface ActionConfig {
  label: string;
  icon: LucideIcon;
  focusCost: number;
  desc: string;
}

// ─── Battle Log ──────────────────────────────────────────────────────
// Structured event type so every log entry maps 1:1 to a resolved combat
// action with a stable ID, actor, action type, result string, and optional
// numeric value. The ID is monotonically increasing — never reordered.
export type LogActor = "player" | "opponent" | "system";
export type LogActionType =
  | "attack" // deal damage (Attack action)
  | "heal" // restore HP (Defend action)
  | "charge" // power attack (Charge action)
  | "ultimate" // Ecliptar ultimate cast
  | "miss" // wrong answer or timeout
  | "combo" // streak milestone reached
  | "separator" // turn-start indicator
  | "info" // match start, pressure lines, warnings
  | "ghost"; // ghost-replay opponent action

export interface LogEntry {
  id: number; // monotonically increasing — stable React key, never reordered
  actor: LogActor;
  actionType: LogActionType;
  result: string; // human-readable description
  value?: number; // primary numeric value (damage / heal amount)
}

// ─── Battle Stats ────────────────────────────────────────────────────
export interface BattleStats {
  totalQuestions: number;
  correctAnswers: number;
  longestStreak: number;
  fastestAnswer: number;
  records: QuestionRecord[];
  archetype: ArchetypeId;
  won: boolean;
  score: number;
  xp: number;
  opponentType?: "live" | "ghost" | "bot";
  ratingChange?: number | null;
}
