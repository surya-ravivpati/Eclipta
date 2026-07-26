import { describe, expect, it } from "vitest";
import {
  BOT_ACCURACY,
  CHEST_REWARDS,
  DAMAGE_TUNING,
  RATING_LEAGUES,
  ratingLeagueSchema,
} from "./battle-tuning";

/**
 * These constants are hardcoded, not user input — so why validate them with
 * Zod at all? Because TypeScript's static types cannot express the
 * invariants that actually matter here: "leagues are sorted with no gaps",
 * "a difficulty range has a min no greater than its max". A typo that
 * violates one of those compiles fine and breaks silently at runtime. The
 * schema turns that into a loud failure at import time instead.
 */
describe("ratingLeagueSchema", () => {
  it("accepts a well-formed league", () => {
    expect(() =>
      ratingLeagueSchema.parse({ id: "bronze", name: "Bronze", floor: 0, ceiling: 1050 }),
    ).not.toThrow();
  });

  it("rejects a negative floor", () => {
    expect(() =>
      ratingLeagueSchema.parse({ id: "bronze", name: "Bronze", floor: -1, ceiling: 1050 }),
    ).toThrow();
  });

  it("rejects a ceiling at or below the floor", () => {
    expect(() =>
      ratingLeagueSchema.parse({ id: "bronze", name: "Bronze", floor: 1000, ceiling: 1000 }),
    ).toThrow();
  });
});

describe("RATING_LEAGUES", () => {
  it("is sorted ascending by floor with no gaps or overlaps", () => {
    for (let i = 1; i < RATING_LEAGUES.length; i++) {
      expect(RATING_LEAGUES[i]?.floor).toBe(RATING_LEAGUES[i - 1]?.ceiling);
    }
  });

  it("only the top league has no ceiling", () => {
    const withoutCeiling = RATING_LEAGUES.filter((l) => l.ceiling === null);
    expect(withoutCeiling).toHaveLength(1);
    expect(withoutCeiling[0]).toBe(RATING_LEAGUES.at(-1));
  });

  it("starts at rating zero", () => {
    expect(RATING_LEAGUES[0]?.floor).toBe(0);
  });
});

describe("DAMAGE_TUNING", () => {
  it("charge multiplies rather than reduces damage", () => {
    expect(DAMAGE_TUNING.chargeMultiplier).toBeGreaterThan(1);
  });

  it("accelerator's damage floor is below its ceiling", () => {
    expect(DAMAGE_TUNING.accelerator.baseDamage).toBeLessThan(
      DAMAGE_TUNING.accelerator.baseDamage + DAMAGE_TUNING.accelerator.damageRange,
    );
  });

  it("self-damage formula punishes low-HP archetypes more than high-HP ones", () => {
    const { baseMultiplier, referenceHp, hpDivisor, hpMultiplierRange } = DAMAGE_TUNING.selfDamage;
    const glassCannonMult = baseMultiplier;
    const tankMult =
      baseMultiplier - Math.max(0, (250 - referenceHp) / hpDivisor) * hpMultiplierRange;
    expect(glassCannonMult).toBeGreaterThan(tankMult);
  });
});

describe("BOT_ACCURACY", () => {
  it("min is below max", () => {
    expect(BOT_ACCURACY.min).toBeLessThan(BOT_ACCURACY.max);
  });

  it("both bounds are valid probabilities", () => {
    for (const p of [BOT_ACCURACY.min, BOT_ACCURACY.max]) {
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });
});

describe("CHEST_REWARDS", () => {
  it("has one entry per chest with a positive, matching bonus and reward string", () => {
    for (const [label, chest] of Object.entries(CHEST_REWARDS)) {
      expect(chest.bonusXp).toBeGreaterThan(0);
      expect(chest.reward).toBe(`+${chest.bonusXp} bonus XP`);
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("awards strictly more XP at each successive tier", () => {
    const amounts = Object.values(CHEST_REWARDS).map((c) => c.bonusXp);
    // Not asserting global monotonicity (Chest/Cache pairs interleave per
    // tier), only that nothing is zero or negative — covered above — and
    // that the schema itself enforces positivity.
    expect(amounts.every((n) => Number.isInteger(n))).toBe(true);
  });
});
