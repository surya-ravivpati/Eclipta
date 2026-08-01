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

/**
 * There is deliberately **no streak damage multiplier** here. Momentum used to
 * compound on top of base damage, which ended matches in three or four turns;
 * it now feeds `streakScore` only. The durability knob that replaced the old
 * maxHp-derived self-damage curve is DEF, which lives per-archetype on the stat
 * sheet in battles/archetypes.ts — only the shared *formula* constants belong
 * in this file.
 */
export const damageTuningSchema = z.object({
  /** Charge multiplies base damage by this before other bonuses. */
  chargeMultiplier: z.number().positive(),
  /**
   * Crit chance is flat across the whole roster — archetypes differ in crit
   * *power* (`critBonus` on the stat sheet), not in how often they crit.
   */
  critChance: z.number().min(0).max(1),
  /** Ceiling on DEF, so no archetype or borrowed passive can reach immunity. */
  maxDefense: z.number().min(0).max(1),
  accelerator: z
    .object({
      /** Damage added per correct answer. */
      damagePerAnswer: z.number().positive(),
      /** Most damage the ramp can add, however long the match runs. */
      damageCap: z.number().positive(),
      /** Score bonus added per correct answer, as a fraction. */
      scorePerAnswer: z.number().positive(),
      /** Largest score bonus the ramp can reach, as a fraction. */
      scoreCap: z.number().positive(),
    })
    .refine((a) => a.damageCap >= a.damagePerAnswer, "the damage cap must allow at least one step")
    .refine((a) => a.scoreCap >= a.scorePerAnswer, "the score cap must allow at least one step"),
  /** Speedster: bonus damage at an instant answer, decaying to zero at the buzzer. */
  speedster: z.object({ maxSpeedBonus: z.number().positive() }),
  /** Apex: below the HP threshold, damage gains this fraction. */
  apex: z.object({
    rageHpThreshold: z.number().positive(),
    rageDamageBonus: z.number().positive(),
  }),
  /** Healer: absorb granted per Defend, and the most that can be banked. */
  healer: z
    .object({
      shieldPerHeal: z.number().positive(),
      shieldCap: z.number().positive(),
    })
    .refine((h) => h.shieldCap >= h.shieldPerHeal, "the shield cap must allow at least one heal"),
  /** God: correct answers per free heal, and how much it restores. */
  god: z.object({
    healInterval: z.number().int().positive(),
    healAmount: z.number().positive(),
  }),
  /** Fulcrum: the fraction of a borrowed passive's strength it receives. */
  fulcrum: z.object({ copyStrength: z.number().min(0).max(1) }),
  /**
   * Score-only streak bonus. This is where momentum pays out now — the reward
   * for a long chain is a bigger score, never a shorter match.
   */
  streakScore: z.object({
    stepPerHit: z.number().positive(),
    cap: z.number().positive(),
  }),
  /** Damage taken for a wrong answer or a timeout, before DEF. */
  missPenalty: z
    .object({
      min: z.number().positive(),
      max: z.number().positive(),
    })
    .refine((m) => m.max >= m.min, "max must be at or above min"),
});

export type DamageTuning = z.infer<typeof damageTuningSchema>;

export const DAMAGE_TUNING: DamageTuning = damageTuningSchema.parse({
  chargeMultiplier: 1.8,
  critChance: 0.1,
  maxDefense: 0.9,
  accelerator: {
    damagePerAnswer: 2,
    damageCap: 16,
    scorePerAnswer: 0.02,
    scoreCap: 0.35,
  },
  speedster: { maxSpeedBonus: 10 },
  apex: { rageHpThreshold: 35, rageDamageBonus: 0.3 },
  healer: { shieldPerHeal: 8, shieldCap: 24 },
  god: { healInterval: 3, healAmount: 15 },
  fulcrum: { copyStrength: 0.5 },
  streakScore: { stepPerHit: 0.05, cap: 1.0 },
  missPenalty: { min: 8, max: 17 },
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

// ── Ecliptar ultimates ───────────────────────────────────────────────────────
// The Ultimate action replaced Wild. Where Charge spends Focus, an ultimate
// spends its own charge meter, so the two payoff moves never compete for the
// same resource: Focus stays the short-term tempo currency and the ultimate is
// the long-term one, earned only by answering correctly.

const ultimateTuningSchema = z
  .object({
    /** Charge gained per correct answer, as a fraction of a full meter. */
    chargePerCorrectAnswer: z.number().positive().max(1),
    /** Charge remaining after casting — 0 means a full re-earn each time. */
    chargeAfterCast: z.number().min(0).max(1),
    /** Owner-turns before the same ultimate may be cast again. */
    cooldownTurns: z.number().int().nonnegative(),
    /** Floor on any timer an ultimate shortens, so a turn stays playable. */
    minTimerSeconds: z.number().int().positive(),
    /** Cap on the absorb pool an ultimate's shields can bank. */
    maxShield: z.number().int().positive(),
  })
  .refine((u) => u.chargeAfterCast < 1, "casting must consume some charge");

export type UltimateTuning = z.infer<typeof ultimateTuningSchema>;

export const ULTIMATE_TUNING: UltimateTuning = ultimateTuningSchema.parse({
  chargePerCorrectAnswer: 0.25,
  chargeAfterCast: 0,
  cooldownTurns: 2,
  minTimerSeconds: 5,
  maxShield: 80,
} satisfies UltimateTuning);

// ── Question timers ──────────────────────────────────────────────────────────
// There is no per-difficulty timer table any more. The clock is an absolute
// per-archetype stat (`timeSeconds`, e.g. Tank 25s / Healer 70s) on the stat
// sheet in battles/archetypes.ts, so the number on the sheet is the number the
// player sees. Only the floor is a shared formula constant: archetypes with a
// `timeSecondsRange` (Speedster) interpolate across the question tier, and no
// interpolation may drop the clock below something answerable.

const questionTimerSchema = z.object({
  /** No question may ever show less than this many seconds. */
  minSeconds: z.number().int().positive(),
});

export type QuestionTimerTuning = z.infer<typeof questionTimerSchema>;

export const QUESTION_TIMER: QuestionTimerTuning = questionTimerSchema.parse({
  minSeconds: 4,
} satisfies QuestionTimerTuning);

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
