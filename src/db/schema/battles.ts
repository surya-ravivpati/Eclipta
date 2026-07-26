import {
  boolean,
  check,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Battles domain: solo/bot/ghost play, live PvP, and the mastery + rating
 * numbers that carry across matches.
 *
 * Column shapes are transcribed from src/integrations/supabase/types.ts,
 * which is generated from the live database and therefore reflects the
 * current state after every migration — not any single migration file.
 * Defaults and CHECK constraints (which the generator omits) are cross-
 * referenced against the migration that most recently touched each column;
 * see the comment above each table for its source.
 *
 * `user_id` / `challenger_id` / `opponent_id` / `actor_id` columns reference
 * `auth.users`, a table Supabase Auth owns and manages entirely outside this
 * app's migrations. It is intentionally not modelled here, so these columns
 * carry no `.references()` — Postgres still enforces the real foreign key;
 * Drizzle simply isn't the tool tracking it.
 */

/**
 * Per-archetype battle statistics for one user. Drives rank labels and the
 * class-select screen. Source: 20260510000002_archetype-mastery.sql.
 */
export const archetypeMastery = pgTable("archetype_mastery", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull(),
  archetype: text("archetype").notNull(),
  battles_played: integer("battles_played").notNull().default(0),
  wins: integer("wins").notNull().default(0),
  best_streak: integer("best_streak").notNull().default(0),
  total_correct: integer("total_correct").notNull().default(0),
  total_questions: integer("total_questions").notNull().default(0),
  /** Won with 100% accuracy. */
  perfect_battles: integer("perfect_battles").notNull().default(0),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
});

/** One completed battle's question-by-question record, as stored in `battle_sessions.question_records`. */
export interface StoredQuestionRecord {
  action: string;
  correct: boolean;
  timeSpent: number;
}

/**
 * A completed battle replay. Source data for Ghost PvP — a real player's
 * recorded session, matched to a new opponent when no live player is
 * available. Source: 20260510000006_pvp-architecture.sql.
 */
export const battleSessions = pgTable("battle_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull(),
  archetype: text("archetype").notNull(),
  won: boolean("won").notNull(),
  rating: integer("rating").notNull().default(1000),
  total_questions: integer("total_questions").notNull().default(0),
  correct_answers: integer("correct_answers").notNull().default(0),
  best_streak: integer("best_streak").notNull().default(0),
  question_records: jsonb("question_records").$type<StoredQuestionRecord[]>().notNull().default([]),
  /** Set once a Ghost or bot completion is folded into the player's rating; never revisited after. */
  rating_applied: boolean("rating_applied").notNull().default(false),
  rating_before: integer("rating_before"),
  rating_after: integer("rating_after"),
  rating_delta: integer("rating_delta"),
  opponent_type: text("opponent_type").notNull().default("bot"),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
});

/**
 * The evidence stream behind concept mastery: one row per question answered
 * in a battle, independent of which battle mode it happened in.
 * Source: 20260628150000_concept-mastery.sql.
 */
export const battleQuestionRecords = pgTable("battle_question_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull(),
  concept: text("concept").notNull(),
  subject: text("subject").notNull().default("Mathematics"),
  /** easy | medium | hard — see components/battles/types.ts's `Difficulty`. */
  difficulty: text("difficulty").notNull(),
  correct: boolean("correct").notNull(),
  time_spent: real("time_spent"),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
});

/** ELO-style competitive rating. Bots never affect it — only live and ghost matches do. */
export const playerRatings = pgTable("player_ratings", {
  user_id: uuid("user_id").primaryKey(),
  rating: integer("rating").notNull().default(1000),
  peak_rating: integer("peak_rating").notNull().default(1000),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
});

/**
 * Live matchmaking queue. A row exists for exactly as long as a player is
 * searching; matched or cancelled entries are deleted, not marked.
 *
 * `user_id` is the primary key — there is no separate `id` column. A later
 * redefinition (20260512182744_d8b0b2a1-9fd5-4c4e-8c5e-4434629dd38e.sql)
 * replaced the original 20260510000006_pvp-architecture.sql shape, which did
 * have one; that surrogate key is not part of the live schema.
 */
export const pvpQueue = pgTable("pvp_queue", {
  user_id: uuid("user_id").primaryKey(),
  username: text("username"),
  archetype: text("archetype").notNull(),
  rating: integer("rating").notNull().default(1000),
  queued_at: timestamp("queued_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

/**
 * A live PvP match. Both players subscribe to a Realtime channel named
 * `pvp-battle:{id}` to exchange turn results.
 *
 * `status`'s allowed values were originally `active|complete|abandoned`;
 * 20260516150706_pvp-status-leaderboard-rematch-fix.sql replaced the
 * constraint with the current spelling, `completed` — this schema reflects
 * that final state, not the original migration.
 */
export const pvpBattles = pgTable(
  "pvp_battles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    challenger_id: uuid("challenger_id").notNull(),
    opponent_id: uuid("opponent_id").notNull(),
    challenger_archetype: text("challenger_archetype").notNull(),
    opponent_archetype: text("opponent_archetype").notNull(),
    status: text("status", { enum: ["active", "completed", "abandoned"] })
      .notNull()
      .default("active"),
    winner_id: uuid("winner_id"),
    ratings_applied: boolean("ratings_applied").notNull().default(false),
    challenger_rating_before: integer("challenger_rating_before"),
    opponent_rating_before: integer("opponent_rating_before"),
    challenger_rating_after: integer("challenger_rating_after"),
    opponent_rating_after: integer("opponent_rating_after"),
    /** Populated once a player asks for a rematch; a second uid confirms it. */
    rematch_requested_by: uuid("rematch_requested_by").array().notNull().default([]),
    rematch_battle_id: uuid("rematch_battle_id"),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    completed_at: timestamp("completed_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    check(
      "pvp_battles_challenger_ne_opponent",
      sql`${table.challenger_id} <> ${table.opponent_id}`,
    ),
  ],
);

/**
 * A direct challenge from one player to another, before a match exists.
 * Source: 20260513124913_79fef0ca-8f7c-4ab3-aaee-56e5c7f70523.sql.
 */
export const pvpChallenges = pgTable(
  "pvp_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    challenger_id: uuid("challenger_id").notNull(),
    challenged_id: uuid("challenged_id").notNull(),
    challenger_archetype: text("challenger_archetype").notNull(),
    status: text("status", {
      enum: ["pending", "accepted", "rejected", "expired", "cancelled"],
    })
      .notNull()
      .default("pending"),
    battle_id: uuid("battle_id"),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    expires_at: timestamp("expires_at", { withTimezone: true, mode: "string" })
      .notNull()
      .default(sql`(now() + interval '5 minutes')`),
  },
  (table) => [
    check(
      "pvp_challenges_challenger_ne_challenged",
      sql`${table.challenger_id} <> ${table.challenged_id}`,
    ),
  ],
);

/** The payload of one turn's question, as submitted to `submit_pvp_turn_action`. */
export interface StoredTurnQuestion {
  q: string;
  difficulty: string;
  topic: string;
}

/**
 * One player's locked-in action for one turn of a live battle. The RPC
 * `get_pvp_turn_resolution` reads both players' rows for a turn to resolve
 * it once both are present. Source:
 * 20260515002226_4246b7d5-17be-4c5a-aa37-16cebf33223e.sql.
 */
export const pvpTurnActions = pgTable("pvp_turn_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  battle_id: uuid("battle_id").notNull(),
  turn_number: integer("turn_number").notNull(),
  actor_id: uuid("actor_id").notNull(),
  action: text("action").notNull(),
  correct: boolean("correct").notNull(),
  damage: integer("damage").notNull().default(0),
  self_damage: integer("self_damage").notNull().default(0),
  heal: integer("heal").notNull().default(0),
  focus_delta: integer("focus_delta").notNull().default(0),
  momentum: integer("momentum").notNull().default(0),
  time_spent: real("time_spent").notNull().default(0),
  question: jsonb("question")
    .$type<StoredTurnQuestion>()
    .notNull()
    .default({ q: "", difficulty: "", topic: "" }),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
});
