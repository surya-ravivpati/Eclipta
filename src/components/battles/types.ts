import type { LucideIcon } from "lucide-react";
import type { MonsterArchetypeKey } from "@/lib/trophy-road-data";

export type Phase = "idle" | "classSelect" | "searching" | "select" | "question" | "animate" | "result";
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
  avatar: string;
}

export interface Archetype {
  id: ArchetypeId;
  name: string;
  emoji: string;
  color: string;
  borderColor: string;
  description: string;
  passive: string;
  stats: { attack: number; defense: number; speed: number; combo: number };
}

export interface ActionConfig {
  label: string;
  icon: LucideIcon;
  difficulty: Difficulty;
  dmg: number;
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
