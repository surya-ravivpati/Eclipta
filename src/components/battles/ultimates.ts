import type { ArchetypeId } from "./types";
import { effect, type ActiveEffect } from "./effects";

/**
 * Ecliptar ultimates — one signature move per creature, replacing the old Wild
 * action. There are 32 of them, so they are **data, not code**: each ultimate is
 * a list of `UltimateOp`s that the resolver in KnowledgeBattles interprets. That
 * keeps the engine one switch wide instead of 32 branches, makes every ultimate
 * inspectable by tests, and means a new Ecliptar is a table entry.
 *
 * Keyed by Ecliptar slug (see lib/ecliptars.ts) — the slugs are a server claim
 * contract and never change, unlike the display names.
 */

export type UltimateOp =
  /** Straight damage. `trueDamage` skips DEF; `ignoreShield` skips the absorb pool. */
  | {
      op: "damage";
      amount: number;
      hits?: number;
      trueDamage?: boolean;
      ignoreShield?: boolean;
      /** Per-hit crit chance override; omit to use the global rate. */
      critChance?: number;
      guaranteedCrit?: boolean;
      /** Griffinink: if the target survives the whole volley, swing again. */
      repeatIfTargetSurvives?: boolean;
      /** Fuego: heal for this fraction of the damage actually dealt. */
      healFractionOfDamage?: number;
    }
  | { op: "heal"; amount: number }
  | { op: "shield"; amount: number }
  | { op: "selfDamage"; amount: number }
  /** Negative seconds shorten the target's next question clock. */
  | { op: "timerDelta"; seconds: number; target: "self" | "opponent" }
  /** Correr: pin the next clock, paying out damage for every unused second. */
  | { op: "setNextTimer"; seconds: number; damagePerUnusedSecond: number }
  | { op: "extraTurn" }
  /** Temporobys: restore HP to its value this many of the owner's turns ago. */
  | { op: "rewindHp"; turnsAgo: number }
  | { op: "clearDebuffs"; target: "self" | "opponent" }
  | { op: "resetCooldowns" }
  /** Chronovex: a permanent, match-long base-damage gain. */
  | { op: "permanentDamage"; amount: number }
  /** Nitpick: take a slice of the opponent's score multiplier for yourself. */
  | { op: "stealScoreMult"; amount: number }
  /** Equinox: average HP, damage, defense and score multiplier across both sides. */
  | { op: "averageStats" }
  /** Fortunox: top the ultimate charge back up. */
  | { op: "chargeUltimate"; fraction: number }
  /** Petrona: borrow the opponent archetype's passive for a while. */
  | { op: "copyOpponentPassive"; turns: number }
  /** Any lasting effect, applied to either side. */
  | { op: "effect"; target: "self" | "opponent"; effect: Omit<ActiveEffect, "label"> }
  /** Gamblers and Ticonder: pick exactly one branch, each with its own weight. */
  | { op: "random"; outcomes: { weight: number; label: string; ops: UltimateOp[] }[] }
  /** Fortunox: roll `count` distinct blessings from the pool. */
  | { op: "randomMany"; count: number; outcomes: { label: string; ops: UltimateOp[] }[] };

export interface Ultimate {
  /** Ecliptar slug this belongs to. */
  slug: string;
  name: string;
  /** Player-facing description — the spec text, shown on the button and overlay. */
  description: string;
  /** Terse button subtitle, since the full description is too long for the tile. */
  tag: string;
  ops: UltimateOp[];
}

const eff = (target: "self" | "opponent", e: Omit<ActiveEffect, "label">): UltimateOp => ({
  op: "effect",
  target,
  effect: e,
});

/**
 * `satisfies` rather than a `Record<string, Ultimate>` annotation: it still
 * checks every entry against `Ultimate`, but keeps the literal key union, so
 * `ULTIMATES.newton` is a known `Ultimate` instead of a possibly-undefined
 * index lookup. Runtime lookups by an arbitrary slug go through `getUltimate`.
 */
export const ULTIMATES = {
  // ── God ──────────────────────────────────────────────────────────────
  newton: {
    slug: "newton",
    name: "Gravity's Revelation",
    description:
      "Drops the Golden Apple, dealing 45 true damage, reducing the opponent's next timer by 10s, and healing 15 HP.",
    tag: "45 true · −10s · +15 HP",
    ops: [
      { op: "damage", amount: 45, trueDamage: true },
      { op: "timerDelta", seconds: -10, target: "opponent" },
      { op: "heal", amount: 15 },
    ],
  },
  ecliptadon: {
    slug: "ecliptadon",
    name: "Eclipse Cataclysm",
    description:
      "Unleashes an eclipse beam that deals 55 damage, ignores shields, and grants +20% score multiplier for 2 turns.",
    tag: "55 · ignores shields",
    ops: [
      { op: "damage", amount: 55, ignoreShield: true },
      eff("self", { kind: "scoreMult", magnitude: 0.2, turnsLeft: 2 }),
    ],
  },
  einsteinium: {
    slug: "einsteinium",
    name: "Theory of Relativity",
    description:
      "Slows time — the opponent loses a turn to the freeze and 6 seconds off the clock after it, while the next attack lands at double damage.",
    tag: "Freeze · −6s · 2× next",
    ops: [
      eff("opponent", { kind: "freeze", magnitude: 1, turnsLeft: 1 }),
      eff("self", { kind: "damageMult", magnitude: 2, usesLeft: 1 }),
      // Was `heal 10`, which lands on nobody at full HP — so a healthy caster
      // spent a charge and felt nothing. A clock cut always registers.
      { op: "timerDelta", seconds: -6, target: "opponent" },
    ],
  },
  temporobys: {
    slug: "temporobys",
    name: "Infinite Cycle",
    description:
      "Rewinds time, restoring HP to what it was 2 turns ago, removing all debuffs, and resetting cooldowns.",
    tag: "Rewind HP · cleanse",
    ops: [
      { op: "rewindHp", turnsAgo: 2 },
      { op: "clearDebuffs", target: "self" },
      { op: "resetCooldowns" },
    ],
  },

  // ── Speedster ────────────────────────────────────────────────────────
  "speedster-a": {
    slug: "speedster-a",
    name: "Razor Dive",
    description:
      "Performs a supersonic dive for a guaranteed critical hit. If the opponent survives, immediately attacks again.",
    tag: "Guaranteed crit · repeats",
    ops: [{ op: "damage", amount: 30, guaranteedCrit: true, repeatIfTargetSurvives: true }],
  },
  "speedster-b": {
    slug: "speedster-b",
    name: "Thunder Rush",
    description:
      "Strikes 3 times with electricity. Each hit reduces the opponent's next timer by 3 seconds.",
    tag: "3 hits · −9s total",
    ops: [
      { op: "damage", amount: 12, hits: 3 },
      { op: "timerDelta", seconds: -9, target: "opponent" },
    ],
  },
  "speedster-c": {
    slug: "speedster-c",
    name: "Velocity Break",
    description:
      "Your next question timer becomes 15 seconds, but every unused second adds +2 damage.",
    tag: "15s clock · +2/s unused",
    ops: [{ op: "setNextTimer", seconds: 15, damagePerUnusedSecond: 2 }],
  },
  "speedster-d": {
    slug: "speedster-d",
    name: "Cyclone Kick",
    description:
      "Spins into a three-hit tornado and rides the momentum — 12 damage a hit, then six seconds swing off the opponent's clock and onto its own.",
    tag: "3×12 · swing 6s",
    ops: [
      { op: "damage", amount: 12, hits: 3 },
      { op: "timerDelta", seconds: -6, target: "opponent" },
      { op: "timerDelta", seconds: 6, target: "self" },
    ],
  },

  // ── Tank ─────────────────────────────────────────────────────────────
  "tank-a": {
    slug: "tank-a",
    name: "Mountain Crash",
    description: "Rolls into a giant boulder, dealing 40 damage and gaining a 40 HP shield.",
    tag: "40 dmg · 40 shield",
    ops: [
      { op: "damage", amount: 40 },
      { op: "shield", amount: 40 },
    ],
  },
  "tank-b": {
    slug: "tank-b",
    name: "Adaptive Armor",
    description:
      "Slams fresh plating into place for 20 shield, then reconfigures — all incoming damage cut by 60% for 3 turns.",
    tag: "20 shield · −60% dmg · 3T",
    ops: [
      { op: "shield", amount: 20 },
      eff("self", { kind: "damageReduction", magnitude: 0.6, turnsLeft: 3 }),
    ],
  },
  "tank-c": {
    slug: "tank-c",
    name: "Earthshaker Stampede",
    description:
      "Charges forward, dealing 45 damage and preventing the opponent from healing next turn.",
    tag: "45 dmg · heal lock",
    ops: [
      { op: "damage", amount: 45 },
      eff("opponent", { kind: "healBlock", magnitude: 1, turnsLeft: 1 }),
    ],
  },
  "tank-d": {
    slug: "tank-d",
    name: "Fortress Roar",
    description: "Gains a 50 HP shield and reflects 25% of incoming damage for 3 turns.",
    tag: "50 shield · 25% reflect",
    ops: [
      { op: "shield", amount: 50 },
      eff("self", { kind: "reflect", magnitude: 0.25, turnsLeft: 3 }),
    ],
  },

  // ── Apex ─────────────────────────────────────────────────────────────
  "chud-a": {
    slug: "chud-a",
    name: "Sky Execution",
    description:
      "Launches a storm of razor feathers, hitting 5 times, each with a 25% crit chance.",
    tag: "5 hits · 25% crit each",
    ops: [{ op: "damage", amount: 11, hits: 5, critChance: 0.25 }],
  },
  "chud-b": {
    slug: "chud-b",
    name: "Frozen Throne",
    description: "Freezes the opponent for one turn, deals 40 damage, and gains a 20 HP shield.",
    tag: "Freeze · 40 · 20 shield",
    ops: [
      eff("opponent", { kind: "freeze", magnitude: 1, turnsLeft: 1 }),
      { op: "damage", amount: 40 },
      { op: "shield", amount: 20 },
    ],
  },
  "chud-c": {
    slug: "chud-c",
    name: "Midnight Forest",
    description:
      "Summons cursed vines, dealing 20 initial damage and poisoning the opponent for 3 turns.",
    tag: "20 dmg · poison 3T",
    ops: [
      { op: "damage", amount: 20 },
      eff("opponent", { kind: "poison", magnitude: 10, turnsLeft: 3 }),
    ],
  },
  "chud-d": {
    slug: "chud-d",
    name: '"Actually..."',
    description:
      "Exposes every weakness, reducing the opponent's damage by 40% and stealing 10% score multiplier.",
    tag: "−40% their DMG · steal 10%",
    ops: [
      eff("opponent", { kind: "damageDebuff", magnitude: 0.4, turnsLeft: 3 }),
      { op: "stealScoreMult", amount: 0.1 },
    ],
  },

  // ── Gambler ──────────────────────────────────────────────────────────
  "gambler-a": {
    slug: "gambler-a",
    name: "High Stakes",
    description:
      "Rolls three giant dice. Randomly grants massive damage, massive healing, bonus multiplier, or self-damage.",
    tag: "Three dice · all-or-nothing",
    ops: [
      {
        op: "random",
        outcomes: [
          { weight: 3, label: "MASSIVE DAMAGE", ops: [{ op: "damage", amount: 70 }] },
          { weight: 3, label: "MASSIVE HEAL", ops: [{ op: "heal", amount: 70 }] },
          {
            weight: 3,
            label: "BONUS MULTIPLIER",
            ops: [eff("self", { kind: "scoreMult", magnitude: 0.5, turnsLeft: 3 })],
          },
          { weight: 1, label: "BACKFIRE", ops: [{ op: "selfDamage", amount: 30 }] },
        ],
      },
    ],
  },
  "gambler-b": {
    slug: "gambler-b",
    name: "Snake Eyes",
    description:
      "Spins a slot machine. Matching symbols can trigger critical damage, healing, or a backfire.",
    tag: "Slot spin · crit or backfire",
    ops: [
      {
        op: "random",
        outcomes: [
          {
            weight: 3,
            label: "TRIPLE SEVENS",
            ops: [{ op: "damage", amount: 40, guaranteedCrit: true }],
          },
          { weight: 3, label: "CHERRIES", ops: [{ op: "heal", amount: 45 }] },
          {
            weight: 2,
            label: "BELLS",
            ops: [
              { op: "damage", amount: 25 },
              { op: "shield", amount: 20 },
            ],
          },
          { weight: 2, label: "SNAKE EYES", ops: [{ op: "selfDamage", amount: 25 }] },
        ],
      },
    ],
  },
  "gambler-c": {
    slug: "gambler-c",
    name: "Wheel of Fortune",
    description:
      "Spins a roulette wheel to randomly gain double damage, double healing, an extra turn, a multiplier boost, or nothing.",
    tag: "Roulette · five outcomes",
    ops: [
      {
        op: "random",
        outcomes: [
          {
            weight: 2,
            label: "DOUBLE DAMAGE",
            ops: [eff("self", { kind: "damageMult", magnitude: 2, usesLeft: 1 })],
          },
          { weight: 2, label: "DOUBLE HEALING", ops: [{ op: "heal", amount: 50 }] },
          { weight: 2, label: "EXTRA TURN", ops: [{ op: "extraTurn" }] },
          {
            weight: 2,
            label: "MULTIPLIER BOOST",
            ops: [eff("self", { kind: "scoreMult", magnitude: 0.35, turnsLeft: 3 })],
          },
          { weight: 1, label: "NOTHING", ops: [] },
        ],
      },
    ],
  },
  "gambler-d": {
    slug: "gambler-d",
    name: "Nine Lucky Tails",
    description:
      "Each of its nine tails grants a random blessing such as shield, healing, crit chance, damage, defense, time, multiplier, speed, or ultimate charge.",
    tag: "Three of nine blessings",
    ops: [
      {
        op: "randomMany",
        count: 3,
        outcomes: [
          { label: "SHIELD", ops: [{ op: "shield", amount: 25 }] },
          { label: "HEALING", ops: [{ op: "heal", amount: 30 }] },
          {
            label: "CRIT",
            ops: [eff("self", { kind: "guaranteedCrit", magnitude: 1, turnsLeft: 2 })],
          },
          { label: "DAMAGE", ops: [{ op: "damage", amount: 30 }] },
          {
            label: "DEFENSE",
            ops: [eff("self", { kind: "damageReduction", magnitude: 0.3, turnsLeft: 3 })],
          },
          { label: "TIME", ops: [{ op: "timerDelta", seconds: -6, target: "opponent" }] },
          {
            label: "MULTIPLIER",
            ops: [eff("self", { kind: "scoreMult", magnitude: 0.25, turnsLeft: 3 })],
          },
          {
            label: "SPEED",
            ops: [eff("self", { kind: "damageBuff", magnitude: 8, usesLeft: 2 })],
          },
          { label: "ULTIMATE CHARGE", ops: [{ op: "chargeUltimate", fraction: 0.5 }] },
        ],
      },
    ],
  },

  // ── Healer ───────────────────────────────────────────────────────────
  "healer-a": {
    slug: "healer-a",
    name: "Divine Grace",
    description: "Restores 60 HP, removes all debuffs, and grants a 20 HP shield.",
    tag: "+60 HP · cleanse · 20 shield",
    ops: [
      { op: "heal", amount: 60 },
      { op: "clearDebuffs", target: "self" },
      { op: "shield", amount: 20 },
    ],
  },
  "healer-b": {
    slug: "healer-b",
    name: "Feast of Champions",
    description:
      "Serves a legendary meal, healing 40 HP and granting +10 damage for the next 2 attacks.",
    tag: "+40 HP · +10 DMG ×2",
    ops: [
      { op: "heal", amount: 40 },
      eff("self", { kind: "damageBuff", magnitude: 10, usesLeft: 2 }),
    ],
  },
  "healer-c": {
    slug: "healer-c",
    name: "World Tree",
    description:
      "Roots take hold for an immediate 15 HP, then keep giving — 15 HP a turn for 4 turns.",
    tag: "+15 now · +15/turn · 4T",
    ops: [{ op: "heal", amount: 15 }, eff("self", { kind: "regen", magnitude: 15, turnsLeft: 4 })],
  },
  "healer-d": {
    slug: "healer-d",
    name: "Nature's Embrace",
    description: "Covers itself in living vines, healing 30 HP and gaining a 35 HP shield.",
    tag: "+30 HP · 35 shield",
    ops: [
      { op: "heal", amount: 30 },
      { op: "shield", amount: 35 },
    ],
  },

  // ── Fulcrum ──────────────────────────────────────────────────────────
  "fulcrum-a": {
    slug: "fulcrum-a",
    name: "Infernal Balance",
    description: "Deals 40 damage while healing for 50% of the damage dealt.",
    tag: "40 dmg · drain 50%",
    ops: [{ op: "damage", amount: 40, healFractionOfDamage: 0.5 }],
  },
  "fulcrum-b": {
    slug: "fulcrum-b",
    name: "Arcane Reflection",
    description: "Copies the opponent's passive ability for 3 turns.",
    tag: "Copy passive · 3 turns",
    ops: [{ op: "copyOpponentPassive", turns: 3 }],
  },
  "fulcrum-c": {
    slug: "fulcrum-c",
    name: "Tactical Overdrive",
    description:
      "Randomly shifts into Attack Mode, Defense Mode, or Healing Mode, granting a powerful temporary buff.",
    tag: "Random combat mode",
    ops: [
      {
        op: "random",
        outcomes: [
          {
            weight: 1,
            label: "ATTACK MODE",
            ops: [eff("self", { kind: "damageBuff", magnitude: 15, usesLeft: 3 })],
          },
          {
            weight: 1,
            label: "DEFENSE MODE",
            ops: [eff("self", { kind: "damageReduction", magnitude: 0.5, turnsLeft: 3 })],
          },
          {
            weight: 1,
            label: "HEALING MODE",
            ops: [eff("self", { kind: "regen", magnitude: 18, turnsLeft: 3 })],
          },
        ],
      },
    ],
  },
  "fulcrum-d": {
    slug: "fulcrum-d",
    name: "Perfect Balance",
    description:
      "Averages both players' HP, damage, defense, and score multiplier, completely changing the state of the battle.",
    tag: "Equalise the battle",
    ops: [{ op: "averageStats" }],
  },

  // ── Accelerator ──────────────────────────────────────────────────────
  "accelerator-a": {
    slug: "accelerator-a",
    name: "Venom Surge",
    description:
      "Sinks the fangs in for 10 damage, then leaves a toxin that worsens every turn for 5 turns.",
    tag: "10 · escalating poison 5T",
    ops: [
      { op: "damage", amount: 10 },
      eff("opponent", { kind: "poison", magnitude: 8, turnsLeft: 5, escalate: 4 }),
    ],
  },
  "accelerator-b": {
    slug: "accelerator-b",
    name: "Steam Reactor",
    description:
      "Blows the pressure valves for 8 scalding damage, then runs hot — +12 damage on each of the next 3 attacks.",
    tag: "8 · +12 DMG ×3",
    ops: [
      { op: "damage", amount: 8 },
      eff("self", { kind: "damageBuff", magnitude: 12, usesLeft: 3 }),
    ],
  },
  "accelerator-c": {
    slug: "accelerator-c",
    name: "Predator's Instinct",
    description:
      "Locks on, and the world slows — 6 extra seconds on its own next clock, and every attack crits for 2 turns.",
    tag: "+6s · guaranteed crits 2T",
    ops: [
      { op: "timerDelta", seconds: 6, target: "self" },
      eff("self", { kind: "guaranteedCrit", magnitude: 1, turnsLeft: 2 }),
    ],
  },
  "accelerator-d": {
    slug: "accelerator-d",
    name: "Time Fracture",
    description:
      "Tears through time to immediately take another turn, permanently gains +5 damage, and reduces the opponent's next timer by 8 seconds.",
    tag: "Extra turn · +5 DMG · −8s",
    ops: [
      { op: "extraTurn" },
      { op: "permanentDamage", amount: 5 },
      { op: "timerDelta", seconds: -8, target: "opponent" },
    ],
  },
} satisfies Record<string, Ultimate>;

/** Slugs that actually have an ultimate defined. */
export type UltimateSlug = keyof typeof ULTIMATES;

/**
 * The table widened for lookups by a slug that is only known at runtime (an
 * equipped Ecliptar, a bot's draw). Callers that know the slug statically should
 * index ULTIMATES directly and keep the precise type.
 */
const BY_SLUG: Record<string, Ultimate | undefined> = ULTIMATES;

/** The ultimate for an equipped Ecliptar, or null when it has none defined. */
export function getUltimate(slug: string | null | undefined): Ultimate | null {
  if (!slug) return null;
  return BY_SLUG[slug] ?? null;
}

/**
 * Every ultimate an archetype's Ecliptars can bring. Used to give bot opponents
 * a real ultimate rather than a generic one — a Tank bot should roar, not poison.
 */
export function ultimatesForArchetype(
  arch: ArchetypeId,
  slugsByArchetype: (a: ArchetypeId) => string[],
): Ultimate[] {
  return slugsByArchetype(arch)
    .map((s) => BY_SLUG[s])
    .filter((u): u is Ultimate => Boolean(u));
}

/** Turn an op list into the effects it would apply, for previews and tests. */
export function effectsFromOps(ops: UltimateOp[]): ActiveEffect[] {
  return ops.filter((o) => o.op === "effect").map((o) => effect(o.effect));
}
