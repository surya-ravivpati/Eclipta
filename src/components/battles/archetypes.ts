import type { Archetype, ArchetypeId } from "./types";

export const ARCHETYPES: Record<ArchetypeId, Archetype> = {
  analyst: {
    id: "analyst",
    name: "The Analyst",
    emoji: "🧠",
    color: "text-neon-cyan",
    borderColor: "border-neon-cyan/40",
    description: "Hard questions deal +50% damage, but timers are 25% faster.",
    passive: "Hard DMG +50% · Timer −25%",
    stats: { attack: 3, defense: 2, speed: 1, combo: 2 },
  },
  sprinter: {
    id: "sprinter",
    name: "The Sprinter",
    emoji: "⚡",
    color: "text-neon-pink",
    borderColor: "border-neon-pink/40",
    description: "Bonus damage scales with time remaining. Answer fast for huge hits.",
    passive: "Speed DMG bonus · Fast = lethal",
    stats: { attack: 2, defense: 1, speed: 4, combo: 1 },
  },
  defender: {
    id: "defender",
    name: "The Defender",
    emoji: "🛡️",
    color: "text-neon-purple",
    borderColor: "border-neon-purple/40",
    description: "Wrong answers deal only 50% self-damage. Lower base attack.",
    passive: "Self-DMG −50% · Base ATK −30%",
    stats: { attack: 1, defense: 4, speed: 2, combo: 2 },
  },
  consistent: {
    id: "consistent",
    name: "The Consistent",
    emoji: "🔥",
    color: "text-yellow-400",
    borderColor: "border-yellow-400/40",
    description: "Combo multiplier triggers every 2 hits instead of 3.",
    passive: "Combo every 2 hits · Steady power",
    stats: { attack: 2, defense: 2, speed: 2, combo: 4 },
  },
};
