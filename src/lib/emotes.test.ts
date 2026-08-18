import { describe, expect, it } from "vitest";
import { EMOTES, emoteForChest, getEmote, isEmoteId } from "@/config/emotes";
import { CHEST_REWARDS } from "@/config/battle-tuning";
import { ROAD_NODES } from "./trophy-road-data";
import { emoteForNode, emoteRoster, nodeForEmote, ownedEmotes } from "./emotes";

/**
 * Two kinds of guarantee here, and only one of them is about progression.
 *
 * The progression one: every emote must be reachable. An emote wired to a
 * chest that does not exist is a reward nobody can ever earn, and nothing else
 * in the app would say so.
 *
 * The safety one: `isEmoteId` is the only thing standing between a message
 * from a stranger's browser and what gets drawn on screen. It has to reject
 * everything that is not in the roster, including the values a JavaScript
 * object hands out for free.
 */

describe("the roster", () => {
  it("gives every emote a chest that exists", () => {
    for (const emote of EMOTES) {
      expect(CHEST_REWARDS[emote.chest], `${emote.name} -> ${emote.chest}`).toBeDefined();
    }
  });

  it("puts every emote on a node a player can actually reach", () => {
    for (const emote of EMOTES) {
      expect(nodeForEmote(emote), `${emote.name}`).not.toBeNull();
    }
  });

  it("never puts two emotes in one chest", () => {
    const chests = EMOTES.map((e) => e.chest);
    expect(new Set(chests).size).toBe(chests.length);
  });

  it("has unique ids", () => {
    const ids = EMOTES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("spreads them across tiers rather than stacking them", () => {
    const tiers = EMOTES.map((e) => nodeForEmote(e)?.tier);
    expect(new Set(tiers).size).toBe(EMOTES.length);
  });

  it("orders them by how far along the road they are", () => {
    // The picker renders in roster order, so the order is what a player reads
    // as "how far off is that one".
    const xp = EMOTES.map((e) => nodeForEmote(e)?.xp ?? 0);
    expect([...xp].sort((a, b) => a - b)).toEqual(xp);
  });
});

describe("isEmoteId", () => {
  it("accepts every real id", () => {
    for (const emote of EMOTES) expect(isEmoteId(emote.id)).toBe(true);
  });

  it("rejects anything else", () => {
    const rejected: unknown[] = [
      "",
      "nope",
      "SPARK",
      " spark",
      "spark ",
      1,
      null,
      undefined,
      {},
      [],
    ];
    for (const [i, value] of rejected.entries()) {
      expect(isEmoteId(value), `case ${i}`).toBe(false);
    }
  });

  it("rejects the names every object answers to", () => {
    // A Map is used rather than a plain object precisely so that "toString"
    // and "constructor" are not accidentally valid emotes.
    for (const value of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
      expect(isEmoteId(value), value).toBe(false);
      expect(getEmote(value), value).toBeNull();
    }
  });
});

describe("ownership", () => {
  const first = EMOTES[0];
  const second = EMOTES[1];
  if (!first || !second) throw new Error("the roster needs at least two emotes");
  const firstNode = nodeForEmote(first);
  const secondNode = nodeForEmote(second);
  if (!firstNode || !secondNode) throw new Error("both emotes need a node");

  it("owns nothing before any chest is opened", () => {
    expect(ownedEmotes([])).toEqual([]);
  });

  it("owns exactly what the opened chests hold", () => {
    expect(ownedEmotes([firstNode.id]).map((e) => e.id)).toEqual([first.id]);
  });

  it("ignores claims on chests that hold no emote", () => {
    const plain = ROAD_NODES.find((n) => n.type === "chest" && emoteForNode(n) === null);
    expect(plain).toBeDefined();
    if (plain) expect(ownedEmotes([plain.id])).toEqual([]);
  });

  it("keeps roster order however the claims arrive", () => {
    expect(ownedEmotes([secondNode.id, firstNode.id]).map((e) => e.id)).toEqual([
      first.id,
      second.id,
    ]);
  });

  it("lists the locked ones too, with the chest that opens them", () => {
    const roster = emoteRoster([firstNode.id]);
    expect(roster).toHaveLength(EMOTES.length);
    expect(roster[0]?.owned).toBe(true);
    expect(roster[1]?.owned).toBe(false);
    expect(roster[1]?.from?.label).toBe(secondNode.label);
  });
});

describe("emoteForChest and emoteForNode", () => {
  it("agree with each other", () => {
    for (const node of ROAD_NODES.filter((n) => n.type === "chest")) {
      expect(emoteForNode(node)).toBe(emoteForChest(node.rewardKey ?? node.label));
    }
  });

  it("returns null for a node that is not a chest", () => {
    const monster = ROAD_NODES.find((n) => n.type === "monster");
    expect(monster).toBeDefined();
    if (monster) expect(emoteForNode(monster)).toBeNull();
  });

  it("returns null for a chest key nobody uses", () => {
    expect(emoteForChest("Not A Chest")).toBeNull();
  });
});
