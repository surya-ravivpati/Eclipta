import type { LucideIcon } from "lucide-react";
import type { MonsterArchetypeKey } from "@/lib/trophy-road-data";

export type Phase = "idle" | "classSelect" | "searching" | "gamblerReveal" | "select" | "question" | "animate" | "result";
export type Action = "attack" | "defend" | "charge" | "wild";
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
  icon: LucideIcon;
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
  multiplierStep: number;      // additive per-momentum bonus (e.g. 0.20 = +20% per streak hit)
  healAmount: number | null;   // null = cannot heal (Tank)
  timeMultiplier: number;      // multiplied against base TIMER_DURATIONS per category
  diffMin: number;             // min difficulty level 1–10
  diffMax: number;             // max difficulty level 1–10
  focusPool: number;
  startFocus: number;
  damageIsTimeScaled?: boolean;  // Speedster: bonus damage for fast answers
  multiplierScales?: boolean;    // Accelerator: damage & step grow with question count
  statsAreRandom?: boolean;      // Gambler: roll overrides at battle start
}

export interface GamblerRoll {
  maxHp: number;
  baseDamage: number;
  multiplierStep: number;
  healAmount: number;
  timeMultiplier: number;
  diffMin: number;
  diffMax: number;
}

export interface ActionConfig {
  label: string;
  icon: LucideIcon;
  focusCost: number;
  desc: string;
}

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
}
