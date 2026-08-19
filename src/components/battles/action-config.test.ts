import { describe, expect, it } from "vitest";
import { ACTIONS, FOCUS_GAIN, displayDamage, getActionDesc } from "./action-config";
import { ARCHETYPES } from "./archetypes";
import { DAMAGE_TUNING } from "@/config/battle-tuning";
import type { ArchetypeId } from "./types";

/**
 * These strings are a promise. A player reads the number on a button and picks
 * a turn on the strength of it, so the only thing that really matters is that
 * the preview matches what the turn will actually do - which is why every
 * number here comes from `getEffectiveDamage` rather than from arithmetic
 * repeated at the call site.
 */

const ids = Object.keys(ARCHETYPES) as ArchetypeId[];

describe("the focus economy", () => {
  it("builds on Attack and Heal, and spends on Charge", () => {
    expect(FOCUS_GAIN.attack).toBeGreaterThan(0);
    expect(FOCUS_GAIN.defend).toBeGreaterThan(0);
    expect(FOCUS_GAIN.charge).toBe(0);
    expect(ACTIONS.charge.focusCost).toBeGreaterThan(0);
  });

  it("keeps Ultimate outside it, so the two payoff moves never compete", () => {
    // Ultimate spends its own charge meter, earned by answering correctly.
    expect(FOCUS_GAIN.ultimate).toBe(0);
    expect(ACTIONS.ultimate.focusCost).toBe(0);
  });

  it("lets a player who spends everything earn it back", () => {
    // A Charge that costs more than several turns of Attack could return would
    // be unusable rather than expensive.
    expect(ACTIONS.charge.focusCost).toBeLessThanOrEqual(FOCUS_GAIN.attack * 2);
  });
});

describe("displayDamage", () => {
  it("gives every archetype a number", () => {
    for (const id of ids) {
      expect(displayDamage(ARCHETYPES[id], 0), id).toMatch(/\d+/);
    }
  });

  it("climbs with correct answers only for the archetype that ramps", () => {
    for (const id of ids) {
      const arch = ARCHETYPES[id];
      if (arch.damageIsTimeScaled) continue; // shows a range, tested below
      const cold = displayDamage(arch, 0);
      const hot = displayDamage(arch, 8);
      if (arch.damageRamps) expect(hot, id).not.toBe(cold);
      else expect(hot, id).toBe(cold);
    }
  });

  it("marks the ramping archetype so the climb is legible", () => {
    const accelerator = ARCHETYPES.accelerator;
    expect(displayDamage(accelerator, 3)).toContain("^");
    expect(displayDamage(ARCHETYPES.tank, 3)).not.toContain("^");
  });

  it("stops climbing at the cap", () => {
    const arch = ARCHETYPES.accelerator;
    const { damagePerAnswer, damageCap } = DAMAGE_TUNING.accelerator;
    const atCap = Math.ceil(damageCap / damagePerAnswer);
    expect(displayDamage(arch, atCap)).toBe(displayDamage(arch, atCap * 5));
  });

  it("shows the Speedster a range, because the bonus depends on the answer", () => {
    // The question has not been asked yet, so there is no honest single number.
    const shown = displayDamage(ARCHETYPES.speedster, 0);
    expect(shown).toMatch(/^\d+-\d+ DMG$/);
    const [lo, hi] = shown.replace(" DMG", "").split("-").map(Number);
    expect(hi).toBeGreaterThan(lo ?? 0);
  });

  it("promises more for a Charge than for an Attack, for everyone", () => {
    for (const id of ids) {
      const arch = ARCHETYPES[id];
      const first = (text: string) => Number(/\d+/.exec(text)?.[0]);
      expect(first(displayDamage(arch, 4, "charge")), id).toBeGreaterThan(
        first(displayDamage(arch, 4, "attack")),
      );
    }
  });

  it("never previews a crit, so the button cannot change its mind", () => {
    // Called repeatedly: a crit roll would make this flicker.
    const arch = ARCHETYPES.chud;
    const shown = new Set(Array.from({ length: 50 }, () => displayDamage(arch, 2)));
    expect(shown.size).toBe(1);
  });
});

describe("getActionDesc", () => {
  it("describes every action for every archetype without an empty string", () => {
    for (const id of ids) {
      for (const action of ["attack", "defend", "charge"] as const) {
        expect(getActionDesc(action, ARCHETYPES[id], 0).length, `${id}/${action}`).toBeGreaterThan(
          0,
        );
      }
    }
  });

  it("says the Tank cannot heal rather than showing it a heal number", () => {
    expect(ARCHETYPES.tank.healAmount).toBeNull();
    expect(getActionDesc("defend", ARCHETYPES.tank, 0)).toContain("Can't heal");
  });

  it("says what is missing when no Ecliptar is equipped", () => {
    expect(getActionDesc("ultimate", ARCHETYPES.tank, 0)).toContain("No Ecliptar");
  });

  it("uses the equipped Ecliptar's own tag when there is one", () => {
    const desc = getActionDesc("ultimate", ARCHETYPES.tank, 0, {
      tag: "Shatter the line",
    } as Parameters<typeof getActionDesc>[3]);
    expect(desc).toBe("Shatter the line");
  });
});
