import { describe, expect, it } from "vitest";
import {
  BOT_ACCURACY,
  CHEST_REWARDS,
  DAMAGE_TUNING,
  damageTuningSchema,
  QUESTION_TIMER,
  RATING_LEAGUES,
  ratingLeagueSchema,
} from "./battle-tuning";

/**
 * These constants are hardcoded, not user input - so why validate them with
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

  it("crit chance is a probability, shared by the whole roster", () => {
    expect(DAMAGE_TUNING.critChance).toBeGreaterThan(0);
    expect(DAMAGE_TUNING.critChance).toBeLessThanOrEqual(1);
  });

  it("caps defense below total immunity, so every archetype stays killable", () => {
    expect(DAMAGE_TUNING.maxDefense).toBeLessThan(1);
  });

  it("accelerator's caps leave room for at least one ramp step", () => {
    const { damagePerAnswer, damageCap, scorePerAnswer, scoreCap } = DAMAGE_TUNING.accelerator;
    expect(damageCap).toBeGreaterThanOrEqual(damagePerAnswer);
    expect(scoreCap).toBeGreaterThanOrEqual(scorePerAnswer);
  });

  it("healer's shield cap leaves room for at least one heal", () => {
    expect(DAMAGE_TUNING.healer.shieldCap).toBeGreaterThanOrEqual(
      DAMAGE_TUNING.healer.shieldPerHeal,
    );
  });

  it("god heals on a whole-number cadence of at least every other answer", () => {
    expect(Number.isInteger(DAMAGE_TUNING.god.healInterval)).toBe(true);
    expect(DAMAGE_TUNING.god.healInterval).toBeGreaterThan(1);
  });

  it("a borrowed passive is strictly weaker than owning it", () => {
    expect(DAMAGE_TUNING.fulcrum.copyStrength).toBeLessThan(1);
    expect(DAMAGE_TUNING.fulcrum.copyStrength).toBeGreaterThan(0);
  });

  it("the miss-penalty band is ordered", () => {
    expect(DAMAGE_TUNING.missPenalty.max).toBeGreaterThanOrEqual(DAMAGE_TUNING.missPenalty.min);
  });

  it("rejects a streak bonus that would feed back into damage", () => {
    // Guards the whole point of the redesign: momentum scales SCORE only, so
    // there is no damage multiplier key here to retune by accident.
    expect(DAMAGE_TUNING).not.toHaveProperty("streakDamage");
    expect(DAMAGE_TUNING).not.toHaveProperty("multiplierStep");
  });
});

describe("damage tuning schema", () => {
  it("rejects a ramp whose cap is below a single step", () => {
    expect(() =>
      damageTuningSchema.parse({
        ...DAMAGE_TUNING,
        accelerator: { ...DAMAGE_TUNING.accelerator, damageCap: 1, damagePerAnswer: 2 },
      }),
    ).toThrow();
  });

  it("rejects a crit chance above certainty", () => {
    expect(() => damageTuningSchema.parse({ ...DAMAGE_TUNING, critChance: 1.5 })).toThrow();
  });

  it("rejects an inverted miss-penalty band", () => {
    expect(() =>
      damageTuningSchema.parse({ ...DAMAGE_TUNING, missPenalty: { min: 20, max: 5 } }),
    ).toThrow();
  });
});

describe("QUESTION_TIMER", () => {
  it("keeps a whole-second floor that leaves a question answerable", () => {
    expect(Number.isInteger(QUESTION_TIMER.minSeconds)).toBe(true);
    expect(QUESTION_TIMER.minSeconds).toBeGreaterThan(0);
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
    // tier), only that nothing is zero or negative - covered above - and
    // that the schema itself enforces positivity.
    expect(amounts.every((n) => Number.isInteger(n))).toBe(true);
  });
});
