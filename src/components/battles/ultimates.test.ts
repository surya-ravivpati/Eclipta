import { describe, expect, it } from "vitest";
import type { LucideIcon } from "lucide-react";
import type { Archetype } from "./types";
import { ULTIMATES, getUltimate, type UltimateOp } from "./ultimates";
import { resolveUltimate, type SideState } from "./resolve-ultimate";
import {
  addEffect,
  clearDebuffs,
  consumeUse,
  effect,
  isHarmful,
  labelFor,
  tickEffects,
  totalOf,
} from "./effects";
import { ECLIPTARS } from "@/lib/ecliptars";
import { ULTIMATE_TUNING } from "@/config/battle-tuning";

function archetype(overrides: Partial<Archetype> = {}): Archetype {
  return {
    id: "fulcrum",
    name: "Test",
    icon: (() => null) as unknown as LucideIcon,
    color: "#000",
    borderColor: "#000",
    description: "",
    passive: "",
    maxHp: 200,
    baseDamage: 20,
    defense: 0,
    critBonus: 0,
    healAmount: 20,
    timeSeconds: 30,
    diffMin: 3,
    diffMax: 7,
    focusPool: 100,
    startFocus: 20,
    ...overrides,
  };
}

function side(overrides: Partial<SideState> = {}): SideState {
  return {
    arch: archetype(),
    hp: 200,
    maxHp: 200,
    shield: 0,
    effects: [],
    bonusDamage: 0,
    scoreMult: 1,
    ...overrides,
  };
}

/** Resolve with a pinned RNG so random branches and crit rolls are decided. */
function cast(
  slug: string,
  roll: number,
  over: Partial<Parameters<typeof resolveUltimate>[1]> = {},
) {
  const ult = getUltimate(slug);
  if (!ult) throw new Error(`no ultimate for ${slug}`);
  return resolveUltimate(ult, {
    caster: side(),
    target: side(),
    correctCount: 0,
    hpHistory: [],
    rng: () => roll,
    ...over,
  });
}

// ─── Registry integrity ──────────────────────────────────────────────────────

describe("ULTIMATES registry", () => {
  it("defines exactly one ultimate for every Ecliptar in the roster", () => {
    const slugs = ECLIPTARS.map((e) => e.slug).sort();
    expect(Object.keys(ULTIMATES).sort()).toEqual(slugs);
  });

  it("gives all 32 Ecliptars an ultimate", () => {
    expect(Object.keys(ULTIMATES)).toHaveLength(32);
  });

  it("keys every entry by its own slug", () => {
    for (const [key, ult] of Object.entries(ULTIMATES)) {
      expect(ult.slug).toBe(key);
    }
  });

  it("gives every ultimate a name, description, tag and at least one op", () => {
    for (const ult of Object.values(ULTIMATES)) {
      expect(ult.name.length).toBeGreaterThan(0);
      expect(ult.description.length).toBeGreaterThan(0);
      expect(ult.tag.length).toBeGreaterThan(0);
      expect(ult.ops.length).toBeGreaterThan(0);
    }
  });

  it("never leaves a random branch empty of outcomes", () => {
    const walk = (ops: UltimateOp[]): void => {
      for (const op of ops) {
        if (op.op === "random") {
          expect(op.outcomes.length).toBeGreaterThan(0);
          for (const o of op.outcomes) {
            expect(o.weight).toBeGreaterThan(0);
            walk(o.ops);
          }
        } else if (op.op === "randomMany") {
          expect(op.outcomes.length).toBeGreaterThanOrEqual(op.count);
          for (const o of op.outcomes) walk(o.ops);
        }
      }
    };
    for (const ult of Object.values(ULTIMATES)) walk(ult.ops);
  });

  it("resolves every ultimate without throwing, at both RNG extremes", () => {
    for (const slug of Object.keys(ULTIMATES)) {
      for (const roll of [0, 0.9999999]) {
        expect(() => cast(slug, roll)).not.toThrow();
      }
    }
  });

  /**
   * No ultimate may be *only* a lasting effect.
   *
   * Five of them used to be exactly that: `ops: [eff(...)]` and nothing else.
   * You spent a full charge, the screen did not move, and the only feedback was
   * a status badge. That reads as a bug even while working correctly.
   *
   * The rule is deliberately structural rather than behavioural. An earlier
   * version of this test resolved each ultimate and demanded a visible change,
   * which failed honest designs for the wrong reasons: Wheel of Fortune has an
   * intentionally empty branch (a roulette you can lose is the point), and
   * Perfect Balance correctly does nothing to two identical fighters. Both are
   * working as designed. What is never right is a payload with no action in it
   * at all, and that is checkable from the data alone.
   */
  it("never makes an ultimate out of lasting effects alone", () => {
    for (const [slug, ult] of Object.entries(ULTIMATES)) {
      const actions = ult.ops.filter((op) => op.op !== "effect");
      expect(actions.length, `${slug} applies effects but never acts`).toBeGreaterThan(0);
    }
  });

  it("returns null for an unknown or missing slug", () => {
    expect(getUltimate(null)).toBeNull();
    expect(getUltimate("not-a-real-ecliptar")).toBeNull();
  });
});

// ─── Effect engine ───────────────────────────────────────────────────────────

describe("tickEffects", () => {
  it("deals poison damage and counts the turn down", () => {
    const t = tickEffects([effect({ kind: "poison", magnitude: 10, turnsLeft: 3 })]);
    expect(t.poisonDamage).toBe(10);
    expect(t.effects[0]?.turnsLeft).toBe(2);
  });

  it("escalates poison each tick", () => {
    let effects = [effect({ kind: "poison", magnitude: 8, turnsLeft: 5, escalate: 4 })];
    const seen: number[] = [];
    for (let i = 0; i < 3; i++) {
      const t = tickEffects(effects);
      seen.push(t.poisonDamage);
      effects = t.effects;
    }
    expect(seen).toEqual([8, 12, 16]);
  });

  it("drops an effect once its last turn ticks", () => {
    const t = tickEffects([effect({ kind: "poison", magnitude: 5, turnsLeft: 1 })]);
    expect(t.effects).toHaveLength(0);
  });

  it("reports regen healing", () => {
    const t = tickEffects([effect({ kind: "regen", magnitude: 15, turnsLeft: 4 })]);
    expect(t.regenHeal).toBe(15);
  });

  it("reports a freeze and expires it after the turn it costs", () => {
    const t = tickEffects([effect({ kind: "freeze", magnitude: 1, turnsLeft: 1 })]);
    expect(t.frozen).toBe(true);
    expect(t.effects).toHaveLength(0);
  });

  it("leaves use-based effects untouched by the passage of turns", () => {
    const t = tickEffects([effect({ kind: "damageBuff", magnitude: 12, usesLeft: 3 })]);
    expect(t.effects[0]?.usesLeft).toBe(3);
  });
});

describe("addEffect", () => {
  it("adds a new kind", () => {
    const out = addEffect([], effect({ kind: "regen", magnitude: 10, turnsLeft: 2 }));
    expect(out).toHaveLength(1);
  });

  it("refreshes rather than stacking a repeat cast", () => {
    const out = addEffect(
      [effect({ kind: "damageReduction", magnitude: 0.3, turnsLeft: 1 })],
      effect({ kind: "damageReduction", magnitude: 0.6, turnsLeft: 3 }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.magnitude).toBe(0.6);
    expect(out[0]?.turnsLeft).toBe(3);
  });

  it("keeps the longer duration when the weaker cast lasts longer", () => {
    const out = addEffect(
      [effect({ kind: "reflect", magnitude: 0.25, turnsLeft: 5 })],
      effect({ kind: "reflect", magnitude: 0.1, turnsLeft: 2 }),
    );
    expect(out[0]?.turnsLeft).toBe(5);
    expect(out[0]?.magnitude).toBe(0.25);
  });
});

describe("consumeUse", () => {
  it("spends one application", () => {
    const out = consumeUse(
      [effect({ kind: "damageBuff", magnitude: 10, usesLeft: 2 })],
      "damageBuff",
    );
    expect(out[0]?.usesLeft).toBe(1);
  });

  it("removes the effect when the last use is spent", () => {
    const out = consumeUse(
      [effect({ kind: "damageMult", magnitude: 2, usesLeft: 1 })],
      "damageMult",
    );
    expect(out).toHaveLength(0);
  });

  it("is a no-op for a kind that is not present", () => {
    const start = [effect({ kind: "regen", magnitude: 5, turnsLeft: 2 })];
    expect(consumeUse(start, "damageBuff")).toEqual(start);
  });
});

describe("clearDebuffs", () => {
  it("removes harmful effects and keeps buffs", () => {
    const out = clearDebuffs([
      effect({ kind: "poison", magnitude: 10, turnsLeft: 3 }),
      effect({ kind: "healBlock", magnitude: 1, turnsLeft: 1 }),
      effect({ kind: "regen", magnitude: 15, turnsLeft: 4 }),
      effect({ kind: "damageReduction", magnitude: 0.5, turnsLeft: 2 }),
    ]);
    expect(out.map((e) => e.kind)).toEqual(["regen", "damageReduction"]);
  });

  it("classifies poison, freeze, heal-block and weakening as harmful", () => {
    for (const kind of ["poison", "freeze", "healBlock", "damageDebuff"] as const) {
      expect(isHarmful(kind)).toBe(true);
    }
    for (const kind of ["regen", "reflect", "scoreMult", "guaranteedCrit"] as const) {
      expect(isHarmful(kind)).toBe(false);
    }
  });
});

describe("labelFor", () => {
  it("renders turn-based and use-based durations differently", () => {
    expect(labelFor({ kind: "poison", magnitude: 10, turnsLeft: 3 })).toBe("POISON 10 · 3T");
    expect(labelFor({ kind: "damageBuff", magnitude: 12, usesLeft: 2 })).toBe("DMG +12 · 2×");
  });

  it("renders fractional kinds as percentages", () => {
    expect(labelFor({ kind: "damageReduction", magnitude: 0.6, turnsLeft: 3 })).toBe(
      "ARMOUR 60% · 3T",
    );
  });
});

// ─── Individual ultimates ────────────────────────────────────────────────────

describe("damage ultimates", () => {
  it("Newton's true damage bypasses the target's DEF entirely", () => {
    const armoured = side({ arch: archetype({ defense: 0.5 }) });
    const out = resolveUltimate(ULTIMATES.newton, {
      caster: side({ hp: 100 }),
      target: armoured,
      correctCount: 0,
      hpHistory: [],
      rng: () => 0.99,
    });
    expect(out.damageDealt).toBe(45);
    expect(out.timerDelta.opponent).toBe(-10);
    expect(out.healed).toBe(15);
  });

  it("Eclipse Cataclysm goes straight through a shield", () => {
    const shielded = side({ shield: 40 });
    const out = resolveUltimate(ULTIMATES.ecliptadon, {
      caster: side(),
      target: shielded,
      correctCount: 0,
      hpHistory: [],
      rng: () => 0.99,
    });
    expect(out.target.shield).toBe(40);
    expect(out.target.hp).toBe(200 - 55);
  });

  it("Thunder Rush lands three separate hits", () => {
    const out = cast("speedster-b", 0.99);
    expect(out.damageDealt).toBe(36);
    expect(out.timerDelta.opponent).toBe(-9);
  });

  it("Razor Dive strikes twice when the first dive leaves the target alive", () => {
    const out = resolveUltimate(ULTIMATES["speedster-a"], {
      caster: side({ arch: archetype({ critBonus: 0.2 }) }),
      target: side({ hp: 500, maxHp: 500 }),
      correctCount: 0,
      hpHistory: [],
      rng: () => 0.99,
    });
    // 30 × 1.2 crit = 36, twice.
    expect(out.damageDealt).toBe(72);
  });

  it("Razor Dive does not repeat once the target is down", () => {
    const out = resolveUltimate(ULTIMATES["speedster-a"], {
      caster: side(),
      target: side({ hp: 10, maxHp: 200 }),
      correctCount: 0,
      hpHistory: [],
      rng: () => 0.99,
    });
    expect(out.target.hp).toBe(0);
    expect(out.damageDealt).toBe(10);
  });

  it("Infernal Balance drains half of what it deals", () => {
    const out = resolveUltimate(ULTIMATES["fulcrum-a"], {
      caster: side({ hp: 100 }),
      target: side(),
      correctCount: 0,
      hpHistory: [],
      rng: () => 0.99,
    });
    expect(out.damageDealt).toBe(40);
    expect(out.healed).toBe(20);
  });

  it("a shield soaks ultimate damage before HP", () => {
    const out = resolveUltimate(ULTIMATES["tank-a"], {
      caster: side(),
      target: side({ shield: 25 }),
      correctCount: 0,
      hpHistory: [],
      rng: () => 0.99,
    });
    expect(out.target.shield).toBe(0);
    expect(out.target.hp).toBe(200 - 15);
  });

  it("reflect pays damage back to the caster", () => {
    const out = resolveUltimate(ULTIMATES["tank-a"], {
      caster: side(),
      target: side({ effects: [effect({ kind: "reflect", magnitude: 0.25, turnsLeft: 3 })] }),
      correctCount: 0,
      hpHistory: [],
      rng: () => 0.99,
    });
    expect(out.selfDamage).toBe(10);
  });
});

describe("support ultimates", () => {
  it("Divine Grace heals, cleanses and shields", () => {
    const out = resolveUltimate(ULTIMATES["healer-a"], {
      caster: side({
        hp: 100,
        effects: [effect({ kind: "poison", magnitude: 10, turnsLeft: 3 })],
      }),
      target: side(),
      correctCount: 0,
      hpHistory: [],
      rng: () => 0.5,
    });
    expect(out.healed).toBe(60);
    expect(out.caster.effects.some((e) => e.kind === "poison")).toBe(false);
    expect(out.caster.shield).toBe(20);
  });

  it("caps a shield at the tuning ceiling", () => {
    const out = resolveUltimate(ULTIMATES["tank-d"], {
      caster: side({ shield: ULTIMATE_TUNING.maxShield }),
      target: side(),
      correctCount: 0,
      hpHistory: [],
      rng: () => 0.5,
    });
    expect(out.caster.shield).toBe(ULTIMATE_TUNING.maxShield);
  });

  it("refuses to heal a class that cannot heal", () => {
    const out = resolveUltimate(ULTIMATES["healer-a"], {
      caster: side({ hp: 100, arch: archetype({ healAmount: null }) }),
      target: side(),
      correctCount: 0,
      hpHistory: [],
      rng: () => 0.5,
    });
    expect(out.healed).toBe(0);
  });

  it("respects a heal block", () => {
    const out = resolveUltimate(ULTIMATES["healer-d"], {
      caster: side({
        hp: 100,
        effects: [effect({ kind: "healBlock", magnitude: 1, turnsLeft: 1 })],
      }),
      target: side(),
      correctCount: 0,
      hpHistory: [],
      rng: () => 0.5,
    });
    expect(out.healed).toBe(0);
    // The shield half of Nature's Embrace still lands.
    expect(out.caster.shield).toBe(35);
  });

  it("never heals past the HP bar", () => {
    const out = resolveUltimate(ULTIMATES["healer-a"], {
      caster: side({ hp: 190, maxHp: 200 }),
      target: side(),
      correctCount: 0,
      hpHistory: [],
      rng: () => 0.5,
    });
    expect(out.healed).toBe(10);
    expect(out.caster.hp).toBe(200);
  });
});

describe("time and state ultimates", () => {
  it("Infinite Cycle restores HP from two turns ago and resets cooldowns", () => {
    const out = resolveUltimate(ULTIMATES.temporobys, {
      caster: side({ hp: 50 }),
      target: side(),
      correctCount: 0,
      hpHistory: [90, 150, 180],
      rng: () => 0.5,
    });
    expect(out.caster.hp).toBe(150);
    expect(out.resetCooldowns).toBe(true);
  });

  it("Infinite Cycle never rewinds HP downward", () => {
    const out = resolveUltimate(ULTIMATES.temporobys, {
      caster: side({ hp: 180 }),
      target: side(),
      correctCount: 0,
      hpHistory: [100, 60],
      rng: () => 0.5,
    });
    expect(out.caster.hp).toBe(180);
  });

  it("Velocity Break pins the next clock", () => {
    const out = cast("speedster-c", 0.5);
    expect(out.nextTimerOverride).toEqual({ seconds: 15, damagePerUnusedSecond: 2 });
  });

  it("Time Fracture grants a turn, permanent damage and a timer cut", () => {
    const out = cast("accelerator-d", 0.5);
    expect(out.extraTurn).toBe(true);
    expect(out.caster.bonusDamage).toBe(5);
    expect(out.timerDelta.opponent).toBe(-8);
  });

  it("Arcane Reflection copies the opponent's archetype passive", () => {
    const out = resolveUltimate(ULTIMATES["fulcrum-b"], {
      caster: side(),
      target: side({ arch: archetype({ id: "tank", name: "The Tank" }) }),
      correctCount: 0,
      hpHistory: [],
      rng: () => 0.5,
    });
    const copied = out.caster.effects.find((e) => e.kind === "copiedPassive");
    expect(copied?.passive).toBe("tank");
    expect(copied?.turnsLeft).toBe(3);
  });

  it("Perfect Balance equalises HP across both sides", () => {
    const out = resolveUltimate(ULTIMATES["fulcrum-d"], {
      caster: side({ hp: 40 }),
      target: side({ hp: 200 }),
      correctCount: 0,
      hpHistory: [],
      rng: () => 0.5,
    });
    expect(out.caster.hp).toBe(120);
    expect(out.target.hp).toBe(120);
  });

  it("Perfect Balance cannot push a side above its own max HP", () => {
    const out = resolveUltimate(ULTIMATES["fulcrum-d"], {
      caster: side({ hp: 100, maxHp: 100 }),
      target: side({ hp: 400, maxHp: 400 }),
      correctCount: 0,
      hpHistory: [],
      rng: () => 0.5,
    });
    expect(out.caster.hp).toBe(100);
  });

  it('"Actually..." steals only the multiplier the target actually has', () => {
    const rich = resolveUltimate(ULTIMATES["chud-d"], {
      caster: side(),
      target: side({ scoreMult: 1.5 }),
      correctCount: 0,
      hpHistory: [],
      rng: () => 0.5,
    });
    expect(rich.scoreMultStolen).toBeCloseTo(0.1);

    const broke = resolveUltimate(ULTIMATES["chud-d"], {
      caster: side(),
      target: side({ scoreMult: 1 }),
      correctCount: 0,
      hpHistory: [],
      rng: () => 0.5,
    });
    expect(broke.scoreMultStolen).toBe(0);
  });
});

describe("random ultimates", () => {
  it("High Stakes takes the first branch at the low end of the roll", () => {
    const out = cast("gambler-a", 0);
    expect(out.rolls).toEqual(["MASSIVE DAMAGE"]);
    expect(out.damageDealt).toBe(70);
  });

  it("High Stakes can backfire at the top of the roll", () => {
    const out = cast("gambler-a", 0.9999999);
    expect(out.rolls).toEqual(["BACKFIRE"]);
    expect(out.selfDamage).toBe(30);
  });

  it("always picks exactly one branch of a weighted roll", () => {
    for (const slug of ["gambler-a", "gambler-b", "gambler-c", "fulcrum-c"]) {
      for (const roll of [0, 0.25, 0.5, 0.75, 0.9999999]) {
        expect(cast(slug, roll).rolls).toHaveLength(1);
      }
    }
  });

  it("Nine Lucky Tails draws three distinct blessings", () => {
    const out = cast("gambler-d", 0.5);
    expect(out.rolls).toHaveLength(3);
    expect(new Set(out.rolls).size).toBe(3);
  });

  it("Wheel of Fortune's empty branch does nothing at all", () => {
    const out = cast("gambler-c", 0.9999999);
    expect(out.rolls).toEqual(["NOTHING"]);
    expect(out.damageDealt).toBe(0);
    expect(out.healed).toBe(0);
    expect(out.caster.effects).toHaveLength(0);
  });
});

describe("effect-applying ultimates", () => {
  it("Adaptive Armor grants a 60% reduction for 3 turns", () => {
    const out = cast("tank-b", 0.5);
    expect(totalOf(out.caster.effects, "damageReduction")).toBeCloseTo(0.6);
    expect(out.caster.effects[0]?.turnsLeft).toBe(3);
  });

  it("Earthshaker Stampede locks the opponent's healing", () => {
    const out = cast("tank-c", 0.99);
    expect(out.target.effects.some((e) => e.kind === "healBlock")).toBe(true);
  });

  it("Venom Surge applies an escalating 5-turn poison", () => {
    const out = cast("accelerator-a", 0.5);
    const poison = out.target.effects.find((e) => e.kind === "poison");
    expect(poison?.turnsLeft).toBe(5);
    expect(poison?.escalate).toBe(4);
  });

  it("Frozen Throne freezes, damages and shields in one cast", () => {
    const out = cast("chud-b", 0.99);
    expect(out.target.effects.some((e) => e.kind === "freeze")).toBe(true);
    expect(out.damageDealt).toBe(40);
    expect(out.caster.shield).toBe(20);
  });

  it("Steam Reactor buffs the next three attacks only", () => {
    const out = cast("accelerator-b", 0.5);
    const buff = out.caster.effects.find((e) => e.kind === "damageBuff");
    expect(buff?.usesLeft).toBe(3);
    expect(buff?.magnitude).toBe(12);
  });
});
