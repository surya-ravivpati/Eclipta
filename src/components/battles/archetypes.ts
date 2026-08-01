import {
  Zap,
  Shield,
  Skull,
  Dice5,
  Heart,
  Scale,
  FastForward,
  Crown,
  User,
  Bot,
} from "lucide-react";
import type { Archetype, ArchetypeId, GamblerRoll } from "./types";

/**
 * Roster stat sheet. Every archetype is defined by seven readable numbers —
 * HP, DMG, DEF, TIME, HEAL, CRIT, question difficulty — plus one signature
 * passive. There is deliberately **no damage multiplier stat**: streak scaling
 * used to compound on top of base damage and ended matches far too quickly, so
 * momentum now feeds score only (see stat-mechanics.ts).
 */
export const ARCHETYPES: Record<ArchetypeId, Archetype> = {
  speedster: {
    id: "speedster",
    name: "The Speedster",
    icon: Zap,
    color: "text-cyan-400",
    borderColor: "border-cyan-400/40",
    description:
      "Fast, pressured gameplay. The shortest clock in the roster — but the faster you answer, the harder you hit.",
    passive: "Damage scales with time remaining",
    maxHp: 130,
    baseDamage: 16,
    defense: 0.05,
    critBonus: 0.2,
    healAmount: 10,
    timeSeconds: 30,
    timeSecondsRange: [20, 40],
    diffMin: 3,
    diffMax: 6,
    focusPool: 60,
    startFocus: 10,
    damageIsTimeScaled: true,
  },
  tank: {
    id: "tank",
    name: "The Tank",
    icon: Shield,
    color: "text-tier-silver",
    borderColor: "border-tier-silver/40",
    description:
      "Heavy, durable, easy questions. The biggest HP pool and the best armour — but the lowest damage, and no way to heal.",
    passive: "Cannot heal. Takes 20% less damage",
    maxHp: 220,
    baseDamage: 11,
    defense: 0.2,
    critBonus: 0,
    healAmount: null,
    timeSeconds: 25,
    diffMin: 2,
    diffMax: 5,
    focusPool: 120,
    startFocus: 20,
  },
  chud: {
    id: "chud",
    name: "Apex",
    icon: Skull,
    color: "text-tier-champion",
    borderColor: "border-tier-champion/40",
    description:
      "Glass cannon. The hardest hits and the meanest crits on the thinnest HP bar — and it gets deadlier as it dies.",
    passive: "Below 35 HP gains +30% damage",
    maxHp: 95,
    baseDamage: 34,
    defense: 0,
    critBonus: 0.25,
    healAmount: 10,
    timeSeconds: 50,
    diffMin: 6,
    diffMax: 9,
    focusPool: 140,
    startFocus: 40,
    ragesWhenLow: true,
  },
  gambler: {
    id: "gambler",
    name: "The Gambler",
    icon: Dice5,
    color: "text-tier-gold",
    borderColor: "border-tier-gold/40",
    description:
      "All stats randomized each battle. Could be godlike — could be garbage. Pure chaos.",
    passive: "All stats reroll at the start of each match",
    maxHp: 155,
    baseDamage: 25,
    defense: 0.1,
    critBonus: 0.2,
    healAmount: 15,
    timeSeconds: 50,
    diffMin: 2,
    diffMax: 10,
    focusPool: 100,
    startFocus: 20,
    statsAreRandom: true,
  },
  healer: {
    id: "healer",
    name: "The Healer",
    icon: Heart,
    color: "text-pink-400",
    borderColor: "border-pink-400/40",
    description:
      "Sustain-focused: the strongest HP restore, the longest clock, and easy questions. Wins by outlasting, not out-hitting.",
    passive: "Heal also grants an 8 HP shield",
    maxHp: 145,
    baseDamage: 14,
    defense: 0.08,
    critBonus: 0.05,
    healAmount: 24,
    timeSeconds: 70,
    diffMin: 2,
    diffMax: 5,
    focusPool: 110,
    startFocus: 20,
    healGrantsShield: true,
  },
  fulcrum: {
    id: "fulcrum",
    name: "The Fulcrum",
    icon: Scale,
    color: "text-violet-400",
    borderColor: "border-violet-400/40",
    description:
      "Balanced all-rounder that borrows from the rest of the roster. Never the best at anything — never without an answer.",
    passive: "Copies a random passive each round (reduced)",
    maxHp: 165,
    baseDamage: 18,
    defense: 0.1,
    critBonus: 0.1,
    healAmount: 16,
    timeSeconds: 60,
    diffMin: 4,
    diffMax: 6,
    focusPool: 100,
    startFocus: 20,
    copiesPassive: true,
  },
  accelerator: {
    id: "accelerator",
    name: "The Accelerator",
    icon: FastForward,
    color: "text-tier-platinum",
    borderColor: "border-tier-platinum/40",
    description:
      "Scaling power over time. Every correct answer permanently sharpens your damage (14→30) and your score bonus (up to +35%).",
    passive: "+2 DMG and +2% score per correct answer",
    maxHp: 165,
    baseDamage: 14,
    defense: 0.1,
    critBonus: 0.1,
    healAmount: 18,
    timeSeconds: 35,
    diffMin: 3,
    diffMax: 7,
    focusPool: 90,
    startFocus: 20,
    damageRamps: true,
  },
  god: {
    id: "god",
    name: "The God",
    icon: Crown,
    color: "text-tier-god",
    borderColor: "border-tier-god/40",
    description:
      "Endgame archetype. Towering stats and the hardest questions in the game — sustained by sheer consistency rather than by defence.",
    passive: "Every 3 correct answers heals 15 HP",
    maxHp: 180,
    baseDamage: 24,
    defense: 0.05,
    critBonus: 0.15,
    healAmount: 12,
    timeSeconds: 45,
    diffMin: 8,
    diffMax: 10,
    focusPool: 130,
    startFocus: 20,
    healsOnCorrectStreak: true,
  },
};

/**
 * Role-identity copy for each archetype's three core abilities. Unlike the
 * terse in-battle action tags, these full sentences teach playstyle on sight at
 * class-select — a player should understand how an archetype wants to be played
 * just by reading them (docs/battle-redesign.md §12). Kept truthful to the
 * current mechanics (e.g. Tank genuinely cannot heal).
 */
export const ARCHETYPE_ABILITY_COPY: Record<
  ArchetypeId,
  { attack: string; heal: string; charge: string }
> = {
  speedster: {
    attack: "Hit before they blink — the faster you answer, the deeper it cuts.",
    heal: "A quick breath. Small, but you'll be long gone before they swing back.",
    charge: "Spend your tempo to burst them down while you still hold the lead.",
  },
  tank: {
    attack: "A measured blow. Low damage, but you can throw them all day.",
    heal: "You can't heal — brace instead. Defending banks Focus for a heavier counter.",
    charge: "A slow wind-up for a rare, heavy landing. You have the HP to set it up.",
  },
  chud: {
    attack: "Everything, all at once — 34 damage, and the meanest crits in the game.",
    heal: "A desperate patch on a glass frame. Spend it wisely, or not at all.",
    charge: "All-in: the hardest question for the hardest hit. Live or die by it.",
  },
  gambler: {
    attack: "Swing with whatever the dice handed you this match.",
    heal: "However much the roll allows — chaos cuts both ways.",
    charge: "Bet it all on the hardest question. Fortune favors the bold.",
  },
  healer: {
    attack: "A soft jab. You win by outlasting, not by out-hitting.",
    heal: "Pour it back in — and take an 8 HP shield on top of the HP.",
    charge: "A rare burst that still leaves you standing when it lands.",
  },
  fulcrum: {
    attack: "Clean, consistent damage — plus whichever passive you borrowed this round.",
    heal: "Steady upkeep to keep the rhythm unbroken.",
    charge: "A solid finisher from a class that always has an answer ready.",
  },
  accelerator: {
    attack: "Starts small, ends decisive — every answer makes the next one hurt more.",
    heal: "Buy time. Your most dangerous turns are still ahead of you.",
    charge: "Late-game payoff — the longer the fight runs, the harder this lands.",
  },
  god: {
    attack: "Precision incarnate — but only the hardest questions answer to you.",
    heal: "Mend at will, and every third correct answer tops you up unasked.",
    charge: "The summit: the hardest question for a decisive, final blow.",
  },
};

/**
 * Weighted random stat roll for Gambler, spanning the ranges on the stat sheet.
 * A single `power` value (0-1) drives HP inversely and damage directly,
 * creating a natural tradeoff between a tanky low-damage roll and a fragile
 * high-damage roll. Other stats are independent.
 */
export function rollGamblerStats(): GamblerRoll {
  const power = Math.random();
  const diffMin = 2 + Math.floor(Math.random() * 5); // 2–6
  const diffMax = Math.min(10, diffMin + 1 + Math.floor(Math.random() * 4)); // diffMin+1 … 10
  return {
    maxHp: Math.round(90 + (1 - power) * 130), // 90–220 (inversely with power)
    baseDamage: Math.round(10 + power * 30), // 10–40 (with power)
    defense: parseFloat((Math.random() * 0.2).toFixed(2)), // 0–20%
    healAmount: Math.round(Math.random() * 30), // 0–30 (independent)
    timeSeconds: 20 + Math.floor(Math.random() * 61), // 20–80s
    critBonus: parseFloat((Math.random() * 0.4).toFixed(2)), // 0–40%
    diffMin,
    diffMax,
  };
}

export const PLAYER_AVATAR_ICON = User;
export const AI_AVATAR_ICON = Bot;
