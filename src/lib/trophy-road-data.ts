/** Shared progression data used by both TrophyRoad UI and Battle system */

export type TierId = "bronze" | "silver" | "gold" | "diamond" | "platinum" | "champion" | "unreal" | "god";
export type MonsterArchetypeKey = "speedster" | "tank" | "chud" | "gambler" | "healer" | "fulcrum" | "accelerator" | "god";

export interface RoadNode {
  id: number;
  tier: TierId;
  type: "rank" | "monster" | "chest" | "boss" | "final";
  label: string;
  xp: number;
  archetype?: MonsterArchetypeKey;
  finalMonster?: "newton" | "ecliptadon";
  /** Thematic band — used for visual section headers in the UI */
  band?: "training" | "trials" | "ascension" | "mastery" | "summit";
}

// Current player XP (will come from DB later)
export const PLAYER_XP = 4200;

export const ROAD_NODES: RoadNode[] = [
  // ══════════════════════════════════════════════════════════════════
  // BAND 1 — TRAINING GROUNDS  (0 – 18,000 XP)
  // Learn the ropes. Two full tiers with rank milestones, archetype
  // unlocks, reward chests, and a boss encounter per tier.
  // ══════════════════════════════════════════════════════════════════

  // ── Bronze ──────────────────────────────────────────────────────
  { id:  1, tier: "bronze",   type: "rank",    label: "Bronze I",        xp:      0, band: "training" },
  { id:  2, tier: "bronze",   type: "monster", label: "Speedster",       xp:    400, band: "training", archetype: "speedster" },
  { id:  3, tier: "bronze",   type: "chest",   label: "Bronze Chest",    xp:    900, band: "training" },
  { id:  4, tier: "bronze",   type: "rank",    label: "Bronze II",       xp:   1800, band: "training" },
  { id:  5, tier: "bronze",   type: "chest",   label: "Bronze Cache",    xp:   3000, band: "training" },
  { id:  6, tier: "bronze",   type: "boss",    label: "Bronze Boss",     xp:   4500, band: "training" },
  { id:  7, tier: "bronze",   type: "rank",    label: "Bronze III",      xp:   6000, band: "training" },

  // ── Silver ──────────────────────────────────────────────────────
  { id:  8, tier: "silver",   type: "rank",    label: "Silver I",        xp:   7500, band: "training" },
  { id:  9, tier: "silver",   type: "monster", label: "Tank",            xp:   9000, band: "training", archetype: "tank" },
  { id: 10, tier: "silver",   type: "chest",   label: "Silver Chest",    xp:  10500, band: "training" },
  { id: 11, tier: "silver",   type: "rank",    label: "Silver II",       xp:  12500, band: "training" },
  { id: 12, tier: "silver",   type: "chest",   label: "Silver Cache",    xp:  14500, band: "training" },
  { id: 13, tier: "silver",   type: "boss",    label: "Silver Boss",     xp:  16500, band: "training" },
  { id: 14, tier: "silver",   type: "rank",    label: "Silver III",      xp:  18000, band: "training" },

  // ══════════════════════════════════════════════════════════════════
  // BAND 2 — BATTLE TRIALS  (20,000 – 70,000 XP)
  // Skill meets endurance. Two tiers, harder bosses, double chests.
  // ══════════════════════════════════════════════════════════════════

  // ── Gold ────────────────────────────────────────────────────────
  { id: 15, tier: "gold",     type: "rank",    label: "Gold I",          xp:  20000, band: "trials" },
  { id: 16, tier: "gold",     type: "monster", label: "Chud",            xp:  22000, band: "trials", archetype: "chud" },
  { id: 17, tier: "gold",     type: "chest",   label: "Gold Chest",      xp:  24000, band: "trials" },
  { id: 18, tier: "gold",     type: "rank",    label: "Gold II",         xp:  27000, band: "trials" },
  { id: 19, tier: "gold",     type: "chest",   label: "Gold Cache",      xp:  30000, band: "trials" },
  { id: 20, tier: "gold",     type: "boss",    label: "Gold Boss",       xp:  34000, band: "trials" },
  { id: 21, tier: "gold",     type: "rank",    label: "Gold III",        xp:  38000, band: "trials" },

  // ── Diamond ─────────────────────────────────────────────────────
  { id: 22, tier: "diamond",  type: "rank",    label: "Diamond I",       xp:  43000, band: "trials" },
  { id: 23, tier: "diamond",  type: "monster", label: "Gambler",         xp:  46000, band: "trials", archetype: "gambler" },
  { id: 24, tier: "diamond",  type: "chest",   label: "Diamond Chest",   xp:  49500, band: "trials" },
  { id: 25, tier: "diamond",  type: "rank",    label: "Diamond II",      xp:  54000, band: "trials" },
  { id: 26, tier: "diamond",  type: "chest",   label: "Diamond Cache",   xp:  59000, band: "trials" },
  { id: 27, tier: "diamond",  type: "boss",    label: "Diamond Boss",    xp:  65000, band: "trials" },
  { id: 28, tier: "diamond",  type: "rank",    label: "Diamond III",     xp:  70000, band: "trials" },

  // ══════════════════════════════════════════════════════════════════
  // BAND 3 — COMPETITIVE ASCENSION  (78,000 – 240,000 XP)
  // Dedicated players separate from casuals. Long tiers, stiff bosses.
  // ══════════════════════════════════════════════════════════════════

  // ── Platinum ────────────────────────────────────────────────────
  { id: 29, tier: "platinum", type: "rank",    label: "Platinum I",      xp:  78000, band: "ascension" },
  { id: 30, tier: "platinum", type: "monster", label: "Healer",          xp:  84000, band: "ascension", archetype: "healer" },
  { id: 31, tier: "platinum", type: "chest",   label: "Platinum Chest",  xp:  90000, band: "ascension" },
  { id: 32, tier: "platinum", type: "rank",    label: "Platinum II",     xp:  98000, band: "ascension" },
  { id: 33, tier: "platinum", type: "chest",   label: "Platinum Cache",  xp: 107000, band: "ascension" },
  { id: 34, tier: "platinum", type: "boss",    label: "Platinum Boss",   xp: 118000, band: "ascension" },
  { id: 35, tier: "platinum", type: "rank",    label: "Platinum III",    xp: 130000, band: "ascension" },

  // ── Champion ────────────────────────────────────────────────────
  { id: 36, tier: "champion", type: "rank",    label: "Champion I",      xp: 145000, band: "ascension" },
  { id: 37, tier: "champion", type: "monster", label: "Fulcrum",         xp: 157000, band: "ascension", archetype: "fulcrum" },
  { id: 38, tier: "champion", type: "chest",   label: "Champion Chest",  xp: 170000, band: "ascension" },
  { id: 39, tier: "champion", type: "rank",    label: "Champion II",     xp: 186000, band: "ascension" },
  { id: 40, tier: "champion", type: "chest",   label: "Champion Cache",  xp: 202000, band: "ascension" },
  { id: 41, tier: "champion", type: "boss",    label: "Champion Boss",   xp: 220000, band: "ascension" },
  { id: 42, tier: "champion", type: "rank",    label: "Champion III",    xp: 240000, band: "ascension" },

  // ══════════════════════════════════════════════════════════════════
  // BAND 4 — ELITE MASTERY  (265,000 – 420,000 XP)
  // The true gauntlet. Long-form dedication + consistent skill.
  // ══════════════════════════════════════════════════════════════════

  // ── Unreal ──────────────────────────────────────────────────────
  { id: 43, tier: "unreal",   type: "rank",    label: "Unreal I",        xp: 265000, band: "mastery" },
  { id: 44, tier: "unreal",   type: "monster", label: "Accelerator",     xp: 285000, band: "mastery", archetype: "accelerator" },
  { id: 45, tier: "unreal",   type: "chest",   label: "Unreal Chest",    xp: 308000, band: "mastery" },
  { id: 46, tier: "unreal",   type: "rank",    label: "Unreal II",       xp: 335000, band: "mastery" },
  { id: 47, tier: "unreal",   type: "chest",   label: "Unreal Cache",    xp: 365000, band: "mastery" },
  { id: 48, tier: "unreal",   type: "boss",    label: "Unreal Boss",     xp: 392000, band: "mastery" },
  { id: 49, tier: "unreal",   type: "rank",    label: "Unreal III",      xp: 420000, band: "mastery" },

  // ══════════════════════════════════════════════════════════════════
  // BAND 5 — THE SUMMIT  (460,000 – 800,000 XP)
  // God Tier — the final rank. Visible to all, earned by few.
  // Two legendary bosses guard the ultimate milestones.
  // ══════════════════════════════════════════════════════════════════

  // ── God ─────────────────────────────────────────────────────────
  { id: 50, tier: "god",      type: "rank",    label: "God Tier I",      xp: 460000, band: "summit" },
  { id: 51, tier: "god",      type: "monster", label: "God Archetype",   xp: 495000, band: "summit", archetype: "god" },
  { id: 52, tier: "god",      type: "final",   label: "Newton",          xp: 535000, band: "summit", finalMonster: "newton" },
  { id: 53, tier: "god",      type: "chest",   label: "God Cache",       xp: 580000, band: "summit" },
  { id: 54, tier: "god",      type: "rank",    label: "God Tier II",     xp: 628000, band: "summit" },
  { id: 55, tier: "god",      type: "final",   label: "ECLIPTADON",      xp: 678000, band: "summit", finalMonster: "ecliptadon" },
  { id: 56, tier: "god",      type: "chest",   label: "God Vault",       xp: 728000, band: "summit" },
  { id: 57, tier: "god",      type: "boss",    label: "God Boss",        xp: 764000, band: "summit" },
  { id: 58, tier: "god",      type: "rank",    label: "God Tier III",    xp: 800000, band: "summit" },
];

/** Returns the set of archetype keys the player has unlocked based on XP */
export function getUnlockedArchetypes(playerXp: number = PLAYER_XP): MonsterArchetypeKey[] {
  return ROAD_NODES
    .filter(n => n.type === "monster" && n.archetype && n.xp <= playerXp)
    .map(n => n.archetype!);
}

/** Check if a specific node is unlocked */
export function isNodeUnlocked(node: RoadNode, playerXp: number = PLAYER_XP): boolean {
  return node.xp <= playerXp;
}

/** Check if a node is the current one (highest unlocked) */
export function isCurrentNode(node: RoadNode, playerXp: number = PLAYER_XP): boolean {
  const idx = ROAD_NODES.indexOf(node);
  const nextNode = ROAD_NODES[idx + 1];
  return node.xp <= playerXp && (!nextNode || nextNode.xp > playerXp);
}
