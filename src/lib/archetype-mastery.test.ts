import { describe, it, expect } from "vitest";
import { ARCHETYPES } from "@/components/battles/archetypes";
import type { ArchetypeId } from "@/components/battles/types";
import {
  emptyMastery,
  getMasteryRank,
  getMasteryStats,
  type ArchetypeMastery,
} from "./archetype-mastery";

/**
 * Mastery rank is the label a player carries on the class-select screen, so it
 * has to be monotonic - more play can never take a rank away - and it has to
 * name every archetype rather than falling through to "Rank 3". Both of those
 * are easy to break by editing the threshold table or adding an archetype, and
 * neither was covered.
 *
 * The database helpers below it are not tested here; they are thin wrappers
 * over an RPC and belong in an integration test.
 */

const ALL_ARCHETYPES = Object.keys(ARCHETYPES) as ArchetypeId[];

function mastery(over: Partial<ArchetypeMastery> = {}): ArchetypeMastery {
  return { ...emptyMastery("tank"), ...over };
}

describe("emptyMastery", () => {
  it("starts every counter at zero", () => {
    const m = emptyMastery("speedster");
    expect(m.archetype).toBe("speedster");
    expect(m.battles_played).toBe(0);
    expect(m.wins).toBe(0);
    expect(m.best_streak).toBe(0);
    expect(m.perfect_battles).toBe(0);
  });
});

describe("getMasteryRank", () => {
  it("is rank 0 before anything is played", () => {
    expect(getMasteryRank(emptyMastery("tank"), "tank").level).toBe(0);
  });

  it("reaches rank 1 on the first battle", () => {
    expect(getMasteryRank(mastery({ battles_played: 1 }), "tank").level).toBe(1);
  });

  it("withholds a rank when only some of its conditions are met", () => {
    // Plenty of battles but a losing record must not buy rank II.
    const m = mastery({ battles_played: 40, wins: 2, best_streak: 1 });
    expect(getMasteryRank(m, "tank").level).toBe(1);
  });

  it("awards the top rank only on the full set of conditions", () => {
    const m = mastery({
      battles_played: 60,
      wins: 40,
      best_streak: 12,
      perfect_battles: 2,
    });
    expect(getMasteryRank(m, "tank").level).toBe(5);
  });

  it("never falls as play accumulates", () => {
    // Monotonicity: a player's rank going down after a session would read as
    // the game taking something away from them.
    let previous = 0;
    for (let battles = 0; battles <= 80; battles += 4) {
      const m = mastery({
        battles_played: battles,
        wins: Math.round(battles * 0.7),
        best_streak: Math.min(battles, 14),
        perfect_battles: battles > 50 ? 2 : 0,
      });
      const level = getMasteryRank(m, "tank").level;
      expect(level, `rank dropped at ${battles} battles`).toBeGreaterThanOrEqual(previous);
      previous = level;
    }
  });

  it("names every rank for every archetype", () => {
    // A missing label falls through to "Rank 3", which looks like a bug on the
    // class-select screen.
    for (const arch of ALL_ARCHETYPES) {
      for (let level = 0; level <= 5; level++) {
        const m = mastery({
          battles_played: level === 0 ? 0 : 60,
          wins: 45,
          best_streak: 12,
          perfect_battles: 2,
        });
        const rank = getMasteryRank(m, arch);
        expect(rank.label, `${arch} rank has no label`).toBeTruthy();
        expect(rank.label).not.toMatch(/^Rank \d/);
        expect(rank.color.length).toBeGreaterThan(0);
      }
    }
  });

  it("gives a ranked player flavour text, and an unranked one none", () => {
    expect(getMasteryRank(emptyMastery("god"), "god").flavor).toBe("");
    const ranked = getMasteryRank(mastery({ battles_played: 1 }), "god");
    expect(ranked.flavor.length).toBeGreaterThan(0);
  });
});

describe("getMasteryStats", () => {
  it("is all zeroes before any play, not NaN", () => {
    expect(getMasteryStats(emptyMastery("chud"))).toEqual({ winRate: 0, accuracy: 0 });
  });

  it("reports whole percentages", () => {
    const m = mastery({
      battles_played: 4,
      wins: 3,
      total_questions: 8,
      total_correct: 6,
    });
    expect(getMasteryStats(m)).toEqual({ winRate: 75, accuracy: 75 });
  });

  it("rounds rather than truncating", () => {
    const m = mastery({ battles_played: 3, wins: 2, total_questions: 3, total_correct: 2 });
    expect(getMasteryStats(m).winRate).toBe(67);
  });
});
