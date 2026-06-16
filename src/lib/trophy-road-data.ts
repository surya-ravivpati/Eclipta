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
  /** Chest server key (claim_chest) — set when the display label differs. */
  rewardKey?: string;
  /** Specific Ecliptar slugs this node grants (monster = a/b, that tier's boss = c/d). */
  ecliptarSlugs?: string[];
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
  { id:  1, tier: "bronze",   type: "rank",    label: "Observatory I",        xp:      0, band: "training" },
  { id:  2, tier: "bronze",   type: "monster", label: "Speedster",       xp:    400, band: "training", archetype: "speedster", ecliptarSlugs: ["speedster-a", "speedster-b"] },
  { id:  3, tier: "bronze",   type: "chest",   rewardKey: "Bronze Chest", label: "Observatory Cache",    xp:    900, band: "training" },
  { id:  4, tier: "bronze",   type: "rank",    label: "Observatory II",       xp:   1800, band: "training" },
  { id:  5, tier: "bronze",   type: "chest",   rewardKey: "Bronze Cache", label: "Observatory Vault",    xp:   3000, band: "training" },
  { id:  6, tier: "bronze",   type: "boss",    label: "Observatory Guardian",     xp:   4500, band: "training", archetype: "speedster", ecliptarSlugs: ["speedster-c", "speedster-d"] },
  { id:  7, tier: "bronze",   type: "rank",    label: "Observatory III",      xp:   6000, band: "training" },

  // ── Silver ──────────────────────────────────────────────────────
  { id:  8, tier: "silver",   type: "rank",    label: "Tidelock I",        xp:   7500, band: "training" },
  { id:  9, tier: "silver",   type: "monster", label: "Tank",            xp:   9000, band: "training", archetype: "tank", ecliptarSlugs: ["tank-a", "tank-b"] },
  { id: 10, tier: "silver",   type: "chest",   rewardKey: "Silver Chest", label: "Tidelock Cache",    xp:  10500, band: "training" },
  { id: 11, tier: "silver",   type: "rank",    label: "Tidelock II",       xp:  12500, band: "training" },
  { id: 12, tier: "silver",   type: "chest",   rewardKey: "Silver Cache", label: "Tidelock Vault",    xp:  14500, band: "training" },
  { id: 13, tier: "silver",   type: "boss",    label: "Tidelock Guardian",     xp:  16500, band: "training", archetype: "tank", ecliptarSlugs: ["tank-c", "tank-d"] },
  { id: 14, tier: "silver",   type: "rank",    label: "Tidelock III",      xp:  18000, band: "training" },

  // ══════════════════════════════════════════════════════════════════
  // BAND 2 — BATTLE TRIALS  (20,000 – 70,000 XP)
  // Skill meets endurance. Two tiers, harder bosses, double chests.
  // ══════════════════════════════════════════════════════════════════

  // ── Gold ────────────────────────────────────────────────────────
  { id: 15, tier: "gold",     type: "rank",    label: "Ember I",          xp:  20000, band: "trials" },
  { id: 16, tier: "gold",     type: "monster", label: "Chud",            xp:  22000, band: "trials", archetype: "chud", ecliptarSlugs: ["chud-a", "chud-b"] },
  { id: 17, tier: "gold",     type: "chest",   rewardKey: "Gold Chest", label: "Ember Cache",      xp:  24000, band: "trials" },
  { id: 18, tier: "gold",     type: "rank",    label: "Ember II",         xp:  27000, band: "trials" },
  { id: 19, tier: "gold",     type: "chest",   rewardKey: "Gold Cache", label: "Ember Vault",      xp:  30000, band: "trials" },
  { id: 20, tier: "gold",     type: "boss",    label: "Ember Guardian",       xp:  34000, band: "trials", archetype: "chud", ecliptarSlugs: ["chud-c", "chud-d"] },
  { id: 21, tier: "gold",     type: "rank",    label: "Ember III",        xp:  38000, band: "trials" },

  // ── Diamond ─────────────────────────────────────────────────────
  { id: 22, tier: "diamond",  type: "rank",    label: "Resonance I",       xp:  43000, band: "trials" },
  { id: 23, tier: "diamond",  type: "monster", label: "Gambler",         xp:  46000, band: "trials", archetype: "gambler", ecliptarSlugs: ["gambler-a", "gambler-b"] },
  { id: 24, tier: "diamond",  type: "chest",   rewardKey: "Diamond Chest", label: "Resonance Cache",   xp:  49500, band: "trials" },
  { id: 25, tier: "diamond",  type: "rank",    label: "Resonance II",      xp:  54000, band: "trials" },
  { id: 26, tier: "diamond",  type: "chest",   rewardKey: "Diamond Cache", label: "Resonance Vault",   xp:  59000, band: "trials" },
  { id: 27, tier: "diamond",  type: "boss",    label: "Resonance Guardian",    xp:  65000, band: "trials", archetype: "gambler", ecliptarSlugs: ["gambler-c", "gambler-d"] },
  { id: 28, tier: "diamond",  type: "rank",    label: "Resonance III",     xp:  70000, band: "trials" },

  // ══════════════════════════════════════════════════════════════════
  // BAND 3 — COMPETITIVE ASCENSION  (78,000 – 240,000 XP)
  // Dedicated players separate from casuals. Long tiers, stiff bosses.
  // ══════════════════════════════════════════════════════════════════

  // ── Platinum ────────────────────────────────────────────────────
  { id: 29, tier: "platinum", type: "rank",    label: "Aurora I",      xp:  78000, band: "ascension" },
  { id: 30, tier: "platinum", type: "monster", label: "Healer",          xp:  84000, band: "ascension", archetype: "healer", ecliptarSlugs: ["healer-a", "healer-b"] },
  { id: 31, tier: "platinum", type: "chest",   rewardKey: "Platinum Chest", label: "Aurora Cache",  xp:  90000, band: "ascension" },
  { id: 32, tier: "platinum", type: "rank",    label: "Aurora II",     xp:  98000, band: "ascension" },
  { id: 33, tier: "platinum", type: "chest",   rewardKey: "Platinum Cache", label: "Aurora Vault",  xp: 107000, band: "ascension" },
  { id: 34, tier: "platinum", type: "boss",    label: "Aurora Guardian",   xp: 118000, band: "ascension", archetype: "healer", ecliptarSlugs: ["healer-c", "healer-d"] },
  { id: 35, tier: "platinum", type: "rank",    label: "Aurora III",    xp: 130000, band: "ascension" },

  // ── Champion ────────────────────────────────────────────────────
  { id: 36, tier: "champion", type: "rank",    label: "Drift I",      xp: 145000, band: "ascension" },
  { id: 37, tier: "champion", type: "monster", label: "Fulcrum",         xp: 157000, band: "ascension", archetype: "fulcrum", ecliptarSlugs: ["fulcrum-a", "fulcrum-b"] },
  { id: 38, tier: "champion", type: "chest",   rewardKey: "Champion Chest", label: "Drift Cache",  xp: 170000, band: "ascension" },
  { id: 39, tier: "champion", type: "rank",    label: "Drift II",     xp: 186000, band: "ascension" },
  { id: 40, tier: "champion", type: "chest",   rewardKey: "Champion Cache", label: "Drift Vault",  xp: 202000, band: "ascension" },
  { id: 41, tier: "champion", type: "boss",    label: "Drift Guardian",   xp: 220000, band: "ascension", archetype: "fulcrum", ecliptarSlugs: ["fulcrum-c", "fulcrum-d"] },
  { id: 42, tier: "champion", type: "rank",    label: "Drift III",    xp: 240000, band: "ascension" },

  // ══════════════════════════════════════════════════════════════════
  // BAND 4 — ELITE MASTERY  (265,000 – 420,000 XP)
  // The true gauntlet. Long-form dedication + consistent skill.
  // ══════════════════════════════════════════════════════════════════

  // ── Unreal ──────────────────────────────────────────────────────
  { id: 43, tier: "unreal",   type: "rank",    label: "Nexus I",        xp: 265000, band: "mastery" },
  { id: 44, tier: "unreal",   type: "monster", label: "Accelerator",     xp: 285000, band: "mastery", archetype: "accelerator", ecliptarSlugs: ["accelerator-a", "accelerator-b"] },
  { id: 45, tier: "unreal",   type: "chest",   rewardKey: "Unreal Chest", label: "Nexus Cache",    xp: 308000, band: "mastery" },
  { id: 46, tier: "unreal",   type: "rank",    label: "Nexus II",       xp: 335000, band: "mastery" },
  { id: 47, tier: "unreal",   type: "chest",   rewardKey: "Unreal Cache", label: "Nexus Vault",    xp: 365000, band: "mastery" },
  { id: 48, tier: "unreal",   type: "boss",    label: "Nexus Guardian",     xp: 392000, band: "mastery", archetype: "accelerator", ecliptarSlugs: ["accelerator-c", "accelerator-d"] },
  { id: 49, tier: "unreal",   type: "rank",    label: "Nexus III",      xp: 420000, band: "mastery" },

  // ══════════════════════════════════════════════════════════════════
  // BAND 5 — THE SUMMIT  (460,000 – 800,000 XP)
  // God Tier — the final rank. Visible to all, earned by few.
  // Two legendary bosses guard the ultimate milestones.
  // ══════════════════════════════════════════════════════════════════

  // ── God ─────────────────────────────────────────────────────────
  { id: 50, tier: "god",      type: "rank",    label: "Eclipse I",      xp: 460000, band: "summit" },
  { id: 51, tier: "god",      type: "monster", label: "Eclipse Archetype",   xp: 495000, band: "summit", archetype: "god", ecliptarSlugs: ["einsteinium", "temporobys"] },
  { id: 52, tier: "god",      type: "final",   label: "Newton",          xp: 535000, band: "summit", finalMonster: "newton" },
  { id: 53, tier: "god",      type: "chest",   rewardKey: "God Cache", label: "Eclipse Cache",       xp: 580000, band: "summit" },
  { id: 54, tier: "god",      type: "rank",    label: "Eclipse II",     xp: 628000, band: "summit" },
  { id: 55, tier: "god",      type: "final",   label: "ECLIPTADON",      xp: 678000, band: "summit", finalMonster: "ecliptadon" },
  { id: 56, tier: "god",      type: "chest",   rewardKey: "God Vault", label: "Eclipse Vault",       xp: 728000, band: "summit" },
  { id: 57, tier: "god",      type: "boss",    label: "Eclipse Guardian",        xp: 764000, band: "summit" },
  { id: 58, tier: "god",      type: "rank",    label: "Eclipse III",    xp: 800000, band: "summit" },
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
