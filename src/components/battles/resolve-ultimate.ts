import type { Archetype, ArchetypeId } from "./types";
import { addEffect, clearDebuffs, effect, type ActiveEffect } from "./effects";
import type { Ultimate, UltimateOp } from "./ultimates";
import { applyDefense, absorbWithShield, getEffectiveDamage } from "./stat-mechanics";
import { DAMAGE_TUNING, ULTIMATE_TUNING } from "@/config/battle-tuning";

/**
 * Pure interpreter for an ultimate's op list.
 *
 * Deliberately a pure function over a snapshot: `resolveUltimate` takes the
 * whole battle state in and hands a new one back, touching no React state and
 * no globals. That is what makes 32 ultimates testable without mounting a
 * battle, and it is the same code path for the player, a bot and live PvP.
 */

/** One side of the fight, as the resolver sees it. */
export interface SideState {
  arch: Archetype;
  hp: number;
  maxHp: number;
  shield: number;
  effects: ActiveEffect[];
  /** Match-long base-damage bonus (Chronovex). */
  bonusDamage: number;
  scoreMult: number;
}

export interface UltimateContext {
  caster: SideState;
  target: SideState;
  /** Caster's correct-answer count, for damage that scales off the stat sheet. */
  correctCount: number;
  /** HP the caster held N turns ago, oldest last (Temporobys). */
  hpHistory: number[];
  /** Injectable RNG so tests can pin every random branch. */
  rng?: () => number;
}

export interface UltimateOutcome {
  caster: SideState;
  target: SideState;
  /** Damage dealt to the target, after DEF/shields. */
  damageDealt: number;
  /** Damage the caster took (backfires and reflects). */
  selfDamage: number;
  healed: number;
  /** Seconds to add to the next question clock, per side. */
  timerDelta: { self: number; opponent: number };
  /** Correr: pin the caster's next clock and pay for unused seconds. */
  nextTimerOverride: { seconds: number; damagePerUnusedSecond: number } | null;
  extraTurn: boolean;
  resetCooldowns: boolean;
  /** Fraction of a meter to give back (Fortunox). */
  chargeRefund: number;
  /** Score multiplier stolen from the target and added to the caster. */
  scoreMultStolen: number;
  /** Labels of the random branches that fired, for the log and overlay. */
  rolls: string[];
  /** Human-readable lines describing everything that happened. */
  notes: string[];
}

const clampShield = (n: number) => Math.max(0, Math.min(ULTIMATE_TUNING.maxShield, Math.round(n)));

export function resolveUltimate(ult: Ultimate, ctx: UltimateContext): UltimateOutcome {
  const rng = ctx.rng ?? Math.random;
  const out: UltimateOutcome = {
    caster: { ...ctx.caster, effects: [...ctx.caster.effects] },
    target: { ...ctx.target, effects: [...ctx.target.effects] },
    damageDealt: 0,
    selfDamage: 0,
    healed: 0,
    timerDelta: { self: 0, opponent: 0 },
    nextTimerOverride: null,
    extraTurn: false,
    resetCooldowns: false,
    chargeRefund: 0,
    scoreMultStolen: 0,
    rolls: [],
    notes: [],
  };

  runOps(ult.ops, out, ctx, rng);
  return out;
}

function runOps(
  ops: UltimateOp[],
  out: UltimateOutcome,
  ctx: UltimateContext,
  rng: () => number,
): void {
  for (const op of ops) {
    switch (op.op) {
      case "damage": {
        const dealt = dealDamage(op, out, ctx, rng);
        if (op.healFractionOfDamage !== undefined && dealt > 0) {
          applyHeal(Math.round(dealt * op.healFractionOfDamage), out);
        }
        break;
      }

      case "heal":
        applyHeal(op.amount, out);
        break;

      case "shield": {
        const before = out.caster.shield;
        out.caster.shield = clampShield(before + op.amount);
        out.notes.push(`+${out.caster.shield - before} shield.`);
        break;
      }

      case "selfDamage":
        out.selfDamage += op.amount;
        out.caster.hp = Math.max(0, out.caster.hp - op.amount);
        out.notes.push(`Backfires for ${op.amount}.`);
        break;

      case "timerDelta":
        out.timerDelta[op.target] += op.seconds;
        out.notes.push(
          op.seconds < 0
            ? `${op.target === "self" ? "Your" : "Their"} next clock loses ${-op.seconds}s.`
            : `${op.target === "self" ? "Your" : "Their"} next clock gains ${op.seconds}s.`,
        );
        break;

      case "setNextTimer":
        out.nextTimerOverride = {
          seconds: op.seconds,
          damagePerUnusedSecond: op.damagePerUnusedSecond,
        };
        out.notes.push(`Next clock pinned to ${op.seconds}s - unused seconds become damage.`);
        break;

      case "extraTurn":
        out.extraTurn = true;
        out.notes.push(`Takes another turn immediately.`);
        break;

      case "rewindHp": {
        // hpHistory[0] is one turn ago, so index turnsAgo-1. Falls back to the
        // oldest entry we have, and never rewinds *downward* - this is a heal.
        const idx = Math.min(op.turnsAgo - 1, ctx.hpHistory.length - 1);
        const past = idx >= 0 ? ctx.hpHistory[idx] : undefined;
        if (past !== undefined && past > out.caster.hp) {
          const gained = Math.min(past, out.caster.maxHp) - out.caster.hp;
          out.caster.hp += gained;
          out.healed += gained;
          out.notes.push(`Rewinds ${op.turnsAgo} turns - restores ${gained} HP.`);
        } else {
          out.notes.push(`Rewinds time, but the past held no more HP.`);
        }
        break;
      }

      case "clearDebuffs": {
        const side = op.target === "self" ? out.caster : out.target;
        const before = side.effects.length;
        side.effects = clearDebuffs(side.effects);
        const removed = before - side.effects.length;
        out.notes.push(removed > 0 ? `Cleanses ${removed} debuff(s).` : `Nothing to cleanse.`);
        break;
      }

      case "resetCooldowns":
        out.resetCooldowns = true;
        out.notes.push(`Cooldowns reset.`);
        break;

      case "permanentDamage":
        out.caster.bonusDamage += op.amount;
        out.notes.push(`Permanently gains +${op.amount} damage.`);
        break;

      case "stealScoreMult": {
        // Can only take what the target actually has above a neutral 1.0x.
        const available = Math.max(0, out.target.scoreMult - 1);
        const taken = Math.min(op.amount, available);
        out.target.scoreMult -= taken;
        out.caster.scoreMult += taken;
        out.scoreMultStolen = taken;
        out.notes.push(
          taken > 0
            ? `Steals ${Math.round(taken * 100)}% score multiplier.`
            : `No score multiplier to steal.`,
        );
        break;
      }

      case "averageStats": {
        const avgHp = Math.round((out.caster.hp + out.target.hp) / 2);
        // HP is averaged against each side's own max, so equalising cannot
        // push either fighter above their own bar.
        out.caster.hp = Math.min(out.caster.maxHp, avgHp);
        out.target.hp = Math.min(out.target.maxHp, avgHp);
        const avgScore = (out.caster.scoreMult + out.target.scoreMult) / 2;
        out.caster.scoreMult = avgScore;
        out.target.scoreMult = avgScore;
        // Damage and defense are stat-sheet values, so they are equalised by
        // handing both sides a matching adjustment rather than mutating the sheet.
        const avgDamage = Math.round(
          (out.caster.arch.baseDamage + out.caster.bonusDamage + out.target.arch.baseDamage) / 2,
        );
        out.caster.bonusDamage = avgDamage - out.caster.arch.baseDamage;
        out.target.bonusDamage = avgDamage - out.target.arch.baseDamage;
        const avgDef = (out.caster.arch.defense + out.target.arch.defense) / 2;
        for (const side of [out.caster, out.target]) {
          const delta = avgDef - side.arch.defense;
          if (Math.abs(delta) > 0.001) {
            side.effects = addEffect(
              side.effects,
              effect({ kind: "damageReduction", magnitude: Math.max(0, delta), turnsLeft: 99 }),
            );
          }
        }
        out.notes.push(`Both sides equalised at ${avgHp} HP and ${avgDamage} damage.`);
        break;
      }

      case "chargeUltimate":
        out.chargeRefund += op.fraction;
        out.notes.push(`Recovers ${Math.round(op.fraction * 100)}% ultimate charge.`);
        break;

      case "copyOpponentPassive":
        out.caster.effects = addEffect(
          out.caster.effects,
          effect({
            kind: "copiedPassive",
            magnitude: 1,
            turnsLeft: op.turns,
            passive: out.target.arch.id,
          }),
        );
        out.notes.push(`Copies ${out.target.arch.name}'s passive for ${op.turns} turns.`);
        break;

      case "effect": {
        const side = op.target === "self" ? out.caster : out.target;
        side.effects = addEffect(side.effects, effect(op.effect));
        out.notes.push(
          `${op.target === "self" ? "Gains" : "Inflicts"} ${effect(op.effect).label}.`,
        );
        break;
      }

      case "random": {
        const total = op.outcomes.reduce((s, o) => s + o.weight, 0);
        let roll = rng() * total;
        const picked = op.outcomes.find((o) => (roll -= o.weight) < 0) ?? op.outcomes.at(0);
        if (picked) {
          out.rolls.push(picked.label);
          runOps(picked.ops, out, ctx, rng);
        }
        break;
      }

      case "randomMany": {
        // Draw without replacement so nine tails cannot all roll the same wish.
        const pool = [...op.outcomes];
        const draws = Math.min(op.count, pool.length);
        for (let i = 0; i < draws; i++) {
          const idx = Math.floor(rng() * pool.length);
          const picked = pool.splice(idx, 1).at(0);
          if (!picked) break;
          out.rolls.push(picked.label);
          runOps(picked.ops, out, ctx, rng);
        }
        break;
      }
    }
  }
}

function applyHeal(amount: number, out: UltimateOutcome): void {
  // An ultimate's healing still respects a heal block and a class that cannot
  // heal at all - Tank's "cannot heal" is not bypassed by its own ultimate.
  if (out.caster.arch.healAmount === null) {
    out.notes.push(`Healing has no effect - this class cannot heal.`);
    return;
  }
  if (out.caster.effects.some((e) => e.kind === "healBlock")) {
    out.notes.push(`Healing blocked.`);
    return;
  }
  const gained = Math.min(amount, out.caster.maxHp - out.caster.hp);
  out.caster.hp += gained;
  out.healed += gained;
  out.notes.push(`Restores ${gained} HP.`);
}

/** Resolve one damage op, honouring true damage, shields, crits and reflects. */
function dealDamage(
  op: Extract<UltimateOp, { op: "damage" }>,
  out: UltimateOutcome,
  ctx: UltimateContext,
  rng: () => number,
): number {
  const hits = op.hits ?? 1;
  let dealt = 0;
  let crits = 0;

  for (let i = 0; i < hits; i++) {
    let raw = op.amount + out.caster.bonusDamage;

    const critChance = op.critChance ?? DAMAGE_TUNING.critChance;
    const didCrit =
      op.guaranteedCrit === true ||
      out.caster.effects.some((e) => e.kind === "guaranteedCrit") ||
      rng() < critChance;
    if (didCrit && out.caster.arch.critBonus > 0) {
      raw *= 1 + out.caster.arch.critBonus;
      crits++;
    }

    // The caster's own weakening still applies to ultimate damage.
    const debuff = out.caster.effects.reduce(
      (s, e) => (e.kind === "damageDebuff" ? s + e.magnitude : s),
      0,
    );
    if (debuff > 0) raw *= Math.max(0, 1 - debuff);

    // True damage skips DEF and the target's damageReduction effects alike -
    // that is what makes Newton's apple worth 45 flat.
    let incoming = Math.max(1, Math.floor(raw));
    if (!op.trueDamage) {
      incoming = applyDefense(incoming, out.target.arch);
      const reduction = out.target.effects.reduce(
        (s, e) => (e.kind === "damageReduction" ? s + e.magnitude : s),
        0,
      );
      if (reduction > 0) {
        incoming = Math.max(1, Math.floor(incoming * Math.max(0, 1 - Math.min(0.9, reduction))));
      }
    }

    // Count only the HP actually removed, not the damage rolled: an overkill
    // hit would otherwise report more than the target ever had, which would
    // then be sent over the PvP wire and shown in the log as a phantom number.
    const hpBefore = out.target.hp;
    if (op.ignoreShield) {
      out.target.hp = Math.max(0, hpBefore - incoming);
    } else {
      const { hpLoss, shieldLeft } = absorbWithShield(incoming, out.target.shield);
      out.target.shield = shieldLeft;
      out.target.hp = Math.max(0, hpBefore - hpLoss);
    }
    dealt += hpBefore - out.target.hp;

    // Reflect pays the attacker back a share of what actually landed.
    const reflect = out.target.effects.reduce(
      (s, e) => (e.kind === "reflect" ? s + e.magnitude : s),
      0,
    );
    if (reflect > 0) {
      const back = Math.max(1, Math.floor(incoming * reflect));
      out.caster.hp = Math.max(0, out.caster.hp - back);
      out.selfDamage += back;
    }
  }

  out.damageDealt += dealt;
  out.notes.push(
    `${dealt} damage${hits > 1 ? ` over ${hits} hits` : ""}${crits > 0 ? ` (${crits} crit${crits > 1 ? "s" : ""})` : ""}${op.trueDamage ? " - true damage" : ""}${op.ignoreShield ? " - through shields" : ""}.`,
  );

  // Griffinink: one immediate repeat if the volley left the target standing.
  if (op.repeatIfTargetSurvives && out.target.hp > 0) {
    out.notes.push(`The target survives - diving again.`);
    dealt += dealDamage({ ...op, repeatIfTargetSurvives: false }, out, ctx, rng);
  }

  return dealt;
}

/**
 * Damage for a normal Attack/Charge with the caster's active effects folded in.
 * Wraps `getEffectiveDamage` so buffs live in one place rather than being
 * re-derived at each of the engine's call sites.
 */
export function damageWithEffects(
  arch: Archetype,
  effects: ActiveEffect[],
  bonusDamage: number,
  opts: Parameters<typeof getEffectiveDamage>[1],
): { damage: number; crit: boolean; consumed: ("damageBuff" | "damageMult")[] } {
  const guaranteed = effects.some((e) => e.kind === "guaranteedCrit");
  const base = getEffectiveDamage(
    { ...arch, baseDamage: arch.baseDamage + bonusDamage },
    guaranteed ? { ...opts, allowCrit: false } : opts,
  );

  let damage = base.damage;
  let crit = base.crit;
  const consumed: ("damageBuff" | "damageMult")[] = [];

  if (guaranteed && arch.critBonus > 0) {
    damage = Math.floor(damage * (1 + arch.critBonus));
    crit = true;
  }

  const flat = effects.reduce((s, e) => (e.kind === "damageBuff" ? s + e.magnitude : s), 0);
  if (flat > 0) {
    damage += Math.round(flat);
    consumed.push("damageBuff");
  }

  const mult = effects.find((e) => e.kind === "damageMult");
  if (mult) {
    damage = Math.floor(damage * mult.magnitude);
    consumed.push("damageMult");
  }

  const debuff = effects.reduce((s, e) => (e.kind === "damageDebuff" ? s + e.magnitude : s), 0);
  if (debuff > 0) damage = Math.max(1, Math.floor(damage * Math.max(0, 1 - debuff)));

  return { damage: Math.max(1, damage), crit, consumed };
}

/** Incoming damage after the defender's DEF *and* their damageReduction effects. */
export function defendWithEffects(
  raw: number,
  defender: Archetype,
  effects: ActiveEffect[],
  copied?: ArchetypeId | null,
): number {
  let dmg = applyDefense(raw, defender, copied);
  const reduction = effects.reduce(
    (s, e) => (e.kind === "damageReduction" ? s + e.magnitude : s),
    0,
  );
  if (reduction > 0) {
    dmg = Math.max(1, Math.floor(dmg * Math.max(0, 1 - Math.min(0.9, reduction))));
  }
  return dmg;
}
