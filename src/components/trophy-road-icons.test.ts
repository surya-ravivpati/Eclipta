import { describe, expect, it } from "vitest";
import { ROAD_NODES, type MonsterArchetypeKey } from "@/lib/trophy-road-data";
import { nodeIcon, ROAD_ARCHETYPE_ICONS, TIER_ICONS } from "./trophy-road-icons";

/**
 * The thing worth guarding is that adjacent rewards look different. A player
 * scanning the road reads icons, not labels, so two identical marks in a row
 * say "you already have that one" whatever the text underneath claims.
 */

describe("nodeIcon", () => {
  it("gives every node an icon", () => {
    for (const node of ROAD_NODES) expect(nodeIcon(node)).toBeTypeOf("object");
  });

  it("distinguishes an ecliptar node from its own archetype's monster node", () => {
    // These two sit next to each other with nothing between them in seven of
    // the eight tiers, and used to draw the same mark twice.
    const archetypes = new Set(
      ROAD_NODES.filter((n) => n.type === "ecliptar" && n.archetype).map(
        (n) => n.archetype!,
      ),
    );
    expect(archetypes.size).toBeGreaterThan(0);
    for (const archetype of archetypes) {
      expect(nodeIcon({ type: "ecliptar", tier: "bronze", archetype })).not.toBe(
        nodeIcon({ type: "monster", tier: "bronze", archetype }),
      );
    }
  });

  it("never draws two neighbouring nodes with the same mark", () => {
    const clashes: string[] = [];
    for (let i = 1; i < ROAD_NODES.length; i++) {
      const before = ROAD_NODES[i - 1];
      const node = ROAD_NODES[i];
      if (!before || !node) continue;
      if (nodeIcon(before) === nodeIcon(node)) clashes.push(`${before.label} -> ${node.label}`);
    }
    expect(clashes).toEqual([]);
  });

  it("tells the two final monsters apart", () => {
    expect(nodeIcon({ type: "final", tier: "god", finalMonster: "newton" })).not.toBe(
      nodeIcon({ type: "final", tier: "god", finalMonster: "ecliptadon" }),
    );
  });

  it("gives each tier its own rank mark", () => {
    const marks = Object.values(TIER_ICONS);
    expect(new Set(marks).size).toBe(marks.length);
  });

  it("gives each archetype its own mark", () => {
    const marks = Object.values(ROAD_ARCHETYPE_ICONS);
    expect(new Set(marks).size).toBe(marks.length);
  });

  it("falls back rather than rendering nothing for a node with no archetype", () => {
    expect(nodeIcon({ type: "monster", tier: "bronze" })).toBe(
      nodeIcon({ type: "monster", tier: "gold" }),
    );
  });
});
