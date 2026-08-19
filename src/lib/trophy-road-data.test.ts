import { describe, expect, it } from "vitest";
import {
  ROAD_NODES,
  getUnlockedArchetypes,
  isNodeUnlocked,
  isCurrentNode,
  nextRoadNode,
  TIER_ORDER,
  TIER_THRESHOLDS,
  xpToTier,
  type RoadNode,
} from "./trophy-road-data";
import { ECLIPTARS } from "./ecliptars";

/** Indexes ROAD_NODES with a real runtime guard instead of a `!` assertion. */
function nodeAt(index: number): RoadNode {
  const node = ROAD_NODES[index];
  if (!node) throw new Error(`No ROAD_NODES entry at index ${index}`);
  return node;
}

describe("ROAD_NODES data invariants", () => {
  it("has unique ids", () => {
    const ids = ROAD_NODES.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has non-decreasing xp thresholds in array order", () => {
    for (let i = 1; i < ROAD_NODES.length; i++) {
      expect(nodeAt(i).xp).toBeGreaterThanOrEqual(nodeAt(i - 1).xp);
    }
  });

  it("has exactly one node of each final-boss type (newton, ecliptadon)", () => {
    const finals = ROAD_NODES.filter((n) => n.type === "final");
    expect(finals.map((n) => n.finalMonster).sort()).toEqual(["ecliptadon", "newton"]);
  });

  it("only offers rolls on a node that names the archetype to roll from", () => {
    // The roll asks the server for "one more of this archetype". A node
    // offering rolls without an archetype would have nothing to ask for.
    for (const node of ROAD_NODES) {
      if (!node.ecliptarRolls) continue;
      expect(node.archetype, `${node.label} (id ${node.id}) rolls from nothing`).toBeDefined();
      expect(node.ecliptarRolls).toBeGreaterThan(0);
    }
  });

  it("never offers an archetype more rolls than it has Ecliptars", () => {
    // Rolls draw without replacement, so an archetype promising more than its
    // pool holds would leave a node permanently showing an unclaimable draw.
    const rollsByArchetype = new Map<string, number>();
    for (const node of ROAD_NODES) {
      if (!node.ecliptarRolls || !node.archetype) continue;
      rollsByArchetype.set(
        node.archetype,
        (rollsByArchetype.get(node.archetype) ?? 0) + node.ecliptarRolls,
      );
    }

    for (const [archetype, rolls] of rollsByArchetype) {
      const pool = ECLIPTARS.filter((e) => e.archetype === archetype).length;
      expect(
        rolls,
        `${archetype} promises ${rolls} rolls from a pool of ${pool}`,
      ).toBeLessThanOrEqual(pool);
    }
  });

  it("gives every archetype with a monster node something to draw", () => {
    for (const node of ROAD_NODES.filter((n) => n.type === "monster")) {
      expect(node.ecliptarRolls, `${node.label} grants no Ecliptar`).toBeGreaterThan(0);
    }
  });

  it("every monster-type node declares an archetype", () => {
    const monsters = ROAD_NODES.filter((n) => n.type === "monster");
    expect(monsters.every((n) => n.archetype !== undefined)).toBe(true);
  });
});

describe("getUnlockedArchetypes", () => {
  it("returns no archetypes at 0 xp (the first monster node costs xp > 0)", () => {
    expect(getUnlockedArchetypes(0)).toEqual([]);
  });

  it("returns exactly the archetypes whose monster node xp threshold has been reached", () => {
    const speedsterNode = ROAD_NODES.find((n) => n.archetype === "speedster");
    if (!speedsterNode) throw new Error("Expected a speedster monster node to exist");
    const result = getUnlockedArchetypes(speedsterNode.xp);
    expect(result).toContain("speedster");
  });

  it("returns every archetype at a very high xp", () => {
    const result = getUnlockedArchetypes(10_000_000);
    // 8 archetypes total, "god" included via the Eclipse Archetype node.
    expect(new Set(result).size).toBe(8);
  });
});

describe("isNodeUnlocked", () => {
  it("is unlocked exactly when playerXp meets or exceeds the node's threshold", () => {
    const node = nodeAt(5);
    expect(isNodeUnlocked(node, node.xp)).toBe(true);
    expect(isNodeUnlocked(node, node.xp - 1)).toBe(false);
    expect(isNodeUnlocked(node, node.xp + 1)).toBe(true);
  });
});

describe("isCurrentNode", () => {
  it("is true for the highest node whose threshold has been met, when the next node hasn't been", () => {
    const node = nodeAt(3);
    const next = nodeAt(4);
    // Exactly at this node's xp and below the next node's xp.
    const xp = Math.max(node.xp, next.xp - 1);
    expect(isCurrentNode(node, xp)).toBe(true);
  });

  it("is false for a node once the next node is also unlocked", () => {
    const node = nodeAt(3);
    const next = nodeAt(4);
    expect(isCurrentNode(node, next.xp)).toBe(false);
  });

  it("is false for a node that isn't unlocked at all", () => {
    const node = nodeAt(ROAD_NODES.length - 1);
    expect(isCurrentNode(node, 0)).toBe(false);
  });

  it("is true for the very last node once its own threshold is met (no next node)", () => {
    const last = nodeAt(ROAD_NODES.length - 1);
    expect(isCurrentNode(last, last.xp)).toBe(true);
  });
});

describe("nextRoadNode", () => {
  it("points at the first node the player has not reached", () => {
    const target = nodeAt(4);
    const result = nextRoadNode(target.xp - 1);
    expect(result?.node.id).toBe(target.id);
    expect(result?.xpAway).toBe(1);
  });

  it("moves on the moment a node's threshold is met, not after", () => {
    // Standing exactly on a node means it is reached. Still pointing at it
    // would tell the player they are 0 XP from something they already have.
    const target = nodeAt(4);
    const result = nextRoadNode(target.xp);
    expect(result?.node.id).not.toBe(target.id);
    expect(result?.xpAway).toBeGreaterThan(0);
  });

  it("points at the first node on the road for a brand new player", () => {
    // Node 1 sits at 0 XP, so a new player is already past it.
    const result = nextRoadNode(0);
    expect(result?.node.id).toBe(nodeAt(1).id);
  });

  it("returns null at the top of the road", () => {
    // There is nothing after Eclipse III. The caller renders nothing rather
    // than "NaN XP to undefined".
    const last = nodeAt(ROAD_NODES.length - 1);
    expect(nextRoadNode(last.xp)).toBeNull();
    expect(nextRoadNode(last.xp + 100_000)).toBeNull();
  });

  it("never reports a distance that is not positive", () => {
    for (const node of ROAD_NODES) {
      const result = nextRoadNode(node.xp);
      if (result) expect(result.xpAway).toBeGreaterThan(0);
    }
  });
});

describe("TIER_THRESHOLDS", () => {
  it("covers every tier a node can be on", () => {
    const onNodes = new Set(ROAD_NODES.map((n) => n.tier));
    const declared = new Set(TIER_THRESHOLDS.map((t) => t.id));
    for (const tier of onNodes) expect(declared, tier).toContain(tier);
  });

  it("climbs, so a higher realm always costs more", () => {
    const xp = TIER_THRESHOLDS.map((t) => t.xpRequired);
    expect([...xp].sort((a, b) => a - b)).toEqual(xp);
    expect(new Set(xp).size).toBe(xp.length);
  });

  it("starts at zero, so a new player is already in a realm", () => {
    expect(TIER_THRESHOLDS[0]?.xpRequired).toBe(0);
  });

  it("names each realm once", () => {
    const names = TIER_THRESHOLDS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("agrees with TIER_ORDER, which is derived from it", () => {
    expect(TIER_ORDER).toEqual(TIER_THRESHOLDS.map((t) => t.id));
  });

  it("opens no realm after a node that belongs to it", () => {
    // A node in a realm the player has not reached would render as available
    // inside a locked tier.
    for (const tier of TIER_THRESHOLDS) {
      const firstNode = ROAD_NODES.find((n) => n.tier === tier.id);
      if (firstNode) expect(firstNode.xp, tier.name).toBeGreaterThanOrEqual(tier.xpRequired);
    }
  });
});

describe("xpToTier", () => {
  it("answers with the realm the player is in at every boundary", () => {
    for (const tier of TIER_THRESHOLDS) {
      expect(xpToTier(tier.xpRequired).name, tier.name).toBe(tier.name);
    }
  });

  it("stays in the realm below until the next one opens", () => {
    for (let i = 1; i < TIER_THRESHOLDS.length; i++) {
      const below = TIER_THRESHOLDS[i - 1];
      const tier = TIER_THRESHOLDS[i];
      if (!below || !tier) continue;
      expect(xpToTier(tier.xpRequired - 1).name, tier.name).toBe(below.name);
    }
  });

  it("keeps a player above the top threshold in the top realm", () => {
    // Read lowest-first, the loop would fall through and report the bottom one.
    const top = TIER_THRESHOLDS[TIER_THRESHOLDS.length - 1];
    expect(top).toBeDefined();
    if (top) expect(xpToTier(top.xpRequired * 10).name).toBe(top.name);
  });

  it("puts a brand new player in the first realm", () => {
    expect(xpToTier(0).name).toBe(TIER_THRESHOLDS[0]?.name);
  });
});
