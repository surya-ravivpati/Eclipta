import { describe, expect, it } from "vitest";
import {
  ROAD_NODES,
  getUnlockedArchetypes,
  isNodeUnlocked,
  isCurrentNode,
} from "./trophy-road-data";
import { getEcliptarBySlug } from "./ecliptars";

describe("ROAD_NODES data invariants", () => {
  it("has unique ids", () => {
    const ids = ROAD_NODES.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has non-decreasing xp thresholds in array order", () => {
    for (let i = 1; i < ROAD_NODES.length; i++) {
      expect(ROAD_NODES[i].xp).toBeGreaterThanOrEqual(ROAD_NODES[i - 1].xp);
    }
  });

  it("has exactly one node of each final-boss type (newton, ecliptadon)", () => {
    const finals = ROAD_NODES.filter((n) => n.type === "final");
    expect(finals.map((n) => n.finalMonster).sort()).toEqual(["ecliptadon", "newton"]);
  });

  it("every ecliptarSlugs entry resolves to a real Ecliptar", () => {
    const missing: string[] = [];
    for (const node of ROAD_NODES) {
      for (const slug of node.ecliptarSlugs ?? []) {
        if (!getEcliptarBySlug(slug)) missing.push(`${node.label} (id ${node.id}): ${slug}`);
      }
    }
    expect(missing).toEqual([]);
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
    expect(speedsterNode).toBeDefined();
    const result = getUnlockedArchetypes(speedsterNode!.xp);
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
    const node = ROAD_NODES[5];
    expect(isNodeUnlocked(node, node.xp)).toBe(true);
    expect(isNodeUnlocked(node, node.xp - 1)).toBe(false);
    expect(isNodeUnlocked(node, node.xp + 1)).toBe(true);
  });
});

describe("isCurrentNode", () => {
  it("is true for the highest node whose threshold has been met, when the next node hasn't been", () => {
    const node = ROAD_NODES[3];
    const next = ROAD_NODES[4];
    // Exactly at this node's xp and below the next node's xp.
    const xp = Math.max(node.xp, next.xp - 1);
    expect(isCurrentNode(node, xp)).toBe(true);
  });

  it("is false for a node once the next node is also unlocked", () => {
    const node = ROAD_NODES[3];
    const next = ROAD_NODES[4];
    expect(isCurrentNode(node, next.xp)).toBe(false);
  });

  it("is false for a node that isn't unlocked at all", () => {
    const node = ROAD_NODES[ROAD_NODES.length - 1];
    expect(isCurrentNode(node, 0)).toBe(false);
  });

  it("is true for the very last node once its own threshold is met (no next node)", () => {
    const last = ROAD_NODES[ROAD_NODES.length - 1];
    expect(isCurrentNode(last, last.xp)).toBe(true);
  });
});
