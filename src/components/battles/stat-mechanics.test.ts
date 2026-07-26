import { describe, expect, it, vi, afterEach } from "vitest";
import type { LucideIcon } from "lucide-react";
import type { Archetype } from "./types";
import {
  botAccuracy,
  getActionDifficultyLevel,
  getEffectiveDamage,
  getEffectiveMultiplierStep,
  hpToSelfDmgMult,
  levelToCategory,
  streakToMultiplier,
} from "./stat-mechanics";

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
    multiplierStep: 0.2,
    healAmount: 10,
    timeMultiplier: 1,
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

  it("keeps wild inside the range at both extremes of the roll", () => {
    const random = vi.spyOn(Math, "random");

    random.mockReturnValue(0);
    expect(getActionDifficultyLevel(arch, "wild")).toBe(2);

    // 0.999… is the largest value Math.random can return.
    random.mockReturnValue(0.9999999);
    expect(getActionDifficultyLevel(arch, "wild")).toBe(8);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});

describe("getEffectiveDamage", () => {
  it("returns the flat base damage for a plain attack", () => {
    expect(getEffectiveDamage(archetype(), { action: "attack" })).toBe(15);
  });

  it("multiplies charge damage by 1.8", () => {
    expect(getEffectiveDamage(archetype(), { action: "charge" })).toBe(27);
  });

  it("doubles a time-scaled archetype's damage at full speed", () => {
    const speedster = archetype({ damageIsTimeScaled: true, baseDamage: 15 });
    expect(getEffectiveDamage(speedster, { action: "attack", timeSpent: 0, maxTime: 30 })).toBe(30);
  });

  it("gives a time-scaled archetype no bonus when the clock runs out", () => {
    const speedster = archetype({ damageIsTimeScaled: true, baseDamage: 15 });
    expect(getEffectiveDamage(speedster, { action: "attack", timeSpent: 30, maxTime: 30 })).toBe(
      15,
    );
  });

  it("scales a ramping archetype from 13 up to 27 over ten questions", () => {
    const accelerator = archetype({ multiplierScales: true });
    expect(getEffectiveDamage(accelerator, { action: "attack", recordCount: 0 })).toBe(13);
    expect(getEffectiveDamage(accelerator, { action: "attack", recordCount: 10 })).toBe(27);
  });

  it("caps the ramp so damage cannot grow past ten questions", () => {
    const accelerator = archetype({ multiplierScales: true });
    expect(getEffectiveDamage(accelerator, { action: "attack", recordCount: 50 })).toBe(27);
  });

  it("ignores the time bonus when maxTime is zero rather than dividing by it", () => {
    const speedster = archetype({ damageIsTimeScaled: true });
    expect(getEffectiveDamage(speedster, { action: "attack", timeSpent: 5, maxTime: 0 })).toBe(15);
  });
});

describe("getEffectiveMultiplierStep", () => {
  it("uses the archetype's fixed step when it does not scale", () => {
    expect(getEffectiveMultiplierStep(archetype({ multiplierStep: 0.2 }), 5)).toBe(0.2);
  });

  it("ramps a scaling archetype from 0.15 to 0.40 over ten questions", () => {
    const accelerator = archetype({ multiplierScales: true });
    expect(getEffectiveMultiplierStep(accelerator, 0)).toBeCloseTo(0.15);
    expect(getEffectiveMultiplierStep(accelerator, 10)).toBeCloseTo(0.4);
    expect(getEffectiveMultiplierStep(accelerator, 99)).toBeCloseTo(0.4);
  });
});

describe("streakToMultiplier", () => {
  it("is neutral with no momentum", () => {
    expect(streakToMultiplier(0, 0.2)).toBe(1);
  });

  it("adds one step per point of momentum", () => {
    expect(streakToMultiplier(3, 0.2)).toBeCloseTo(1.6);
  });
});

describe("hpToSelfDmgMult", () => {
  it("punishes the lowest-HP archetype hardest", () => {
    expect(hpToSelfDmgMult(75)).toBeCloseTo(1.3);
  });

  it("barely stings the highest-HP archetype", () => {
    expect(hpToSelfDmgMult(250)).toBeCloseTo(0.5);
  });

  it("never exceeds the 1.30 ceiling below the 75 HP floor", () => {
    expect(hpToSelfDmgMult(40)).toBeCloseTo(1.3);
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
