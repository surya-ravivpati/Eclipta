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
}

// Current player XP (will come from DB later)
export const PLAYER_XP = 4200;

export const ROAD_NODES: RoadNode[] = [
  { id: 1,  tier: "bronze",   type: "rank",    label: "Bronze I",        xp: 0 },
  { id: 2,  tier: "bronze",   type: "monster", label: "Speedster",       xp: 200,   archetype: "speedster" },
  { id: 3,  tier: "bronze",   type: "chest",   label: "Bronze Chest",    xp: 500 },
  { id: 4,  tier: "silver",   type: "rank",    label: "Silver I",        xp: 1000 },
  { id: 5,  tier: "silver",   type: "monster", label: "Tank",            xp: 1500,  archetype: "tank" },
  { id: 6,  tier: "silver",   type: "chest",   label: "Silver Chest",    xp: 2000 },
  { id: 7,  tier: "gold",     type: "rank",    label: "Gold I",          xp: 3000 },
  { id: 8,  tier: "gold",     type: "monster", label: "Chud",            xp: 3500,  archetype: "chud" },
  { id: 9,  tier: "gold",     type: "chest",   label: "Gold Chest",      xp: 4000 },
  { id: 10, tier: "diamond",  type: "rank",    label: "Diamond I",       xp: 6000 },
  { id: 11, tier: "diamond",  type: "monster", label: "Gambler",         xp: 7000,  archetype: "gambler" },
  { id: 12, tier: "diamond",  type: "chest",   label: "Diamond Chest",   xp: 8500 },
  { id: 13, tier: "platinum", type: "rank",    label: "Platinum I",      xp: 10000 },
  { id: 14, tier: "platinum", type: "monster", label: "Healer",          xp: 12000, archetype: "healer" },
  { id: 15, tier: "platinum", type: "chest",   label: "Platinum Chest",  xp: 14000 },
  { id: 16, tier: "champion", type: "rank",    label: "Champion",        xp: 16000 },
  { id: 17, tier: "champion", type: "monster", label: "Fulcrum",         xp: 19000, archetype: "fulcrum" },
  { id: 18, tier: "champion", type: "chest",   label: "Champion Chest",  xp: 22000 },
  { id: 19, tier: "unreal",   type: "rank",    label: "Unreal",          xp: 25000 },
  { id: 20, tier: "unreal",   type: "monster", label: "Accelerator",     xp: 30000, archetype: "accelerator" },
  { id: 21, tier: "unreal",   type: "chest",   label: "Unreal Chest",    xp: 35000 },
  { id: 22, tier: "god",      type: "rank",    label: "God Tier",        xp: 40000 },
  { id: 23, tier: "god",      type: "monster", label: "God Archetype",   xp: 45000, archetype: "god" },
  { id: 24, tier: "god",      type: "final",   label: "Newton",          xp: 48000, finalMonster: "newton" },
  { id: 25, tier: "god",      type: "final",   label: "ECLIPTADON",      xp: 50000, finalMonster: "ecliptadon" },
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
