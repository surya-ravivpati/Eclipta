import type { Archetype, Action, ArchetypeId } from "./types";
import type { Difficulty } from "./types";

// ─── Global combat constants ──────────────────────────────────────────
/** Every archetype crits at the same rate; `critBonus` is how hard it lands. */
export const CRIT_CHANCE = 0.10;
/** Apex's passive arms below this much remaining HP. */
export const RAGE_HP_THRESHOLD = 35;
export const RAGE_DAMAGE_BONUS = 0.30;
/** Accelerator ramp: per correct answer, and its ceiling. */
export const RAMP_DAMAGE_PER_ANSWER = 2;
export const RAMP_DAMAGE_CAP = 16;
export const RAMP_SCORE_PER_ANSWER = 0.02;
export const RAMP_SCORE_CAP = 0.35;
/** Speedster: max bonus damage at an instant answer (16 base → 26). */
export const SPEED_DAMAGE_BONUS = 10;
/** God: correct answers per free heal, and how much. */
export const DIVINE_HEAL_INTERVAL = 3;
export const DIVINE_HEAL_AMOUNT = 15;
/** Healer: absorb granted per Defend, and the most that can be banked. */
export const HEAL_SHIELD_AMOUNT = 8;
export const HEAL_SHIELD_CAP = 24;
/** Fulcrum copies a passive at this strength. */
export const COPY_STRENGTH = 0.5;
/** Fulcrum borrowing Tank's passive gains half its 20% reduction. */
export const ARMOUR_COPY_BONUS = 0.20 * COPY_STRENGTH;
/**
 * Score-only streak bonus (+5% per hit, capped at +100%). Momentum no longer
 * touches damage at all — the old per-class multiplier stat compounded on top
 * of base damage and burned through HP bars in a handful of turns.
 */
export const STREAK_SCORE_STEP = 0.05;
export const STREAK_SCORE_CAP = 1.0;

/** Passives Fulcrum can borrow (its own and Gambler's reroll are excluded). */
export const COPYABLE_PASSIVES: ArchetypeId[] = ["speedster", "tank", "chud", "healer", "accelerator", "god"];

/** Map a numeric difficulty level (1–10) to an easy/medium/hard question category. */
export function levelToCategory(level: number): Difficulty {
  if (level <= 3) return "easy";
  if (level <= 7) return "medium";
  return "hard";
}

/**
 * Pick a difficulty level (1–10) for the given action based on the archetype's range.
 * - Defend  → diffMin  (easiest question — rewards safe play)
 * - Attack  → midpoint (balanced question)
 * - Charge  → diffMax  (hardest question — high risk, high reward)
 * - Wild    → random in [diffMin, diffMax]
 */
export function getActionDifficultyLevel(arch: Archetype, action: Action): number {
  const { diffMin, diffMax } = arch;
  switch (action) {
    case "defend": return diffMin;
    case "attack": return Math.round((diffMin + diffMax) / 2);
    case "charge": return diffMax;
    case "wild":   return diffMin + Math.floor(Math.random() * (diffMax - diffMin + 1));
  }
}

/**
 * Seconds on the clock for a question. Absolute per archetype — classes with a
 * `timeSecondsRange` (Speedster) stretch it across the question tier instead.
 */
export function getQuestionTime(arch: Archetype, category: Difficulty): number {
  if (!arch.timeSecondsRange) return Math.max(4, Math.round(arch.timeSeconds));
  const [min, max] = arch.timeSecondsRange;
  const t = category === "easy" ? min : category === "hard" ? max : (min + max) / 2;
  return Math.max(4, Math.round(t));
}

export interface DamageContext {
  action: Action;
  /** Seconds spent answering, and the clock it was measured against (Speedster). */
  timeSpent?: number;
  maxTime?: number;
  /** Correct answers banked so far (Accelerator ramp). */
  correctCount?: number;
  /** Attacker's current HP (Apex rage check). */
  currentHp?: number;
  /** Passive borrowed for this round, at COPY_STRENGTH (Fulcrum). */
  copied?: ArchetypeId | null;
  /** Pass false to resolve without a crit roll (previews, damage estimates). */
  allowCrit?: boolean;
}

export interface DamageResult {
  damage: number;
  crit: boolean;
}

/** True when `arch` has the passive natively, or borrowed it this round. */
function hasPassive(arch: Archetype, flag: keyof Archetype, copied: ArchetypeId | null | undefined, id: ArchetypeId): "own" | "copied" | null {
  if (arch[flag]) return "own";
  if (arch.copiesPassive && copied === id) return "copied";
  return null;
}

/**
 * Damage for an action, before the defender's DEF is applied.
 *
 * Order: base → Accelerator ramp → Speedster speed bonus → Apex rage →
 * Charge (1.8×) → crit. Streak plays no part; see STREAK_SCORE_STEP.
 */
export function getEffectiveDamage(arch: Archetype, opts: DamageContext): DamageResult {
  const { copied } = opts;
  let base = arch.baseDamage;

  // Accelerator: +2 per correct answer, capped at +16 (14 → 30).
  const ramp = hasPassive(arch, "damageRamps", copied, "accelerator");
  if (ramp && opts.correctCount !== undefined) {
    const scale = ramp === "copied" ? COPY_STRENGTH : 1;
    base += Math.min(opts.correctCount * RAMP_DAMAGE_PER_ANSWER, RAMP_DAMAGE_CAP) * scale;
  }

  // Speedster: up to +10 for an instant answer, 0 at the buzzer (16 → 26).
  const speed = hasPassive(arch, "damageIsTimeScaled", copied, "speedster");
  if (speed && opts.timeSpent !== undefined && opts.maxTime && opts.maxTime > 0) {
    const scale = speed === "copied" ? COPY_STRENGTH : 1;
    const remaining = Math.max(0, 1 - opts.timeSpent / opts.maxTime);
    base += remaining * SPEED_DAMAGE_BONUS * scale;
  }

  // Apex: cornered and dangerous.
  const rage = hasPassive(arch, "ragesWhenLow", copied, "chud");
  if (rage && opts.currentHp !== undefined && opts.currentHp < RAGE_HP_THRESHOLD) {
    base *= 1 + RAGE_DAMAGE_BONUS * (rage === "copied" ? COPY_STRENGTH : 1);
  }

  if (opts.action === "charge") base *= 1.8;

  const crit = opts.allowCrit !== false && Math.random() < CRIT_CHANCE && arch.critBonus > 0;
  if (crit) base *= 1 + arch.critBonus;

  return { damage: Math.max(1, Math.floor(base)), crit };
}

/**
 * Incoming damage after the defender's DEF. Replaces the old maxHp-derived
 * self-damage curve — durability is one explicit stat now, and it applies the
 * same way to attacks, wild events and miss penalties.
 */
export function applyDefense(damage: number, defender: Archetype, copied?: ArchetypeId | null): number {
  let def = defender.defense;
  if (defender.copiesPassive && copied === "tank") def += ARMOUR_COPY_BONUS;
  return Math.max(1, Math.floor(damage * (1 - Math.min(0.9, def))));
}

/** Damage taken through the shield pool first. Returns the leftovers. */
export function absorbWithShield(damage: number, shield: number): { hpLoss: number; shieldLeft: number } {
  const absorbed = Math.min(shield, damage);
  return { hpLoss: damage - absorbed, shieldLeft: shield - absorbed };
}

/** Shield granted by a Defend, respecting the bank cap. Zero for most classes. */
export function getHealShield(arch: Archetype, current: number, copied?: ArchetypeId | null): number {
  const shield = hasPassive(arch, "healGrantsShield", copied, "healer");
  if (!shield) return current;
  const gain = HEAL_SHIELD_AMOUNT * (shield === "copied" ? COPY_STRENGTH : 1);
  return Math.min(HEAL_SHIELD_CAP, current + Math.round(gain));
}

/**
 * God's passive: HP restored when this correct answer completes a set of three.
 * Returns 0 on every other answer, and for archetypes without the passive.
 */
export function getStreakHeal(arch: Archetype, correctCount: number, copied?: ArchetypeId | null): number {
  const divine = hasPassive(arch, "healsOnCorrectStreak", copied, "god");
  if (!divine || correctCount <= 0 || correctCount % DIVINE_HEAL_INTERVAL !== 0) return 0;
  return Math.round(DIVINE_HEAL_AMOUNT * (divine === "copied" ? COPY_STRENGTH : 1));
}

/**
 * Score multiplier for a resolved action: the shared streak bonus plus the
 * Accelerator's own ramp. Damage is deliberately untouched by both.
 */
export function getScoreMultiplier(arch: Archetype, momentum: number, correctCount: number, copied?: ArchetypeId | null): number {
  let mult = 1 + Math.min(momentum * STREAK_SCORE_STEP, STREAK_SCORE_CAP);
  const ramp = hasPassive(arch, "damageRamps", copied, "accelerator");
  if (ramp) {
    const scale = ramp === "copied" ? COPY_STRENGTH : 1;
    mult += Math.min(correctCount * RAMP_SCORE_PER_ANSWER, RAMP_SCORE_CAP) * scale;
  }
  return mult;
}

/** Pick the passive Fulcrum borrows for a round. */
export function rollCopiedPassive(): ArchetypeId {
  return COPYABLE_PASSIVES[Math.floor(Math.random() * COPYABLE_PASSIVES.length)];
}

/**
 * Bot answer accuracy, derived from the archetype's difficulty range.
 * Harder archetypes (higher avg diff) have lower bot success rates.
 */
export function botAccuracy(arch: Archetype): number {
  const avg = (arch.diffMin + arch.diffMax) / 2;
  return Math.max(0.42, 0.85 - ((avg - 1) / 9) * 0.38);
}
