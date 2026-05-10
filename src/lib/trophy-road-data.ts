/** Shared progression data used by both TrophyRoad UI and Battle system */

export type TierId = "bronze" | "silver" | "gold" | "diamond" | "platinum" | "champion" | "unreal" | "god" | "apex";
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
  band?: "training" | "trials" | "ascension" | "mastery" | "apex";
}

// Current player XP (will come from DB later)
export const PLAYER_XP = 4200;

export const ROAD_NODES: RoadNode[] = [
  // ══════════════════════════════════════════════════════════════════
  // BAND 1 — TRAINING GROUNDS  (0 – 22,000 XP)
  // Fast early wins, archetype unlocks, learn the ropes.
  // Reward cadence: every 500–1,500 XP.
  // ══════════════════════════════════════════════════════════════════
  { id:  1, tier: "bronze",   type: "rank",    label: "Bronze I",        xp:      0, band: "training" },
  { id:  2, tier: "bronze",   type: "monster", label: "Speedster",       xp:    200, band: "training", archetype: "speedster" },
  { id:  3, tier: "bronze",   type: "chest",   label: "Bronze Chest",    xp:    500, band: "training" },
  { id:  4, tier: "silver",   type: "rank",    label: "Silver I",        xp:   1000, band: "training" },
  { id:  5, tier: "silver",   type: "monster", label: "Tank",            xp:   1500, band: "training", archetype: "tank" },
  { id:  6, tier: "silver",   type: "chest",   label: "Silver Chest",    xp:   2000, band: "training" },
  { id:  7, tier: "gold",     type: "rank",    label: "Gold I",          xp:   3000, band: "training" },
  { id:  8, tier: "gold",     type: "monster", label: "Chud",            xp:   3500, band: "training", archetype: "chud" },
  { id:  9, tier: "gold",     type: "chest",   label: "Gold Chest",      xp:   4000, band: "training" },
  { id: 10, tier: "diamond",  type: "rank",    label: "Diamond I",       xp:   6000, band: "training" },
  { id: 11, tier: "diamond",  type: "monster", label: "Gambler",         xp:   7000, band: "training", archetype: "gambler" },
  { id: 12, tier: "diamond",  type: "chest",   label: "Diamond Chest",   xp:   8500, band: "training" },
  { id: 13, tier: "platinum", type: "rank",    label: "Platinum I",      xp:  10000, band: "training" },
  { id: 14, tier: "platinum", type: "monster", label: "Healer",          xp:  12000, band: "training", archetype: "healer" },
  { id: 15, tier: "platinum", type: "chest",   label: "Platinum Chest",  xp:  14000, band: "training" },
  { id: 16, tier: "champion", type: "rank",    label: "Champion I",      xp:  16000, band: "training" },
  { id: 17, tier: "champion", type: "monster", label: "Fulcrum",         xp:  19000, band: "training", archetype: "fulcrum" },
  { id: 18, tier: "champion", type: "chest",   label: "Champion Chest",  xp:  22000, band: "training" },

  // ══════════════════════════════════════════════════════════════════
  // BAND 2 — BATTLE TRIALS  (25,000 – 65,000 XP)
  // Skill meets endurance. Reward cadence: every 2,000–5,000 XP.
  // ══════════════════════════════════════════════════════════════════
  { id: 19, tier: "unreal",   type: "rank",    label: "Unreal I",        xp:  25000, band: "trials" },
  { id: 20, tier: "unreal",   type: "monster", label: "Accelerator",     xp:  30000, band: "trials", archetype: "accelerator" },
  { id: 21, tier: "unreal",   type: "chest",   label: "Unreal Chest",    xp:  35000, band: "trials" },
  { id: 22, tier: "god",      type: "rank",    label: "God Tier I",      xp:  40000, band: "trials" },
  { id: 23, tier: "god",      type: "monster", label: "God Archetype",   xp:  45000, band: "trials", archetype: "god" },
  { id: 24, tier: "god",      type: "final",   label: "Newton",          xp:  48000, band: "trials", finalMonster: "newton" },
  { id: 25, tier: "god",      type: "final",   label: "ECLIPTADON",      xp:  50000, band: "trials", finalMonster: "ecliptadon" },

  // ══════════════════════════════════════════════════════════════════
  // BAND 3 — COMPETITIVE ASCENSION  (55,000 – 285,000 XP)
  // Dedicated players separate from casuals. Reward cadence: ~10–35k XP.
  // ══════════════════════════════════════════════════════════════════
  { id: 26, tier: "god",      type: "rank",    label: "God Tier II",     xp:  55000, band: "ascension" },
  { id: 27, tier: "god",      type: "chest",   label: "God Cache",       xp:  65000, band: "ascension" },
  { id: 28, tier: "god",      type: "rank",    label: "God Tier III",    xp:  78000, band: "ascension" },
  { id: 29, tier: "god",      type: "chest",   label: "God Vault",       xp:  94000, band: "ascension" },
  { id: 30, tier: "god",      type: "rank",    label: "God Tier IV",     xp: 115000, band: "ascension" },
  { id: 31, tier: "champion", type: "rank",    label: "Champion II",     xp: 140000, band: "ascension" },
  { id: 32, tier: "champion", type: "chest",   label: "Champion Cache",  xp: 168000, band: "ascension" },
  { id: 33, tier: "champion", type: "rank",    label: "Champion III",    xp: 200000, band: "ascension" },
  { id: 34, tier: "champion", type: "chest",   label: "Champion Vault",  xp: 238000, band: "ascension" },
  { id: 35, tier: "champion", type: "rank",    label: "Champion IV",     xp: 285000, band: "ascension" },

  // ══════════════════════════════════════════════════════════════════
  // BAND 4 — ELITE MASTERY PATH  (340,000 – 640,000 XP)
  // The true gauntlet. Long-form dedication + skill required.
  // Reward cadence: ~50–100k XP.
  // ══════════════════════════════════════════════════════════════════
  { id: 36, tier: "unreal",   type: "rank",    label: "Unreal II",       xp: 340000, band: "mastery" },
  { id: 37, tier: "unreal",   type: "chest",   label: "Unreal Cache",    xp: 400000, band: "mastery" },
  { id: 38, tier: "unreal",   type: "rank",    label: "Unreal III",      xp: 470000, band: "mastery" },
  { id: 39, tier: "unreal",   type: "chest",   label: "Unreal Vault",    xp: 550000, band: "mastery" },
  { id: 40, tier: "unreal",   type: "rank",    label: "Unreal IV",       xp: 640000, band: "mastery" },

  // ══════════════════════════════════════════════════════════════════
  // BAND 5 — APEX PRESTIGE  (750,000 – 1,350,000 XP)
  // Endgame mastery. Visible to all, reachable by few.
  // Reward cadence: ~125–200k XP.
  // ══════════════════════════════════════════════════════════════════
  { id: 41, tier: "apex",     type: "rank",    label: "Apex Initiate",   xp:  750000, band: "apex" },
  { id: 42, tier: "apex",     type: "chest",   label: "Apex Cache",      xp:  875000, band: "apex" },
  { id: 43, tier: "apex",     type: "rank",    label: "Apex Warrior",    xp: 1000000, band: "apex" },
  { id: 44, tier: "apex",     type: "chest",   label: "Apex Vault",      xp: 1150000, band: "apex" },
  { id: 45, tier: "apex",     type: "rank",    label: "Apex Legend",     xp: 1350000, band: "apex" },
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
