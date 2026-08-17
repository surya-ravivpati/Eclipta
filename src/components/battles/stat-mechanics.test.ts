import { describe, expect, it, vi, afterEach } from "vitest";
import type { LucideIcon } from "lucide-react";
import type { Archetype } from "./types";
import {
  absorbWithShield,
  applyDefense,
  botAccuracy,
  COPYABLE_PASSIVES,
  getActionDifficultyLevel,
  getEffectiveDamage,
  getHealShield,
  getQuestionTime,
  healAfterFalloff,
  healFalloff,
  getScoreMultiplier,
  getStreakHeal,
  levelToCategory,
  rollCopiedPassive,
  rollMissPenalty,
} from "./stat-mechanics";
import { DAMAGE_TUNING, QUESTION_TIMER } from "@/config/battle-tuning";

/** Damage without the crit roll - keeps the arithmetic assertions deterministic. */
function damage(arch: Archetype, opts: Parameters<typeof getEffectiveDamage>[1]): number {
  return getEffectiveDamage(arch, { ...opts, allowCrit: false }).damage;
}

function archetype(overrides: Partial<Archetype> = {}): Archetype {
  return {
    id: "brawler",
    name: "Test",
    icon: (() => null) as unknown as LucideIcon,
    color: "#000",
    borderColor: "#000",
    description: "",
    passive: "",
    maxHp: 150,
    baseDamage: 15,
    defense: 0,
    critBonus: 0,
    healAmount: 10,
    timeSeconds: 30,
    diffMin: 3,
    diffMax: 7,
    focusPool: 10,
    startFocus: 5,
    ...overrides,
  } as Archetype;
}

describe("levelToCategory", () => {
  it.each([
    [1, "easy"],
    [3, "easy"],
    [4, "medium"],
    [7, "medium"],
    [8, "hard"],
    [10, "hard"],
  ])("maps level %i to %s", (level, expected) => {
    expect(levelToCategory(level)).toBe(expected);
  });
});

describe("getActionDifficultyLevel", () => {
  const arch = archetype({ diffMin: 2, diffMax: 8 });

  it("gives defend the easiest question in range", () => {
    expect(getActionDifficultyLevel(arch, "defend")).toBe(2);
  });

  it("gives charge the hardest question in range", () => {
    expect(getActionDifficultyLevel(arch, "charge")).toBe(8);
  });

  it("gives attack the midpoint of the range", () => {
    expect(getActionDifficultyLevel(arch, "attack")).toBe(5);
  });

  it("puts the ultimate at the midpoint, like a normal attack", () => {
    expect(getActionDifficultyLevel(arch, "ultimate")).toBe(5);
  });

  it("keeps every action inside the archetype's range", () => {
    for (const action of ["attack", "defend", "charge", "ultimate"] as const) {
      const level = getActionDifficultyLevel(arch, action);
      expect(level).toBeGreaterThanOrEqual(arch.diffMin);
      expect(level).toBeLessThanOrEqual(arch.diffMax);
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});

describe("getEffectiveDamage", () => {
  it("returns the flat base damage for a plain attack", () => {
    expect(damage(archetype(), { action: "attack" })).toBe(15);
  });

  it("multiplies charge damage by the charge multiplier", () => {
    expect(damage(archetype(), { action: "charge" })).toBe(
      Math.floor(15 * DAMAGE_TUNING.chargeMultiplier),
    );
  });

  it("gives a time-scaled archetype its full bonus at full speed", () => {
    const speedster = archetype({ damageIsTimeScaled: true, baseDamage: 16 });
    expect(damage(speedster, { action: "attack", timeSpent: 0, maxTime: 30 })).toBe(
      16 + DAMAGE_TUNING.speedster.maxSpeedBonus,
    );
  });

  it("gives a time-scaled archetype no bonus when the clock runs out", () => {
    const speedster = archetype({ damageIsTimeScaled: true, baseDamage: 16 });
    expect(damage(speedster, { action: "attack", timeSpent: 30, maxTime: 30 })).toBe(16);
  });

  it("ignores the time bonus when maxTime is zero rather than dividing by it", () => {
    const speedster = archetype({ damageIsTimeScaled: true });
    expect(damage(speedster, { action: "attack", timeSpent: 5, maxTime: 0 })).toBe(15);
  });

  it("ramps a scaling archetype by a fixed step per correct answer", () => {
    const { damagePerAnswer } = DAMAGE_TUNING.accelerator;
    const accelerator = archetype({ damageRamps: true, baseDamage: 14 });
    expect(damage(accelerator, { action: "attack", correctCount: 0 })).toBe(14);
    expect(damage(accelerator, { action: "attack", correctCount: 3 })).toBe(
      14 + 3 * damagePerAnswer,
    );
  });

  it("caps the ramp however long the match runs", () => {
    const { damageCap } = DAMAGE_TUNING.accelerator;
    const accelerator = archetype({ damageRamps: true, baseDamage: 14 });
    expect(damage(accelerator, { action: "attack", correctCount: 999 })).toBe(14 + damageCap);
  });

  it("gives a raging archetype bonus damage only below the HP threshold", () => {
    const { rageHpThreshold, rageDamageBonus } = DAMAGE_TUNING.apex;
    const apex = archetype({ ragesWhenLow: true, baseDamage: 34 });
    expect(damage(apex, { action: "attack", currentHp: rageHpThreshold })).toBe(34);
    expect(damage(apex, { action: "attack", currentHp: rageHpThreshold - 1 })).toBe(
      Math.floor(34 * (1 + rageDamageBonus)),
    );
  });

  it("applies the crit bonus when the roll lands, and nothing when it misses", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const crit = getEffectiveDamage(archetype({ critBonus: 0.25 }), { action: "attack" });
    expect(crit.crit).toBe(true);
    expect(crit.damage).toBe(Math.floor(15 * 1.25));

    random.mockReturnValue(0.99);
    const plain = getEffectiveDamage(archetype({ critBonus: 0.25 }), { action: "attack" });
    expect(plain.crit).toBe(false);
    expect(plain.damage).toBe(15);
  });

  it("never crits an archetype with no crit power, however lucky the roll", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(getEffectiveDamage(archetype({ critBonus: 0 }), { action: "attack" }).crit).toBe(false);
  });

  it("gives a Fulcrum a reduced share of a borrowed passive", () => {
    const { copyStrength } = DAMAGE_TUNING.fulcrum;
    const { maxSpeedBonus } = DAMAGE_TUNING.speedster;
    const fulcrum = archetype({ copiesPassive: true, baseDamage: 18 });
    expect(
      damage(fulcrum, { action: "attack", timeSpent: 0, maxTime: 30, copied: "speedster" }),
    ).toBe(Math.floor(18 + maxSpeedBonus * copyStrength));
  });

  it("ignores a borrowed passive for an archetype that cannot copy", () => {
    const plain = archetype({ baseDamage: 18 });
    expect(
      damage(plain, { action: "attack", timeSpent: 0, maxTime: 30, copied: "speedster" }),
    ).toBe(18);
  });

  it("never resolves below one damage", () => {
    expect(damage(archetype({ baseDamage: 0 }), { action: "attack" })).toBe(1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});

describe("applyDefense", () => {
  it("passes damage through untouched with no defense", () => {
    expect(applyDefense(20, archetype({ defense: 0 }))).toBe(20);
  });

  it("reduces damage by the defender's defense", () => {
    expect(applyDefense(20, archetype({ defense: 0.2 }))).toBe(16);
  });

  it("caps defense so no archetype becomes immune", () => {
    const invincible = archetype({ defense: 1 });
    expect(applyDefense(100, invincible)).toBe(Math.floor(100 * (1 - DAMAGE_TUNING.maxDefense)));
  });

  it("never reduces a hit below one damage", () => {
    expect(applyDefense(1, archetype({ defense: 0.9 }))).toBe(1);
  });

  it("adds a reduced share of Tank's armour when a Fulcrum borrows it", () => {
    const fulcrum = archetype({ copiesPassive: true, defense: 0.1 });
    expect(applyDefense(100, fulcrum, "tank")).toBeLessThan(applyDefense(100, fulcrum));
  });
});

describe("absorbWithShield", () => {
  it("passes damage straight to HP with no shield", () => {
    expect(absorbWithShield(10, 0)).toEqual({ hpLoss: 10, shieldLeft: 0 });
  });

  it("spends the shield first and passes the remainder to HP", () => {
    expect(absorbWithShield(10, 4)).toEqual({ hpLoss: 6, shieldLeft: 0 });
  });

  it("absorbs the hit entirely when the shield covers it", () => {
    expect(absorbWithShield(4, 10)).toEqual({ hpLoss: 0, shieldLeft: 6 });
  });
});

describe("getHealShield", () => {
  it("grants nothing to an archetype without the passive", () => {
    expect(getHealShield(archetype(), 0)).toBe(0);
  });

  it("grants the full amount to a Healer", () => {
    const { shieldPerHeal } = DAMAGE_TUNING.healer;
    expect(getHealShield(archetype({ healGrantsShield: true }), 0)).toBe(shieldPerHeal);
  });

  it("banks repeat heals up to the cap and no further", () => {
    const { shieldCap } = DAMAGE_TUNING.healer;
    const healer = archetype({ healGrantsShield: true });
    expect(getHealShield(healer, shieldCap)).toBe(shieldCap);
    expect(getHealShield(healer, shieldCap - 1)).toBe(shieldCap);
  });

  it("grants a Fulcrum a reduced shield when it borrows the passive", () => {
    const { shieldPerHeal } = DAMAGE_TUNING.healer;
    const fulcrum = archetype({ copiesPassive: true });
    expect(getHealShield(fulcrum, 0, "healer")).toBe(
      Math.round(shieldPerHeal * DAMAGE_TUNING.fulcrum.copyStrength),
    );
  });
});

describe("getStreakHeal", () => {
  const god = archetype({ healsOnCorrectStreak: true });
  const { healInterval, healAmount } = DAMAGE_TUNING.god;

  it("heals only on answers that complete an interval", () => {
    expect(getStreakHeal(god, healInterval)).toBe(healAmount);
    expect(getStreakHeal(god, healInterval * 2)).toBe(healAmount);
    expect(getStreakHeal(god, healInterval - 1)).toBe(0);
    expect(getStreakHeal(god, healInterval + 1)).toBe(0);
  });

  it("heals nothing before the first answer", () => {
    expect(getStreakHeal(god, 0)).toBe(0);
  });

  it("heals nothing for an archetype without the passive", () => {
    expect(getStreakHeal(archetype(), healInterval)).toBe(0);
  });

  it("heals a Fulcrum a reduced amount when it borrows the passive", () => {
    const fulcrum = archetype({ copiesPassive: true });
    expect(getStreakHeal(fulcrum, healInterval, "god")).toBe(
      Math.round(healAmount * DAMAGE_TUNING.fulcrum.copyStrength),
    );
  });
});

describe("getScoreMultiplier", () => {
  const { stepPerHit, cap } = DAMAGE_TUNING.streakScore;

  it("is neutral with no momentum", () => {
    expect(getScoreMultiplier(archetype(), 0, 0)).toBe(1);
  });

  it("adds one step per point of momentum", () => {
    expect(getScoreMultiplier(archetype(), 3, 0)).toBeCloseTo(1 + 3 * stepPerHit);
  });

  it("caps the streak bonus", () => {
    expect(getScoreMultiplier(archetype(), 9999, 0)).toBeCloseTo(1 + cap);
  });

  it("adds the Accelerator's own ramp on top, capped", () => {
    const { scorePerAnswer, scoreCap } = DAMAGE_TUNING.accelerator;
    const accelerator = archetype({ damageRamps: true });
    expect(getScoreMultiplier(accelerator, 0, 2)).toBeCloseTo(1 + 2 * scorePerAnswer);
    expect(getScoreMultiplier(accelerator, 0, 9999)).toBeCloseTo(1 + scoreCap);
  });
});

describe("getQuestionTime", () => {
  it("uses the archetype's absolute clock regardless of question tier", () => {
    const healer = archetype({ timeSeconds: 70 });
    expect(getQuestionTime(healer, "easy")).toBe(70);
    expect(getQuestionTime(healer, "hard")).toBe(70);
  });

  it("stretches a ranged clock across the question tiers", () => {
    const speedster = archetype({ timeSeconds: 30, timeSecondsRange: [20, 40] });
    expect(getQuestionTime(speedster, "easy")).toBe(20);
    expect(getQuestionTime(speedster, "medium")).toBe(30);
    expect(getQuestionTime(speedster, "hard")).toBe(40);
  });

  it("never drops below the answerable floor", () => {
    expect(getQuestionTime(archetype({ timeSeconds: 1 }), "easy")).toBe(QUESTION_TIMER.minSeconds);
  });
});

describe("rollMissPenalty", () => {
  const { min, max } = DAMAGE_TUNING.missPenalty;

  it("stays inside the configured band at both extremes of the roll", () => {
    const random = vi.spyOn(Math, "random");
    random.mockReturnValue(0);
    expect(rollMissPenalty()).toBe(min);
    random.mockReturnValue(0.9999999);
    expect(rollMissPenalty()).toBe(max);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});

describe("rollCopiedPassive", () => {
  it("only ever returns a copyable passive", () => {
    for (let i = 0; i < 50; i++) {
      expect(COPYABLE_PASSIVES).toContain(rollCopiedPassive());
    }
  });

  it("excludes Fulcrum itself and the Gambler's reroll", () => {
    expect(COPYABLE_PASSIVES).not.toContain("fulcrum");
    expect(COPYABLE_PASSIVES).not.toContain("gambler");
  });
});

describe("botAccuracy", () => {
  it("is most accurate against the easiest difficulty range", () => {
    expect(botAccuracy(archetype({ diffMin: 1, diffMax: 1 }))).toBeCloseTo(0.85);
  });

  it("is least accurate against the hardest difficulty range", () => {
    expect(botAccuracy(archetype({ diffMin: 10, diffMax: 10 }))).toBeCloseTo(0.47);
  });

  it("falls monotonically as the difficulty range rises", () => {
    const easy = botAccuracy(archetype({ diffMin: 1, diffMax: 3 }));
    const mid = botAccuracy(archetype({ diffMin: 4, diffMax: 6 }));
    const hard = botAccuracy(archetype({ diffMin: 7, diffMax: 10 }));
    expect(easy).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(hard);
  });
});

/**
 * The heal chain exists to answer one complaint - a Healer parking on Defend -
 * without punishing the six archetypes for whom Heal is already the weakest
 * action they have. So the properties that matter are that a *single* heal is
 * untouched, that a chain tapers without ever reaching zero, and that the
 * shield rides the same curve. Left alone, the shield would be the whole
 * incentive on its own: it is a separate pool, so it is never wasted even at
 * full health.
 */
describe("healFalloff", () => {
  it("leaves the first heal of a chain completely alone", () => {
    expect(healFalloff(0)).toBe(1);
    expect(healFalloff(-1)).toBe(1);
  });

  it("takes more off each heal in a row", () => {
    let previous = healFalloff(0);
    for (let chain = 1; chain <= 6; chain++) {
      const current = healFalloff(chain);
      expect(current, `chain=${chain}`).toBeLessThanOrEqual(previous);
      previous = current;
    }
  });

  it("never taxes a heal out of existence", () => {
    // A turn that restores nothing at all is a turn the player cannot read.
    for (const chain of [1, 5, 50, 5000]) {
      expect(healFalloff(chain), `chain=${chain}`).toBeGreaterThan(0);
    }
  });

  it("settles on a floor rather than approaching zero", () => {
    expect(healFalloff(100)).toBe(healFalloff(1000));
  });
});

describe("healAfterFalloff", () => {
  it("returns a first heal unchanged", () => {
    expect(healAfterFalloff(24, 0)).toBe(24);
  });

  it("reduces each repeat", () => {
    const first = healAfterFalloff(24, 0);
    const second = healAfterFalloff(24, 1);
    const third = healAfterFalloff(24, 2);
    expect(second).toBeLessThan(first);
    expect(third).toBeLessThan(second);
  });

  it("still restores something at the end of a long chain", () => {
    expect(healAfterFalloff(24, 20)).toBeGreaterThanOrEqual(1);
    expect(healAfterFalloff(1, 20)).toBeGreaterThanOrEqual(1);
  });

  it("leaves nothing to restore as nothing", () => {
    // At full health the cap has already reduced the heal to zero; the tax
    // must not turn that into a phantom point.
    expect(healAfterFalloff(0, 0)).toBe(0);
    expect(healAfterFalloff(0, 3)).toBe(0);
  });

  it("keeps a chain of four worth more than a single heal", () => {
    // Stalling is meant to be taxed, not banned - a Healer that commits four
    // turns to it should still be ahead of one that healed once.
    const chained = [0, 1, 2, 3].reduce((total, i) => total + healAfterFalloff(24, i), 0);
    expect(chained).toBeGreaterThan(healAfterFalloff(24, 0));
  });

  it("still leaves healing worth doing against a typical attack", () => {
    // Two heals in a row should out-restore what one ordinary hit takes off,
    // or the archetype's whole premise stops working.
    expect(healAfterFalloff(24, 0) + healAfterFalloff(24, 1)).toBeGreaterThan(20);
  });
});

describe("getHealShield under a heal chain", () => {
  const healer = archetype({ healGrantsShield: true });
  const { shieldPerHeal, shieldCap } = DAMAGE_TUNING.healer;

  it("grants the full shield on the first heal", () => {
    expect(getHealShield(healer, 0, null, 0)).toBe(shieldPerHeal);
  });

  it("grants less on each repeat", () => {
    const first = getHealShield(healer, 0, null, 0);
    const second = getHealShield(healer, 0, null, 1);
    const third = getHealShield(healer, 0, null, 2);
    expect(second).toBeLessThan(first);
    expect(third).toBeLessThan(second);
  });

  it("still respects the bank cap", () => {
    expect(getHealShield(healer, shieldCap, null, 0)).toBe(shieldCap);
    expect(getHealShield(healer, shieldCap - 1, null, 0)).toBe(shieldCap);
  });

  it("grants nothing to an archetype without the passive, chain or no chain", () => {
    const plain = archetype();
    for (const chain of [0, 1, 5]) {
      expect(getHealShield(plain, 7, null, chain), `chain=${chain}`).toBe(7);
    }
  });

  it("defaults to an unchained heal when no chain is given", () => {
    // Every existing caller passes three arguments; they must keep working.
    expect(getHealShield(healer, 0, null)).toBe(getHealShield(healer, 0, null, 0));
  });
});
