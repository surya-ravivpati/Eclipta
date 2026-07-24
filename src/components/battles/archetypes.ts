import { Zap, Shield, Skull, Dice5, Heart, Scale, FastForward, Crown, User, Bot } from "lucide-react";
import type { Archetype, ArchetypeId, GamblerRoll } from "./types";

export const ARCHETYPES: Record<ArchetypeId, Archetype> = {
  speedster: {
    id: "speedster",
    name: "The Speedster",
    icon: Zap,
    color: "text-cyan-400",
    borderColor: "border-cyan-400/40",
    description: "Fast, pressured gameplay. Less time per question — but faster answers deal more damage.",
    passive: "Speed bonus · Low time · High mult",
    maxHp: 125,
    baseDamage: 15,
    multiplierStep: 0.35,
    healAmount: 12,
    timeMultiplier: 0.75,
    diffMin: 3,
    diffMax: 7,
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
    description: "Heavy, durable, easy questions. Tons of HP but low damage output. Cannot heal.",
    passive: "Max HP · Cannot heal · Low DMG",
    maxHp: 250,
    baseDamage: 10,
    multiplierStep: 0.10,
    healAmount: null,
    timeMultiplier: 1.25,
    diffMin: 3,
    diffMax: 7,
    focusPool: 120,
    startFocus: 20,
  },
  chud: {
    id: "chud",
    name: "The Apex",
    icon: Skull,
    color: "text-tier-champion",
    borderColor: "border-tier-champion/40",
    description: "Glass cannon. Ultra-high damage with hard questions and almost no HP.",
    passive: "Ultra DMG · Hard Qs · Glass cannon",
    maxHp: 75,
    baseDamage: 30,
    multiplierStep: 0.30,
    healAmount: 22,
    timeMultiplier: 0.75,
    diffMin: 6,
    diffMax: 9,
    focusPool: 140,
    startFocus: 40,
  },
  gambler: {
    id: "gambler",
    name: "The Gambler",
    icon: Dice5,
    color: "text-tier-gold",
    borderColor: "border-tier-gold/40",
    description: "All stats randomized each battle. Could be godlike — could be garbage. Pure chaos.",
    passive: "Random stats · Chaos mode",
    maxHp: 130,
    baseDamage: 18,
    multiplierStep: 0.175,
    healAmount: 15,
    timeMultiplier: 1.0,
    diffMin: 2,
    diffMax: 9,
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
    description: "Sustain-focused with strong HP restore, easy questions, and passive HP regen on incoming hits.",
    passive: "High heal · HP regen on hit · Sustain",
    maxHp: 135,
    baseDamage: 10,
    multiplierStep: 0.20,
    // 25 → 20: bounds the sustain so Healer can't stall a match indefinitely
    // (balance audit W; see docs/battle-redesign.md §7).
    healAmount: 20,
    timeMultiplier: 1.25,
    diffMin: 2,
    diffMax: 6,
    focusPool: 110,
    startFocus: 20,
  },
  fulcrum: {
    id: "fulcrum",
    name: "The Fulcrum",
    icon: Scale,
    color: "text-violet-400",
    borderColor: "border-violet-400/40",
    description: "Balanced all-rounder with the highest multiplier. Rewards consistency above all else.",
    passive: "High multiplier · Balanced · Combo every 2",
    maxHp: 150,
    baseDamage: 18,
    multiplierStep: 0.20,
    healAmount: 15,
    timeMultiplier: 1.0,
    diffMin: 4,
    diffMax: 6,
    focusPool: 100,
    startFocus: 20,
  },
  accelerator: {
    id: "accelerator",
    name: "The Accelerator",
    icon: FastForward,
    color: "text-tier-platinum",
    borderColor: "border-tier-platinum/40",
    description: "Scaling power over time. Damage (13→27) and multiplier (+15→40%) grow with every question answered.",
    passive: "DMG scales · MULT scales · Hard Qs",
    maxHp: 160,
    baseDamage: 13,
    multiplierStep: 0.15,
    healAmount: 18,
    timeMultiplier: 1.0,
    diffMin: 3,
    diffMax: 7,
    focusPool: 90,
    startFocus: 20,
    multiplierScales: true,
  },
  god: {
    id: "god",
    name: "The God",
    icon: Crown,
    color: "text-tier-god",
    borderColor: "border-tier-god/40",
    description: "Endgame archetype. Towering stats and the hardest questions — but no way to heal. Pure, high-risk offense.",
    passive: "Max stats · Hard Qs · Cannot heal",
    maxHp: 200,
    baseDamage: 25,
    multiplierStep: 0.20,
    // Heal removed (15 → null): God's only real drawback used to be question
    // difficulty, which skilled players simply out-answer — leaving it strictly
    // best at the top. Removing sustain restores a genuine trade-off without raw
    // power creep (balance audit W4; docs/battle-redesign.md §7).
    healAmount: null,
    timeMultiplier: 1.5,
    diffMin: 8,
    diffMax: 10,
    focusPool: 130,
    startFocus: 20,
  },
};

/**
 * Role-identity copy for each archetype's three core abilities. Unlike the
 * terse in-battle action tags, these full sentences teach playstyle on sight at
 * class-select — a player should understand how an archetype wants to be played
 * just by reading them (docs/battle-redesign.md §12). Kept truthful to the
 * current mechanics (e.g. Tank and God genuinely cannot heal).
 */
export const ARCHETYPE_ABILITY_COPY: Record<ArchetypeId, { attack: string; heal: string; charge: string }> = {
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
    attack: "Everything, all at once — 30 damage. But you have no margin for error.",
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
    heal: "Pour it back in — and every hit they land still feeds your regen.",
    charge: "A rare burst that still tops you up while it stings them.",
  },
  fulcrum: {
    attack: "Clean, consistent damage — your combo climbs every two hits.",
    heal: "Steady upkeep to keep the rhythm unbroken.",
    charge: "Your highest multiplier turns a long combo into a finisher.",
  },
  accelerator: {
    attack: "Starts small, ends decisive — every answer makes the next one hurt more.",
    heal: "Buy time. Your most dangerous turns are still ahead of you.",
    charge: "Late-game payoff — the longer the fight runs, the harder this lands.",
  },
  god: {
    attack: "Precision incarnate — but only the hardest questions answer to you.",
    heal: "No mending here. The God trades safety for raw, unanswerable force.",
    charge: "The summit: the hardest question for a decisive, final blow.",
  },
};

/**
 * Weighted random stat roll for Gambler.
 * A single `power` value (0-1) drives HP inversely and damage directly,
 * creating a natural tradeoff between a tanky low-damage roll and a fragile
 * high-damage roll. Other stats are independent.
 */
export function rollGamblerStats(): GamblerRoll {
  const power = Math.random();
  const diffMin = 2 + Math.floor(Math.random() * 5);             // 2–6
  const diffMax = Math.min(9, diffMin + 1 + Math.floor(Math.random() * 4)); // diffMin+1 to diffMin+4
  return {
    maxHp: Math.round(80 + (1 - power) * 100),                   // 80–180 (inversely with power)
    baseDamage: Math.round(8 + power * 20),                       // 8–28 (with power)
    multiplierStep: parseFloat((0.05 + power * 0.25).toFixed(2)), // 0.05–0.30
    healAmount: Math.round(5 + Math.random() * 20),               // 5–25 (independent)
    timeMultiplier: [0.75, 1.0, 1.25][Math.floor(Math.random() * 3)],
    diffMin,
    diffMax,
  };
}

export const PLAYER_AVATAR_ICON = User;
export const AI_AVATAR_ICON = Bot;
