import type { ArchetypeId } from "./types";

/**
 * Status effects - the layer Ecliptar ultimates write into.
 *
 * Ultimates are declarative (see ultimates.ts): each one is a list of ops, and
 * the ones that outlast their turn land here as `ActiveEffect`s. Keeping them a
 * flat, serialisable list (rather than a bag of booleans on the fighter) is what
 * lets the same code drive the player, the bot and live PvP, and
 * lets the UI render "what is currently true about this fighter" generically.
 *
 * Durations come in two flavours, because the spec uses both:
 * - **turn-based** ("for 3 turns", "poisons for 5 turns") - ticks down at the
 *   end of the owner's turn.
 * - **use-based** ("+10 damage for the next 2 attacks") - ticks down when the
 *   effect actually modifies something.
 */
export type EffectKind =
  /** Damage at the start of the owner's turn. `escalate` adds itself each tick. */
  | "poison"
  /** Healing at the start of the owner's turn. */
  | "regen"
  /** Flat bonus damage on the owner's next `usesLeft` attacks. */
  | "damageBuff"
  /** Multiplies the owner's next `usesLeft` attacks. */
  | "damageMult"
  /** Fractional reduction of damage the owner receives. */
  | "damageReduction"
  /** Fraction of received damage sent back to the attacker. */
  | "reflect"
  /** Owner loses their turn entirely. */
  | "freeze"
  /** Owner cannot heal. */
  | "healBlock"
  /** Additive score-multiplier bonus while active. */
  | "scoreMult"
  /** Owner's attacks always crit. */
  | "guaranteedCrit"
  /** Fractional reduction of the damage the owner deals. */
  | "damageDebuff"
  /** Owner has borrowed the named archetype's passive (Petrona). */
  | "copiedPassive";

/** Effects whose duration is spent by being used rather than by time passing. */
const USE_BASED: ReadonlySet<EffectKind> = new Set<EffectKind>(["damageBuff", "damageMult"]);

export function isUseBased(kind: EffectKind): boolean {
  return USE_BASED.has(kind);
}

export interface ActiveEffect {
  kind: EffectKind;
  /** Flat amount, or a fraction for the percentage kinds. */
  magnitude: number;
  /** Remaining owner-turns, for turn-based kinds. */
  turnsLeft?: number | undefined;
  /** Remaining applications, for use-based kinds. */
  usesLeft?: number | undefined;
  /** Poison only: added to `magnitude` after each tick. */
  escalate?: number | undefined;
  /** copiedPassive only: whose passive is borrowed. */
  passive?: ArchetypeId | undefined;
  /** Short label for the UI chip, e.g. "POISON 3". */
  label: string;
}

/** Sum the magnitudes of every active effect of a kind. */
export function totalOf(effects: ActiveEffect[], kind: EffectKind): number {
  return effects.reduce((sum, e) => (e.kind === kind ? sum + e.magnitude : sum), 0);
}

export function has(effects: ActiveEffect[], kind: EffectKind): boolean {
  return effects.some((e) => e.kind === kind);
}

/**
 * Stacking rule: a second cast of the same kind refreshes rather than stacks,
 * taking the stronger magnitude and the longer remaining duration. Without this
 * a player could chain one ultimate into an unbounded pile of the same buff.
 * `poison` is the exception - escalating stacks are its whole identity, so
 * re-applying it restarts the ramp at the higher magnitude.
 */
export function addEffect(effects: ActiveEffect[], next: ActiveEffect): ActiveEffect[] {
  const i = effects.findIndex((e) => e.kind === next.kind);
  const cur = i === -1 ? undefined : effects[i];
  if (!cur) return [...effects, next];
  const merged: ActiveEffect = {
    ...next,
    magnitude: Math.max(cur.magnitude, next.magnitude),
    turnsLeft:
      cur.turnsLeft !== undefined || next.turnsLeft !== undefined
        ? Math.max(cur.turnsLeft ?? 0, next.turnsLeft ?? 0)
        : undefined,
    usesLeft:
      cur.usesLeft !== undefined || next.usesLeft !== undefined
        ? Math.max(cur.usesLeft ?? 0, next.usesLeft ?? 0)
        : undefined,
  };
  const copy = [...effects];
  copy[i] = merged;
  return copy;
}

/** Spend one application of a use-based effect, dropping it when exhausted. */
export function consumeUse(effects: ActiveEffect[], kind: EffectKind): ActiveEffect[] {
  const i = effects.findIndex((e) => e.kind === kind);
  const cur = i === -1 ? undefined : effects[i];
  if (!cur) return effects;
  const usesLeft = (cur.usesLeft ?? 1) - 1;
  const copy = [...effects];
  if (usesLeft <= 0) {
    copy.splice(i, 1);
  } else {
    const spent: ActiveEffect = { ...cur, usesLeft };
    copy[i] = { ...spent, label: labelFor(spent) };
  }
  return copy;
}

/** Everything the owner's turn-start tick produced. */
export interface TickResult {
  effects: ActiveEffect[];
  /** Poison damage to apply (bypasses DEF - it is already "true" damage). */
  poisonDamage: number;
  /** Regen healing to apply, before any heal-block check. */
  regenHeal: number;
  /** True when a freeze consumed this turn. */
  frozen: boolean;
  /** Human-readable lines for the battle log. */
  notes: string[];
}

/**
 * Advance every turn-based effect by one of the owner's turns, collecting the
 * damage-over-time and heal-over-time it produces. Use-based effects are
 * untouched - they expire through `consumeUse`.
 */
export function tickEffects(effects: ActiveEffect[]): TickResult {
  let poisonDamage = 0;
  let regenHeal = 0;
  let frozen = false;
  const notes: string[] = [];
  const next: ActiveEffect[] = [];

  for (const e of effects) {
    if (isUseBased(e.kind)) {
      next.push(e);
      continue;
    }

    if (e.kind === "poison") {
      poisonDamage += Math.round(e.magnitude);
      notes.push(`Poison bites for ${Math.round(e.magnitude)}.`);
    } else if (e.kind === "regen") {
      regenHeal += Math.round(e.magnitude);
      notes.push(`Regeneration restores ${Math.round(e.magnitude)} HP.`);
    } else if (e.kind === "freeze") {
      frozen = true;
      notes.push(`Frozen - the turn is lost.`);
    }

    const turnsLeft = (e.turnsLeft ?? 1) - 1;
    if (turnsLeft > 0) {
      const magnitude = e.kind === "poison" ? e.magnitude + (e.escalate ?? 0) : e.magnitude;
      const advanced = { ...e, turnsLeft, magnitude };
      next.push({ ...advanced, label: labelFor(advanced) });
    }
  }

  return { effects: next, poisonDamage, regenHeal, frozen, notes };
}

/** Drop every harmful effect, keeping buffs (Brighteye, Einsteinium, Temporobys). */
const HARMFUL: ReadonlySet<EffectKind> = new Set<EffectKind>([
  "poison",
  "freeze",
  "healBlock",
  "damageDebuff",
]);

export function clearDebuffs(effects: ActiveEffect[]): ActiveEffect[] {
  return effects.filter((e) => !HARMFUL.has(e.kind));
}

export function isHarmful(kind: EffectKind): boolean {
  return HARMFUL.has(kind);
}

/** Chip text for the UI and log, e.g. "POISON 20 | 3T" or "DMG +12 | 3x". */
export function labelFor(e: Omit<ActiveEffect, "label">): string {
  const dur =
    e.usesLeft !== undefined ? ` | ${e.usesLeft}x` : e.turnsLeft ? ` | ${e.turnsLeft}T` : "";
  const pct = (m: number) => `${Math.round(m * 100)}%`;
  switch (e.kind) {
    case "poison":
      return `POISON ${Math.round(e.magnitude)}${dur}`;
    case "regen":
      return `REGEN ${Math.round(e.magnitude)}${dur}`;
    case "damageBuff":
      return `DMG +${Math.round(e.magnitude)}${dur}`;
    case "damageMult":
      return `DMG x${e.magnitude}${dur}`;
    case "damageReduction":
      return `ARMOUR ${pct(e.magnitude)}${dur}`;
    case "reflect":
      return `REFLECT ${pct(e.magnitude)}${dur}`;
    case "freeze":
      return `FROZEN${dur}`;
    case "healBlock":
      return `NO HEAL${dur}`;
    case "scoreMult":
      return `SCORE +${pct(e.magnitude)}${dur}`;
    case "guaranteedCrit":
      return `CRIT LOCK${dur}`;
    case "damageDebuff":
      return `WEAKENED ${pct(e.magnitude)}${dur}`;
    case "copiedPassive":
      return `COPIED${dur}`;
  }
}

/** Build an effect with its label derived, so callers never set it by hand. */
export function effect(e: Omit<ActiveEffect, "label">): ActiveEffect {
  return { ...e, label: labelFor(e) };
}
