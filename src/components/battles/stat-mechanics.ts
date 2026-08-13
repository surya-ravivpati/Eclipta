import type { Archetype, Action, ArchetypeId } from "./types";
import type { Difficulty } from "./types";
import { BOT_ACCURACY, DAMAGE_TUNING, QUESTION_TIMER } from "@/config/battle-tuning";

/** Passives Fulcrum can borrow (its own and Gambler's reroll are excluded). */
export const COPYABLE_PASSIVES: ArchetypeId[] = [
  "speedster",
  "tank",
  "chud",
  "healer",
  "accelerator",
  "god",
];

/** Map a numeric difficulty level (1-10) to an easy/medium/hard question category. */
export function levelToCategory(level: number): Difficulty {
  if (level <= 3) return "easy";
  if (level <= 7) return "medium";
  return "hard";
}

/**
 * Pick a difficulty level (1-10) for the given action based on the archetype's range.
 * - Defend  -> diffMin  (easiest question - rewards safe play)
 * - Attack  -> midpoint (balanced question)
 * - Charge   -> diffMax  (hardest question - high risk, high reward)
 * - Ultimate -> midpoint (a committed play, not a difficulty gamble)
 */
export function getActionDifficultyLevel(arch: Archetype, action: Action): number {
  const { diffMin, diffMax } = arch;
  switch (action) {
    case "defend":
      return diffMin;
    case "attack":
      return Math.round((diffMin + diffMax) / 2);
    case "charge":
      return diffMax;
    case "ultimate":
      return Math.round((diffMin + diffMax) / 2);
  }
}

/**
 * Seconds on the clock for a question. Absolute per archetype - classes with a
 * `timeSecondsRange` (Speedster) stretch it across the question tier instead.
 */
export function getQuestionTime(arch: Archetype, category: Difficulty): number {
  const floor = QUESTION_TIMER.minSeconds;
  if (!arch.timeSecondsRange) return Math.max(floor, Math.round(arch.timeSeconds));
  const [min, max] = arch.timeSecondsRange;
  const t = category === "easy" ? min : category === "hard" ? max : (min + max) / 2;
  return Math.max(floor, Math.round(t));
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
  /** Passive borrowed for this round, at `fulcrum.copyStrength` (Fulcrum). */
  copied?: ArchetypeId | null;
  /** Pass false to resolve without a crit roll (previews, damage estimates). */
  allowCrit?: boolean;
}

export interface DamageResult {
  damage: number;
  crit: boolean;
}

/** True when `arch` has the passive natively, or borrowed it this round. */
function hasPassive(
  arch: Archetype,
  flag: keyof Archetype,
  copied: ArchetypeId | null | undefined,
  id: ArchetypeId,
): "own" | "copied" | null {
  if (arch[flag]) return "own";
  if (arch.copiesPassive && copied === id) return "copied";
  return null;
}

/** Borrowed passives land at reduced strength; native ones at full. */
function strength(source: "own" | "copied"): number {
  return source === "copied" ? DAMAGE_TUNING.fulcrum.copyStrength : 1;
}

/**
 * Damage for an action, before the defender's DEF is applied.
 *
 * Order: base -> Accelerator ramp -> Speedster speed bonus -> Apex rage ->
 * Charge -> crit. Streak plays no part; see `getScoreMultiplier`.
 */
export function getEffectiveDamage(arch: Archetype, opts: DamageContext): DamageResult {
  const { copied } = opts;
  let base = arch.baseDamage;

  // Accelerator: +2 per correct answer, capped at +16 (14 -> 30).
  const ramp = hasPassive(arch, "damageRamps", copied, "accelerator");
  if (ramp && opts.correctCount !== undefined) {
    const { damagePerAnswer, damageCap } = DAMAGE_TUNING.accelerator;
    base += Math.min(opts.correctCount * damagePerAnswer, damageCap) * strength(ramp);
  }

  // Speedster: full bonus at an instant answer, nothing at the buzzer (16 -> 26).
  const speed = hasPassive(arch, "damageIsTimeScaled", copied, "speedster");
  if (speed && opts.timeSpent !== undefined && opts.maxTime && opts.maxTime > 0) {
    const remaining = Math.max(0, 1 - opts.timeSpent / opts.maxTime);
    base += remaining * DAMAGE_TUNING.speedster.maxSpeedBonus * strength(speed);
  }

  // Apex: cornered and dangerous.
  const rage = hasPassive(arch, "ragesWhenLow", copied, "chud");
  if (rage && opts.currentHp !== undefined && opts.currentHp < DAMAGE_TUNING.apex.rageHpThreshold) {
    base *= 1 + DAMAGE_TUNING.apex.rageDamageBonus * strength(rage);
  }

  if (opts.action === "charge") base *= DAMAGE_TUNING.chargeMultiplier;

  const crit =
    opts.allowCrit !== false && arch.critBonus > 0 && Math.random() < DAMAGE_TUNING.critChance;
  if (crit) base *= 1 + arch.critBonus;

  return { damage: Math.max(1, Math.floor(base)), crit };
}

/**
 * Incoming damage after the defender's DEF. This replaced the maxHp-derived
 * self-damage curve - durability is one explicit stat now, and it applies the
 * same way to attacks, wild events and miss penalties.
 */
export function applyDefense(
  damage: number,
  defender: Archetype,
  copied?: ArchetypeId | null,
): number {
  let def = defender.defense;
  // Fulcrum borrowing Tank's passive gains a reduced share of its reduction.
  if (defender.copiesPassive && copied === "tank") {
    def += ARMOUR_COPY_BONUS;
  }
  return Math.max(1, Math.floor(damage * (1 - Math.min(DAMAGE_TUNING.maxDefense, def))));
}

/** Tank's DEF is the reference the Fulcrum copy is derived from. */
export const ARMOUR_COPY_BONUS = 0.2 * DAMAGE_TUNING.fulcrum.copyStrength;

/** Damage taken through the shield pool first. Returns the leftovers. */
export function absorbWithShield(
  damage: number,
  shield: number,
): { hpLoss: number; shieldLeft: number } {
  const absorbed = Math.min(shield, damage);
  return { hpLoss: damage - absorbed, shieldLeft: shield - absorbed };
}

/** Shield granted by a Defend, respecting the bank cap. Zero for most classes. */
export function getHealShield(
  arch: Archetype,
  current: number,
  copied?: ArchetypeId | null,
): number {
  const shield = hasPassive(arch, "healGrantsShield", copied, "healer");
  if (!shield) return current;
  const { shieldPerHeal, shieldCap } = DAMAGE_TUNING.healer;
  return Math.min(shieldCap, current + Math.round(shieldPerHeal * strength(shield)));
}

/**
 * God's passive: HP restored when this correct answer completes a set of three.
 * Returns 0 on every other answer, and for archetypes without the passive.
 */
export function getStreakHeal(
  arch: Archetype,
  correctCount: number,
  copied?: ArchetypeId | null,
): number {
  const divine = hasPassive(arch, "healsOnCorrectStreak", copied, "god");
  const { healInterval, healAmount } = DAMAGE_TUNING.god;
  if (!divine || correctCount <= 0 || correctCount % healInterval !== 0) return 0;
  return Math.round(healAmount * strength(divine));
}

/**
 * Score multiplier for a resolved action: the shared streak bonus plus the
 * Accelerator's own ramp. Damage is deliberately untouched by both - this is
 * the only place momentum pays out.
 */
export function getScoreMultiplier(
  arch: Archetype,
  momentum: number,
  correctCount: number,
  copied?: ArchetypeId | null,
): number {
  const { stepPerHit, cap } = DAMAGE_TUNING.streakScore;
  let mult = 1 + Math.min(momentum * stepPerHit, cap);
  const ramp = hasPassive(arch, "damageRamps", copied, "accelerator");
  if (ramp) {
    const { scorePerAnswer, scoreCap } = DAMAGE_TUNING.accelerator;
    mult += Math.min(correctCount * scorePerAnswer, scoreCap) * strength(ramp);
  }
  return mult;
}

/** Damage for a wrong answer or timeout, before the defender's DEF. */
export function rollMissPenalty(): number {
  const { min, max } = DAMAGE_TUNING.missPenalty;
  return min + Math.floor(Math.random() * (max - min + 1));
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
  return Math.max(
    BOT_ACCURACY.min,
    BOT_ACCURACY.max - ((avg - 1) / BOT_ACCURACY.difficultyScaleWidth) * BOT_ACCURACY.range,
  );
}
