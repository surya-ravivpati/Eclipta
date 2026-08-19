import { Heart, Sparkles, Swords, Zap } from "lucide-react";
import type { Action, ActionConfig, Archetype } from "./types";
import type { Ultimate } from "./ultimates";
import { getEffectiveDamage } from "./stat-mechanics";
import { DAMAGE_TUNING } from "@/config/battle-tuning";

/**
 * What each action button says, and what it promises.
 *
 * Split out of KnowledgeBattles.tsx. The numbers here are previews - what the
 * player is told before committing a turn - which is why nothing in this file
 * rolls a crit or reads the clock: a button that changed its mind between
 * renders would be lying about the trade it is offering.
 */
// Focus economy: Attack & Defend BUILD focus, Charge SPENDS it. Ultimate is
// deliberately outside that economy - it spends its own charge meter, earned
// only by answering correctly - so the two payoff moves never compete for the
// same resource and Charge keeps its role as the tempo play.
export const FOCUS_GAIN: Record<Action, number> = {
  attack: 15,
  defend: 10,
  charge: 0,
  ultimate: 0,
};

export const ACTIONS: Record<Action, ActionConfig> = {
  attack: { label: "Attack", icon: Swords, focusCost: 0, desc: "Your base DMG | +15 Focus" },
  defend: { label: "Heal", icon: Heart, focusCost: 0, desc: "Restore HP | +10 Focus" },
  charge: { label: "Charge", icon: Zap, focusCost: 25, desc: "1.8x your DMG | -25 Focus" },
  ultimate: {
    label: "Ultimate",
    icon: Sparkles,
    focusCost: 0,
    desc: "Your Ecliptar's signature move",
  },
};

/**
 * Action button descriptions, derived from the ACTIVE archetype's real stats
 * AND its signature identity - so Attack/Heal/Charge read differently for every
 * class. The +/- Focus is shown as a badge, so the text carries flavor instead.
 */
export const ATTACK_TAG: Record<string, string> = {
  speedster: "fast = harder",
  tank: "low, relentless",
  chud: "glass cannon",
  gambler: "rolled stats",
  healer: "soft hits",
  fulcrum: "borrowed passive",
  accelerator: "ramps each answer",
  god: "all maxed",
};
export const HEAL_TAG: Record<string, string> = {
  speedster: "quick patch",
  tank: "",
  chud: "risky pause",
  gambler: "rolled",
  healer: "+8 HP shield",
  fulcrum: "steady",
  accelerator: "scales up",
  god: "free every 3rd",
};
export const CHARGE_TAG: Record<string, string> = {
  speedster: "fast = harder",
  tank: "rare big hit",
  chud: "devastating",
  gambler: "rolled",
  healer: "burst heal-tank",
  fulcrum: "always an answer",
  accelerator: "ramps",
  god: "finisher",
};

/**
 * Base damage shown on the action buttons - live, so ramps read as they climb.
 *
 * The ramp is asked of `getEffectiveDamage` rather than recomputed here.
 * `allowCrit: false` is what that option was added for: a preview must not
 * roll a crit, or the button would flicker between two numbers and promise one
 * of them.
 *
 * The Speedster is the one case it cannot answer, because the bonus depends on
 * how fast the answer comes and the question has not been asked yet - so the
 * button shows the range instead of a number.
 */
export function displayDamage(
  arch: Archetype,
  correctCount: number,
  action: Action = "attack",
): string {
  if (arch.damageIsTimeScaled) {
    const floor = getEffectiveDamage(arch, { action, allowCrit: false }).damage;
    const ceiling = Math.floor(
      floor +
        DAMAGE_TUNING.speedster.maxSpeedBonus *
          (action === "charge" ? DAMAGE_TUNING.chargeMultiplier : 1),
    );
    return `${floor}-${ceiling} DMG`;
  }
  const { damage } = getEffectiveDamage(arch, { action, correctCount, allowCrit: false });
  return `${damage} DMG${arch.damageRamps ? " ^" : ""}`;
}

export function getActionDesc(
  action: Action,
  arch: Archetype,
  correctCount: number,
  ultimate?: Ultimate | null,
): string {
  const tag = (m: Record<string, string>) => (m[arch.id] ? ` | ${m[arch.id]}` : "");
  switch (action) {
    case "attack":
      return `${displayDamage(arch, correctCount)}${tag(ATTACK_TAG)}`;
    case "defend": {
      if (arch.healAmount === null) return "Can't heal | builds Focus"; // Tank
      return `+${arch.healAmount} HP${tag(HEAL_TAG)}`;
    }
    case "charge":
      // Asked as a charge rather than multiplying the digits of the attack
      // string, which rounded twice and could not see the cap it was scaling.
      return `${displayDamage(arch, correctCount, "charge")}${tag(CHARGE_TAG)}`;
    case "ultimate":
      return ultimate ? ultimate.tag : "No Ecliptar equipped";
  }
}
