import { z } from "zod";

/**
 * Every number in this file is a game-balance knob someone might want to
 * retune without touching the functions that use it — the concrete
 * implementation of AGENTS.md's "Tuning" rule for the battles domain.
 *
 * Validating hardcoded constants with Zod looks redundant at first: nothing
 * external is being parsed. The value is the invariants TypeScript's static
 * types cannot express — "leagues are contiguous with no gaps", "a
 * difficulty range's min is at or below its max". A typo that breaks one of
 * those still compiles; `.parse()` at import time turns it into a loud
 * failure instead of a silent balance bug.
 */

// ── Damage formulas ─────────────────────────────────────────────────────────
// Used by src/components/battles/stat-mechanics.ts.

const damageTuningSchema = z.object({
  /** Charge multiplies base damage by this before other bonuses. */
  chargeMultiplier: z.number().positive(),
  accelerator: z
    .object({
      /** Damage at zero questions answered. */
      baseDamage: z.number().nonnegative(),
      /** Added on top of baseDamage, scaled by progress toward questionsToMaxScale. */
      damageRange: z.number().positive(),
      /** Per-hit multiplier step at zero questions answered. */
      stepBase: z.number().nonnegative(),
      /** Added on top of stepBase, scaled by progress toward questionsToMaxScale. */
      stepRange: z.number().positive(),
      /** Questions answered at which scaling reaches its maximum. */
      questionsToMaxScale: z.number().int().positive(),
    })
    .refine((a) => a.baseDamage + a.damageRange > a.baseDamage, "damageRange must be positive"),
  selfDamage: z
    .object({
      /** Self-damage multiplier at the reference (lowest-HP) archetype. */
      baseMultiplier: z.number().positive(),
      /** The maxHp value the formula is anchored to — this archetype takes baseMultiplier exactly. */
      referenceHp: z.number().positive(),
      /** HP above referenceHp divided by this before scaling down the multiplier. */
      hpDivisor: z.number().positive(),
      /** Maximum amount the multiplier can drop by, reached at hpDivisor + referenceHp HP and beyond. */
      hpMultiplierRange: z.number().positive(),
    })
    .refine(
      (s) => s.baseMultiplier - s.hpMultiplierRange >= 0,
      "a tanky enough archetype must not reach negative self-damage",
    ),
});

export type DamageTuning = z.infer<typeof damageTuningSchema>;

export const DAMAGE_TUNING: DamageTuning = damageTuningSchema.parse({
  chargeMultiplier: 1.8,
  accelerator: {
    baseDamage: 13,
    damageRange: 14,
    stepBase: 0.15,
    stepRange: 0.25,
    questionsToMaxScale: 10,
  },
  selfDamage: {
    baseMultiplier: 1.3,
    referenceHp: 75,
    hpDivisor: 175,
    hpMultiplierRange: 0.8,
  },
} satisfies DamageTuning);

// ── Bot accuracy ─────────────────────────────────────────────────────────────

const botAccuracySchema = z
  .object({
    /** Bot accuracy floor, reached at or above maxDiff. */
    min: z.number().min(0).max(1),
    /** Bot accuracy ceiling, at the easiest possible difficulty (diff 1). */
    max: z.number().min(0).max(1),
    /** Accuracy drops by up to this much between the easiest and hardest difficulty. */
    range: z.number().min(0).max(1),
    /** The width of the 1-10 difficulty scale used to normalise the drop-off. */
    difficultyScaleWidth: z.number().positive(),
  })
  .refine((a) => a.min < a.max, "min must be below max");

export type BotAccuracyTuning = z.infer<typeof botAccuracySchema>;

export const BOT_ACCURACY: BotAccuracyTuning = botAccuracySchema.parse({
  min: 0.42,
  max: 0.85,
  range: 0.38,
  difficultyScaleWidth: 9,
} satisfies BotAccuracyTuning);

// ── Question timers ──────────────────────────────────────────────────────────
// Re-exported from here by src/components/battles/questions.ts so existing
// imports keep working; this file is the source of truth.

const timerDurationsSchema = z
  .object({
    easy: z.number().positive(),
    medium: z.number().positive(),
    hard: z.number().positive(),
  })
  .refine(
    (t) => t.easy <= t.medium && t.medium <= t.hard,
    "harder questions must get at least as much time as easier ones",
  );

export type TimerDurations = z.infer<typeof timerDurationsSchema>;

export const TIMER_DURATIONS: TimerDurations = timerDurationsSchema.parse({
  easy: 10,
  medium: 12,
  hard: 15,
} satisfies TimerDurations);

// ── Competitive rating leagues ───────────────────────────────────────────────
// Used by src/lib/rating.ts. These are the *seasonal* rating standing —
// distinct from the Trophy Road's permanent XP tiers, but they deliberately
// share vocabulary and CSS color tokens (`--tr-<id>`) so the player reads one
// world across two axes. Floors double as the league gates referenced in
// docs/trophy-road-redesign.md.

export const ratingLeagueSchema = z
  .object({
    /** Matches the CSS color token `--tr-<id>` and the Trophy Road's TierId vocabulary. */
    id: z.enum(["bronze", "silver", "gold", "diamond", "platinum", "champion", "unreal"]),
    name: z.string().min(1),
    /** Lowest rating in this league, inclusive. */
    floor: z.number().nonnegative(),
    /** Floor of the next league, or null at the top. */
    ceiling: z.number().positive().nullable(),
  })
  .refine((l) => l.ceiling === null || l.ceiling > l.floor, "ceiling must be above floor");

export type RatingLeague = z.infer<typeof ratingLeagueSchema>;

const ratingLeaguesSchema = z
  .array(ratingLeagueSchema)
  .min(1)
  .refine((leagues) => leagues[0]?.floor === 0, "the lowest league must start at rating 0")
  .refine(
    (leagues) => leagues.filter((l) => l.ceiling === null).length === 1,
    "exactly one league (the top one) may have no ceiling",
  )
  .refine(
    (leagues) => leagues.every((l, i) => i === 0 || l.floor === leagues[i - 1]?.ceiling),
    "leagues must be contiguous — each floor must equal the previous league's ceiling",
  );

export const RATING_LEAGUES: RatingLeague[] = ratingLeaguesSchema.parse([
  { id: "bronze", name: "Bronze", floor: 0, ceiling: 1050 },
  { id: "silver", name: "Silver", floor: 1050, ceiling: 1200 },
  { id: "gold", name: "Gold", floor: 1200, ceiling: 1400 },
  { id: "diamond", name: "Diamond", floor: 1400, ceiling: 1600 },
  { id: "platinum", name: "Platinum", floor: 1600, ceiling: 1800 },
  { id: "champion", name: "Champion", floor: 1800, ceiling: 2000 },
  { id: "unreal", name: "Unreal", floor: 2000, ceiling: null },
] satisfies RatingLeague[]);

// ── Trophy Road chest rewards ────────────────────────────────────────────────
// Used by src/lib/xp-service.ts. Bonus XP used to be declared twice — once as
// a number (CHEST_BONUS_XP) and once baked into a display string
// (CHEST_REWARDS[x].reward, e.g. "+75 bonus XP") — two representations of the
// same fact that could silently drift apart. `reward` is now derived from
// `bonusXp`, so there is exactly one number to retune per chest.

const chestRewardSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  bonusXp: z.number().int().positive(),
});

export type ChestReward = z.infer<typeof chestRewardSchema> & { reward: string };

function chest(title: string, description: string, bonusXp: number): ChestReward {
  const parsed = chestRewardSchema.parse({ title, description, bonusXp });
  return { ...parsed, reward: `+${parsed.bonusXp} bonus XP` };
}

/** Two chests per tier, plus the God Cache and God Vault at the very top. */
export const CHEST_REWARDS: Record<string, ChestReward> = {
  "Bronze Chest": chest("🎁 Bronze Chest", "A starter pack of knowledge!", 75),
  "Bronze Cache": chest("🎁 Bronze Cache", "More loot from the forge.", 150),
  "Silver Chest": chest("🎁 Silver Chest", "Sharper tools for sharper minds.", 200),
  "Silver Cache": chest("🎁 Silver Cache", "A silvered stash of power.", 350),
  "Gold Chest": chest("🎁 Gold Chest", "Gleaming rewards await!", 450),
  "Gold Cache": chest("🎁 Gold Cache", "Riches for the worthy.", 600),
  "Diamond Chest": chest("🎁 Diamond Chest", "Crystalline power unleashed!", 800),
  "Diamond Cache": chest("🎁 Diamond Cache", "Facets of hidden potential.", 1000),
  "Platinum Chest": chest("🎁 Platinum Chest", "Elite-tier loot!", 1200),
  "Platinum Cache": chest("🎁 Platinum Cache", "The spoils of a rising elite.", 1500),
  "Champion Chest": chest("🎁 Champion Chest", "A champion's treasure trove!", 1800),
  "Champion Cache": chest("🎁 Champion Cache", "Hoarded glory from countless wins.", 2200),
  "Unreal Chest": chest("🎁 Unreal Chest", "Beyond mortal comprehension!", 2600),
  "Unreal Cache": chest("🎁 Unreal Cache", "Loot from beyond reality.", 3000),
  "God Cache": chest("🎁 God Cache", "Divine knowledge crystallized.", 4000),
  "God Vault": chest("🎁 God Vault", "The final vault. True mastery rewarded.", 5500),
};
