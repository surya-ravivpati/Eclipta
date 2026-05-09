import type { Archetype, Action } from "./types";
import type { Difficulty } from "./types";

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
 * Effective base damage for an action before streak multiplier.
 *
 * Special cases:
 * - Speedster: adds a speed bonus — `baseDamage × (1 − timeSpent/maxTime)` extra damage.
 *   At full speed: 15+15 = 30. At timeout: 15+0 = 15.
 * - Accelerator: damage scales 13→27 linearly over 10 questions answered.
 * - Charge: 1.8× the base before other bonuses.
 */
export function getEffectiveDamage(
  arch: Archetype,
  opts: { action: Action; timeSpent?: number; maxTime?: number; recordCount?: number },
): number {
  let base = arch.baseDamage;

  if (arch.multiplierScales && opts.recordCount !== undefined) {
    base = 13 + Math.min(opts.recordCount / 10, 1) * 14;
  }

  if (opts.action === "charge") {
    base *= 1.8;
  }

  if (arch.damageIsTimeScaled && opts.timeSpent !== undefined && opts.maxTime && opts.maxTime > 0) {
    base += (1 - opts.timeSpent / opts.maxTime) * arch.baseDamage;
  }

  return Math.floor(base);
}

/**
 * Per-hit multiplier step for the current question count.
 * Accelerator: scales from 0.15 → 0.40 over 10 questions.
 */
export function getEffectiveMultiplierStep(arch: Archetype, recordCount: number): number {
  if (arch.multiplierScales) {
    return 0.15 + Math.min(recordCount / 10, 1) * 0.25;
  }
  return arch.multiplierStep;
}

/**
 * Final streak damage multiplier.
 * Formula: 1 + momentum × step
 * e.g. momentum=3, step=0.20 → 1.60× damage
 */
export function streakToMultiplier(momentum: number, step: number): number {
  return 1 + momentum * step;
}

/**
 * Self-damage multiplier when missing a question (tankier = less self-damage).
 * Formula: 1.30 − ((maxHp − 75) / 175) × 0.80
 * At  75 HP (Chud): 1.30  — glass cannons take extra punishment
 * At 250 HP (Tank): 0.50  — heavily armored, barely stings
 */
export function hpToSelfDmgMult(maxHp: number): number {
  return 1.30 - Math.max(0, (maxHp - 75) / 175) * 0.80;
}

/**
 * Bot answer accuracy, derived from the archetype's difficulty range.
 * Harder archetypes (higher avg diff) have lower bot success rates.
 */
export function botAccuracy(arch: Archetype): number {
  const avg = (arch.diffMin + arch.diffMax) / 2;
  return Math.max(0.42, 0.85 - ((avg - 1) / 9) * 0.38);
}
