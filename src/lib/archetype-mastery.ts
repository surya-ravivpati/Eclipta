/**
 * Archetype Mastery — rank system, DB helpers, and display utilities.
 *
 * Ranks are earned through a combination of volume (battles played),
 * quality (win rate), and skill expression (best streak, perfect battles).
 * A player cannot rank up simply by grinding losses — they must demonstrate
 * improving competence, which directly mirrors the educational goal.
 */
import type { ArchetypeId } from "@/components/battles/types";
import { supabase } from "@/integrations/supabase/client";

// ─── Data Types ───────────────────────────────────────────────────────────────

export interface ArchetypeMastery {
  archetype: string;
  battles_played: number;
  wins: number;
  best_streak: number;
  total_correct: number;
  total_questions: number;
  perfect_battles: number;
}

export interface MasteryRank {
  level: number;   // 0 = unranked, 1–5 = ranked
  label: string;   // archetype-flavoured title (e.g. "Reflex" for Speedster III)
  color: string;   // Tailwind class
  flavor: string;  // one-line personality description
}

// ─── Rank Thresholds ──────────────────────────────────────────────────────────
// Requiring BOTH volume AND quality prevents pure-grind rank-ups.
// best_streak gates show mastery of compounding momentum.
// perfect_battles (Rank V) is the skill-expression ceiling.

const THRESHOLDS = [
  { battles: 0,  winRate: 0,    streak: 0,  perfect: 0 }, // Rank 0
  { battles: 1,  winRate: 0,    streak: 0,  perfect: 0 }, // Rank I
  { battles: 4,  winRate: 0.30, streak: 3,  perfect: 0 }, // Rank II
  { battles: 12, winRate: 0.42, streak: 5,  perfect: 0 }, // Rank III
  { battles: 28, winRate: 0.52, streak: 8,  perfect: 0 }, // Rank IV
  { battles: 55, winRate: 0.60, streak: 10, perfect: 1 }, // Rank V
] as const;

// ─── Rank Identity Labels ─────────────────────────────────────────────────────
// Each archetype has 6 labels (0 = unranked placeholder, 1–5 = ranks).
// These reinforce the playstyle fantasy: Speedster ranks are about speed and
// precision, Gambler ranks are about house-beating edge, etc.

const RANK_LABELS: Record<ArchetypeId, readonly string[]> = {
  speedster:   ["—", "Signal",   "Flash",      "Reflex",       "Blur",            "Ghost"],
  tank:        ["—", "Wall",     "Bulwark",    "Fortress",     "Colossus",        "Immovable"],
  chud:        ["—", "Spark",    "Detonator",  "Devastator",   "Obliterator",     "Singularity"],
  healer:      ["—", "Medic",    "Sustainer",  "Guardian",     "Lifeline",        "Undying"],
  fulcrum:     ["—", "Student",  "Tactician",  "Strategist",   "Grandmaster",     "Equilibrium"],
  accelerator: ["—", "Kindling", "Ember",      "Blaze",        "Inferno",         "Supernova"],
  gambler:     ["—", "Punter",   "Shark",      "Hustler",      "Card Counter",    "House Wins"],
  god:         ["—", "Acolyte",  "Disciple",   "Prophet",      "Archangel",       "Transcendent"],
};

// Per-rank flavor text — communicates the psychological identity of each tier.
const RANK_FLAVORS: Record<ArchetypeId, readonly string[]> = {
  speedster:   ["", "First steps at the speed of light.", "Quick hands, quicker mind.", "Pressure is your element.", "You don't react to time — you warp it.", "The blur between thought and action."],
  tank:        ["", "Learning to endure.", "They haven't broken you yet.", "Nothing gets through.", "You are the last line. You always hold.", "What moves cannot be moved."],
  chud:        ["", "The first spark.", "Ignition.", "Pure devastation, barely controlled.", "They don't survive first contact.", "Beyond damage. Beyond reason."],
  healer:      ["", "Still learning patience.", "Survival is its own weapon.", "You outlast everything.", "No one can finish you.", "Death cannot find you here."],
  fulcrum:     ["", "Balance is a myth you're learning.", "You begin to understand it.", "Every battle is a calculation.", "Nothing escapes your model.", "Perfect. Inevitable. Balanced."],
  accelerator: ["", "The first ember.", "Warming up.", "You can feel it building.", "Everything you've answered is ammunition.", "Late-game god. They should have ended it earlier."],
  gambler:     ["", "You rolled the dice.", "The house didn't know you were coming.", "Risk is just another word for edge.", "The probabilities bend for you.", "The house belongs to you now."],
  god:         ["", "You have heard the call.", "The path opens.", "Others feel your presence.", "Beyond comprehension.", "There is no higher station."],
};

const RANK_COLORS = [
  "text-muted-foreground",  // Rank 0
  "text-tier-bronze",       // Rank I
  "text-tier-silver",       // Rank II
  "text-tier-gold",         // Rank III
  "text-tier-platinum",     // Rank IV
  "text-tier-god",          // Rank V
] as const;

// ─── Public API ───────────────────────────────────────────────────────────────

/** Returns the highest rank the player qualifies for. */
export function getMasteryRank(m: ArchetypeMastery, archId: ArchetypeId): MasteryRank {
  const winRate = m.battles_played > 0 ? m.wins / m.battles_played : 0;

  let level = 0;
  for (let i = THRESHOLDS.length - 1; i >= 1; i--) {
    const t = THRESHOLDS[i];
    if (
      m.battles_played >= t.battles &&
      winRate          >= t.winRate  &&
      m.best_streak    >= t.streak   &&
      m.perfect_battles >= t.perfect
    ) {
      level = i;
      break;
    }
  }

  return {
    level,
    label:  RANK_LABELS[archId]?.[level]  ?? `Rank ${level}`,
    color:  RANK_COLORS[level]            ?? "text-foreground",
    flavor: RANK_FLAVORS[archId]?.[level] ?? "",
  };
}

/** Win-rate and accuracy as display percentages. */
export function getMasteryStats(m: ArchetypeMastery): { winRate: number; accuracy: number } {
  return {
    winRate:  m.battles_played  > 0 ? Math.round((m.wins           / m.battles_played)  * 100) : 0,
    accuracy: m.total_questions > 0 ? Math.round((m.total_correct  / m.total_questions) * 100) : 0,
  };
}

/** A blank mastery row used for display before any battles are recorded. */
export function emptyMastery(archetype: ArchetypeId): ArchetypeMastery {
  return { archetype, battles_played: 0, wins: 0, best_streak: 0, total_correct: 0, total_questions: 0, perfect_battles: 0 };
}

// ─── Database Helpers ─────────────────────────────────────────────────────────

/**
 * Atomically upsert one battle into archetype_mastery via the
 * SECURITY DEFINER RPC (avoids the 1-row-must-exist constraint).
 */
export async function recordBattleMastery(
  archetype:   ArchetypeId,
  won:         boolean,
  bestStreak:  number,
  correct:     number,
  total:       number,
): Promise<void> {
  const perfect = won && total > 0 && correct === total;
  await supabase.rpc("record_battle_mastery" as any, {
    p_archetype:   archetype,
    p_won:         won,
    p_best_streak: bestStreak,
    p_correct:     correct,
    p_total:       total,
    p_perfect:     perfect,
  });
}

/** Fetch the mastery row for one archetype for the current user. Returns null if not found. */
export async function fetchMastery(archetype: ArchetypeId): Promise<ArchetypeMastery | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("archetype_mastery" as any)
    .select("archetype,battles_played,wins,best_streak,total_correct,total_questions,perfect_battles")
    .eq("user_id", user.id)
    .eq("archetype", archetype)
    .maybeSingle();
  return (data ?? null) as ArchetypeMastery | null;
}

/** Fetch all archetype mastery rows for the current user. */
export async function fetchAllMastery(): Promise<ArchetypeMastery[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("archetype_mastery" as any)
    .select("archetype,battles_played,wins,best_streak,total_correct,total_questions,perfect_battles")
    .eq("user_id", user.id);
  return (data ?? []) as unknown as ArchetypeMastery[];
}
