import { describe, it, expect, vi, afterEach } from "vitest";
import { ROAD_NODES } from "./trophy-road-data";

/**
 * These messages were dead for every tier on the road.
 *
 * The tier table was keyed on display labels ("Bronze I", "Gold I") that the
 * road had been renamed away from ("Dawn I", "Meridian I"), so no tier-up
 * message could ever fire - and nothing failed, because a missing key just
 * meant no toast. The tables are keyed on the typed unions now, which makes
 * that drift a build error; these tests cover the half a compiler cannot see,
 * namely that each kind of node announces itself exactly once.
 *
 * Every test takes a fresh copy of the module: it remembers what it has
 * already shown in module-level state, which is right for a session and fatal
 * for a shared test fixture.
 */

vi.mock("sonner", () => ({ toast: vi.fn() }));

// The toast titles lead with an emoji, and source files here stay ASCII, so
// the two markers this file matches on are named by code point instead.
const TIER_BADGE = String.fromCodePoint(0x1f3c5); // sports medal
const CHEST = String.fromCodePoint(0x1f381); // wrapped gift

const TOP_XP = Math.max(...ROAD_NODES.map((n) => n.xp));

/** A copy of the module that has never announced anything. */
async function freshMilestones() {
  vi.resetModules();
  return import("./milestones");
}

/** Walk the whole road in one jump, from nothing to past the last node. */
async function crossEverything() {
  const { checkMilestones } = await freshMilestones();
  return checkMilestones(-1, TOP_XP);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("tier milestones", () => {
  it("announces every tier when the whole road is crossed", async () => {
    // The regression this file exists for: eight tiers, eight announcements.
    const tiers = new Set(ROAD_NODES.map((n) => n.tier));
    const { toasts } = await crossEverything();
    expect(toasts.filter((t) => t.title.startsWith(TIER_BADGE))).toHaveLength(tiers.size);
  });

  it("announces a tier the moment its opening rank node is reached", async () => {
    const moonrise = ROAD_NODES.find((n) => n.type === "rank" && n.tier === "silver");
    expect(moonrise).toBeDefined();

    const { checkMilestones } = await freshMilestones();
    const { toasts } = checkMilestones(moonrise!.xp - 1, moonrise!.xp);

    const tierToast = toasts.find((t) => t.title.startsWith(TIER_BADGE));
    expect(tierToast?.title).toContain("Moonrise");
    expect(tierToast?.description).toContain("Moonrise");
  });

  it("names the tier the road actually uses, not an old internal name", async () => {
    const { toasts } = await crossEverything();
    const text = toasts.map((t) => `${t.title} ${t.description}`).join(" ");

    for (const name of ["Dawn", "Moonrise", "Meridian", "Penumbra", "Umbra", "Eclipse"]) {
      expect(text, `${name} tier never announced`).toContain(name);
    }
    // The names the dead table used must not come back.
    for (const stale of ["Bronze tier", "Silver tier", "Gold tier", "Diamond tier"]) {
      expect(text).not.toContain(stale);
    }
  });

  it("announces a tier once, not once per rank node in it", async () => {
    const { toasts } = await crossEverything();
    const tierToasts = toasts.filter((t) => t.title.startsWith(TIER_BADGE));
    const ranks = ROAD_NODES.filter((n) => n.type === "rank");

    expect(tierToasts.length).toBeLessThan(ranks.length);
    expect(new Set(tierToasts.map((t) => t.description)).size).toBe(tierToasts.length);
  });
});

describe("archetype and final unlocks", () => {
  it("gives every monster node an unlock message", async () => {
    const { toasts } = await crossEverything();
    for (const node of ROAD_NODES.filter((n) => n.type === "monster")) {
      const hit = toasts.find((t) => t.title.includes(node.label));
      expect(hit, `${node.label} has no unlock message`).toBeDefined();
      expect(hit?.description.length).toBeGreaterThan(0);
    }
  });

  it("names Apex by its label even though its key is 'chud'", async () => {
    // The label and the archetype key disagree here, which is exactly the
    // kind of gap the old label-keyed lookup fell into.
    const { toasts } = await crossEverything();
    expect(toasts.find((t) => t.title.includes("Apex"))?.description).toContain("Apex");
  });

  it("announces the Eclipse Archetype, which the old table called God", async () => {
    const { toasts } = await crossEverything();
    const hit = toasts.find((t) => t.title.includes("Eclipse Archetype"));
    expect(hit).toBeDefined();
    expect(hit?.description).toContain("Eclipse Archetype");
  });

  it("announces both final monsters", async () => {
    const { toasts } = await crossEverything();
    expect(toasts.some((t) => t.title.includes("Newton"))).toBe(true);
    expect(toasts.some((t) => t.title.includes("ECLIPTADON"))).toBe(true);
  });
});

describe("chests", () => {
  it("tells the player a chest is ready without claiming it", async () => {
    const { toasts } = await crossEverything();
    const chests = ROAD_NODES.filter((n) => n.type === "chest");
    const chestToasts = toasts.filter((t) => t.title.startsWith(CHEST));

    expect(chestToasts).toHaveLength(chests.length);
    expect(chestToasts[0]?.description).toMatch(/claim/i);
  });
});

describe("not repeating itself", () => {
  it("says nothing when XP has not moved", async () => {
    const { checkMilestones } = await freshMilestones();
    expect(checkMilestones(5000, 5000)).toEqual({ toasts: [], lunaMessages: [] });
  });

  it("announces nothing a second time in the same session", async () => {
    const { checkMilestones } = await freshMilestones();

    const first = checkMilestones(-1, TOP_XP);
    expect(first.toasts.length).toBeGreaterThan(0);

    expect(checkMilestones(-1, TOP_XP).toasts).toEqual([]);
  });

  it("keeps a Luna line for every message worth speaking", async () => {
    const { toasts, lunaMessages } = await crossEverything();
    // Chests are the one kind that toast without a Luna line - they are a
    // prompt to go and claim, not an achievement.
    const chestCount = toasts.filter((t) => t.title.startsWith(CHEST)).length;
    expect(lunaMessages).toHaveLength(toasts.length - chestCount);
  });
});
