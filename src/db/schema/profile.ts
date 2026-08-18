import {
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { LearningProfile } from "@/lib/luna-calibration";

/**
 * Profile domain: the account-wide XP/streak record, claimed Ecliptar
 * collectibles, and claimed Trophy Road chests.
 *
 * Column shapes are transcribed from src/integrations/supabase/types.ts (the
 * current-state snapshot), same discipline as src/db/schema/battles.ts.
 * `user_profiles` in particular has grown across 15 separate migrations -
 * defaults below are traced to the migration that added each column, but
 * given the size (31 columns), this was not re-verified line-by-line against
 * every later migration the way the smaller battles tables were. The
 * verification harness (profile.verify.ts) is what actually proves column
 * presence and nullability match the live schema; treat the literal default
 * *values* here as best-effort documentation rather than independently
 * re-derived fact.
 *
 * `user_id` references `auth.users`, owned by Supabase Auth outside this
 * app's migrations - see the equivalent note in battles.ts for why it
 * carries no `.references()` here.
 */

/**
 * Claimed Trophy Road chests. One row per chest a player has opened - the
 * unique (user_id, node_id) constraint is what makes claiming idempotent.
 * Source: 20260505153236_f0a91365-5b15-4ecc-91f5-cb4868750ccb.sql.
 */
export const userChestClaims = pgTable("user_chest_claims", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull(),
  node_id: integer("node_id").notNull(),
  chest_label: text("chest_label").notNull(),
  bonus_xp: integer("bonus_xp").notNull().default(0),
  claimed_at: timestamp("claimed_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
});

/**
 * Claimed Ecliptar collectibles. The unique (user_id, ecliptar_slug)
 * constraint makes claiming idempotent - a player can't own the same
 * creature twice. Source: 20260622000000_ecliptar-claim-resilient.sql,
 * which superseded the original 20260416182626 definition (same shape).
 */
export const userEcliptars = pgTable("user_ecliptars", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull(),
  archetype: text("archetype").notNull(),
  ecliptar_slug: text("ecliptar_slug").notNull(),
  ecliptar_name: text("ecliptar_name").notNull(),
  node_id: integer("node_id").notNull(),
  claimed_at: timestamp("claimed_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
});

/**
 * The account-wide profile: identity fields, lifetime XP, the legacy
 * per-battle streak (`current_streak`/`best_streak`), the newer calendar-based
 * daily practice streak (`daily_streak`/`longest_daily_streak`/
 * `streak_freezes`/`practice_dates`/`last_practice_date`), and Luna's saved
 * learner state. Two streak systems coexist because they measure different
 * things - one battle-to-battle, one calendar-day-to-calendar-day - not
 * because one replaced the other.
 * Source: 20260416042235_ac21bb32-ff8b-4e13-afdd-560d101c0265.sql (original),
 * plus 14 later migrations adding individual columns - see git blame on this
 * file's predecessor comments for which migration added which column if the
 * exact origin ever matters again.
 */
export const userProfiles = pgTable("user_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull().unique(),
  username: text("username").unique(),
  avatar_url: text("avatar_url"),
  bio: text("bio"),
  /**
   * Renamed by 20260817010000. Written once by the old onboarding step and read
   * nowhere; kept so existing answers are not destroyed. Superseded by
   * birth_year/birth_month. Do not use.
   */
  legacy_self_reported_age: integer("legacy_self_reported_age"),
  /** Set once, only through the set_birth_date routine. No day is collected. */
  birth_year: smallint("birth_year"),
  birth_month: smallint("birth_month"),
  learning_goal: text("learning_goal"),
  weekly_hours: integer("weekly_hours"),

  preferred_pace: text("preferred_pace", { enum: ["slow", "normal", "fast"] })
    .notNull()
    .default("normal"),
  preferred_style: text("preferred_style", { enum: ["theory", "practice", "mixed"] })
    .notNull()
    .default("mixed"),

  avg_completion_time: numeric("avg_completion_time", { mode: "number" }).default(0),
  total_sessions: integer("total_sessions").notNull().default(0),
  total_questions: integer("total_questions").notNull().default(0),
  total_correct: integer("total_correct").notNull().default(0),
  weak_areas: text("weak_areas").array().default([]),
  strong_areas: text("strong_areas").array().default([]),

  /** Legacy per-battle win/loss streak - distinct from the daily practice streak below. */
  current_streak: integer("current_streak").notNull().default(0),
  best_streak: integer("best_streak").notNull().default(0),
  xp: integer("xp").notNull().default(0),
  equipped_ecliptar: text("equipped_ecliptar"),
  /** BCP 47 tag; NULL means auto-detect from the browser. See src/i18n/locales.ts. */
  preferred_language: text("preferred_language"),

  onboarded_at: timestamp("onboarded_at", { withTimezone: true, mode: "string" }),
  luna_notes: text("luna_notes"),
  /** Distinct from luna_notes: notes Luna wrote itself vs. notes a human moderator added. */
  luna_auto_notes: text("luna_auto_notes"),
  learner_profile: jsonb("learner_profile").$type<LearningProfile>(),

  last_practice_date: date("last_practice_date"),
  daily_streak: integer("daily_streak").notNull().default(0),
  longest_daily_streak: integer("longest_daily_streak").notNull().default(0),
  streak_freezes: integer("streak_freezes").notNull().default(2),
  practice_dates: date("practice_dates").array().notNull().default([]),

  created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
});
