import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { CourseBlockData } from "@/lib/course-blocks";

/**
 * Courses domain: community-authored courses and their content, enrollment
 * and progress tracking, course proposals, per-concept mastery, and the
 * daily challenge counter.
 *
 * Several `text` columns here (`user_courses.status`, `course_progress.status`
 * /`source`, `concept_mastery.state`, `course_blocks.type`) are documented in
 * their migrations as a fixed set of values, but - unlike
 * `pvp_battles.status` in battles.ts - have no actual Postgres CHECK
 * constraint enforcing it. They stay plain `text()` here rather than
 * `{ enum: [...] }`: narrowing would claim a database guarantee that does
 * not exist. The application is the only thing currently keeping them in
 * range.
 *
 * `user_id` columns reference `auth.users`, owned by Supabase Auth outside
 * this app's migrations - see the equivalent note in battles.ts.
 */

/**
 * A community-authored course. `status` is conventionally `draft |
 * published` (see caveat above).
 * Source: 20260429012818_eec5fb12-f785-4591-9cc6-44172ffbbdae.sql.
 */
export const userCourses = pgTable("user_courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull(),
  proposal_id: uuid("proposal_id"),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  summary: text("summary"),
  level: text("level").notNull().default("beginner"),
  structure: text("structure").notNull().default("linear"),
  depth: text("depth").notNull().default("standard"),
  cover_image_url: text("cover_image_url"),
  status: text("status").notNull().default("draft"),
  enrolled_count: integer("enrolled_count").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
});

/** One module within a course, ordered by `position`. Source: same migration as userCourses. */
export const courseModules = pgTable("course_modules", {
  id: uuid("id").primaryKey().defaultRandom(),
  course_id: uuid("course_id").notNull(),
  title: text("title").notNull().default("Untitled module"),
  position: integer("position").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
});

/**
 * A single content block within a module - text, a YouTube embed, an image,
 * or a quiz question. `type` is conventionally one of
 * `src/lib/course-blocks.ts`'s `COURSE_BLOCK_TYPES` (see caveat above: not
 * DB-enforced). `data`'s shape depends on `type`; narrowed to the same
 * `CourseBlockData` discriminated union the app already uses to read it.
 * Source: same migration as userCourses.
 */
export const courseBlocks = pgTable("course_blocks", {
  id: uuid("id").primaryKey().defaultRandom(),
  module_id: uuid("module_id").notNull(),
  type: text("type").notNull(),
  data: jsonb("data").$type<CourseBlockData>().notNull().default({}),
  position: integer("position").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
});

/**
 * A learner's request for a new AI-assisted course, reviewed before
 * becoming a published `user_courses` row. `status` is conventionally
 * `submitted | approved | denied` (see caveat above).
 * Source: 20260418024225_bcd74b9d-412e-448e-9bec-831170af536e.sql.
 */
export const courseProposals = pgTable("course_proposals", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull(),
  topic: text("topic").notNull(),
  description: text("description"),
  level: text("level").notNull(),
  structure: text("structure").notNull(),
  depth: text("depth").notNull(),
  weekly_hours: integer("weekly_hours").notNull().default(5),
  prerequisites: text("prerequisites"),
  creator_reasoning: text("creator_reasoning").notNull(),
  status: text("status").notNull().default("submitted"),
  course_id: uuid("course_id"),
  ai_feedback: text("ai_feedback"),
  ai_score: real("ai_score"),
  denial_reason: text("denial_reason"),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
});

/** The original enroll-only record - still written alongside course_progress; see that table's comment. */
export const enrollments = pgTable(
  "enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id").notNull(),
    course_slug: text("course_slug").notNull(),
    course_title: text("course_title").notNull(),
    enrolled_at: timestamp("enrolled_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique("enrollments_user_id_course_slug_key").on(table.user_id, table.course_slug)],
);

/**
 * Per-(user, course) progress - the substrate for Continue Learning, resume
 * points, and recommendation readiness. `percent` is a real Postgres
 * `GENERATED ALWAYS AS (...) STORED` column derived from
 * `lessons_done`/`lessons_total`; it can never be written directly, which is
 * exactly what `.generatedAlwaysAs()` encodes here - Drizzle excludes it
 * from the inferred Insert/Update types the same way the database rejects
 * writing it.
 * Source: 20260628140000_course-progress.sql.
 */
export const courseProgress = pgTable(
  "course_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id").notNull(),
    course_slug: text("course_slug").notNull(),
    course_title: text("course_title"),
    source: text("source").notNull().default("community"),
    status: text("status").notNull().default("enrolled"),
    lessons_total: integer("lessons_total").notNull().default(0),
    lessons_done: integer("lessons_done").notNull().default(0),
    current_block_id: text("current_block_id"),
    percent: integer("percent")
      .notNull()
      .generatedAlwaysAs(
        sql`CASE WHEN lessons_total > 0 THEN GREATEST(0, LEAST(100, round(100.0 * lessons_done / lessons_total)::int)) ELSE 0 END`,
      ),
    last_opened_at: timestamp("last_opened_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    completed_at: timestamp("completed_at", { withTimezone: true, mode: "string" }),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("course_progress_user_id_course_slug_key").on(table.user_id, table.course_slug),
  ],
);

/**
 * Per-(user, concept) mastery, fed by every answered battle question
 * (`battle_question_records`, modelled in battles.ts). `state` is
 * conventionally `struggling | developing | solid | mastered` (see caveat
 * above). Source: 20260628150000_concept-mastery.sql.
 */
export const conceptMastery = pgTable(
  "concept_mastery",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id").notNull(),
    concept: text("concept").notNull(),
    subject: text("subject").notNull().default("Mathematics"),
    state: text("state").notNull().default("developing"),
    confidence: real("confidence").notNull().default(0.3),
    evidence_count: integer("evidence_count").notNull().default(0),
    correct_count: integer("correct_count").notNull().default(0),
    last_seen: timestamp("last_seen", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    next_review: timestamp("next_review", { withTimezone: true, mode: "string" }),
  },
  (table) => [unique("concept_mastery_user_id_concept_key").on(table.user_id, table.concept)],
);

/**
 * One row per (user, UTC calendar day) tracking Battles wins
 * toward that day's bonus.
 * Source: 20260418024225_bcd74b9d-412e-448e-9bec-831170af536e.sql.
 */
export const dailyChallengeProgress = pgTable(
  "daily_challenge_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id").notNull(),
    challenge_date: date("challenge_date").notNull().defaultNow(),
    wins: integer("wins").notNull().default(0),
    bonus_claimed: boolean("bonus_claimed").notNull().default(false),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("daily_challenge_progress_user_id_challenge_date_key").on(
      table.user_id,
      table.challenge_date,
    ),
  ],
);
