import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { Database } from "@/integrations/supabase/database";
import type {
  conceptMastery,
  courseBlocks,
  courseModules,
  courseProgress,
  courseProposals,
  dailyChallengeProgress,
  enrollments,
  userCourses,
} from "./courses";

/**
 * Same purpose and mechanism as battles.verify.ts and profile.verify.ts -
 * see battles.verify.ts for the full rationale. Narrowed column here:
 * `course_blocks.data` (jsonb), checked one-way for the same reason as
 * battles' question/question_records and profile's learner_profile.
 *
 * `course_progress.percent` is a generated column, so Drizzle's inferred
 * Insert/Update types exclude it entirely - its absence from both sides is
 * itself part of what this file proves; if a future edit to courses.ts
 * accidentally made it writable, `KeysMatch` would catch the mismatch
 * against Supabase's generated Insert type, which also omits it.
 *
 * Also same as the other two files: does not satisfy tsconfig.strict.json's
 * `exactOptionalPropertyTypes`, for the same inherent, non-defect reason.
 */
type KeysMatch<A, B> = [Exclude<keyof A, keyof B>, Exclude<keyof B, keyof A>] extends [never, never]
  ? true
  : false;
type Assert<T extends true> = T;

declare function assignableBothWays<A, B>(forward: (a: A) => B, backward: (b: B) => A): void;

type SupabaseTables = Database["public"]["Tables"];

// -- user_courses - no narrowed columns --------------------------------------
export type _userCoursesKeys = Assert<
  KeysMatch<InferSelectModel<typeof userCourses>, SupabaseTables["user_courses"]["Row"]>
>;
assignableBothWays<InferSelectModel<typeof userCourses>, SupabaseTables["user_courses"]["Row"]>(
  (a) => a,
  (b) => b,
);
export type _userCoursesInsertKeys = Assert<
  KeysMatch<InferInsertModel<typeof userCourses>, SupabaseTables["user_courses"]["Insert"]>
>;
assignableBothWays<InferInsertModel<typeof userCourses>, SupabaseTables["user_courses"]["Insert"]>(
  (a) => a,
  (b) => b,
);

// -- course_modules - no narrowed columns ------------------------------------
export type _courseModulesKeys = Assert<
  KeysMatch<InferSelectModel<typeof courseModules>, SupabaseTables["course_modules"]["Row"]>
>;
assignableBothWays<InferSelectModel<typeof courseModules>, SupabaseTables["course_modules"]["Row"]>(
  (a) => a,
  (b) => b,
);
export type _courseModulesInsertKeys = Assert<
  KeysMatch<InferInsertModel<typeof courseModules>, SupabaseTables["course_modules"]["Insert"]>
>;
assignableBothWays<
  InferInsertModel<typeof courseModules>,
  SupabaseTables["course_modules"]["Insert"]
>(
  (a) => a,
  (b) => b,
);

// -- course_blocks - data is a narrowed jsonb column -------------------------
export type _courseBlocksKeys = Assert<
  KeysMatch<InferSelectModel<typeof courseBlocks>, SupabaseTables["course_blocks"]["Row"]>
>;
assignableBothWays<
  Omit<InferSelectModel<typeof courseBlocks>, "data">,
  Omit<SupabaseTables["course_blocks"]["Row"], "data">
>(
  (a) => a,
  (b) => b,
);
// data's narrowed type has the same closed-shape-vs-open-index-signature gap
// documented in battles.verify.ts - not mechanically checked against Json.
export type _courseBlocksInsertKeys = Assert<
  KeysMatch<InferInsertModel<typeof courseBlocks>, SupabaseTables["course_blocks"]["Insert"]>
>;
assignableBothWays<
  Omit<InferInsertModel<typeof courseBlocks>, "data">,
  Omit<SupabaseTables["course_blocks"]["Insert"], "data">
>(
  (a) => a,
  (b) => b,
);

// -- course_proposals - no narrowed columns ----------------------------------
export type _courseProposalsKeys = Assert<
  KeysMatch<InferSelectModel<typeof courseProposals>, SupabaseTables["course_proposals"]["Row"]>
>;
assignableBothWays<
  InferSelectModel<typeof courseProposals>,
  SupabaseTables["course_proposals"]["Row"]
>(
  (a) => a,
  (b) => b,
);
export type _courseProposalsInsertKeys = Assert<
  KeysMatch<InferInsertModel<typeof courseProposals>, SupabaseTables["course_proposals"]["Insert"]>
>;
assignableBothWays<
  InferInsertModel<typeof courseProposals>,
  SupabaseTables["course_proposals"]["Insert"]
>(
  (a) => a,
  (b) => b,
);

// -- enrollments - no narrowed columns ---------------------------------------
export type _enrollmentsKeys = Assert<
  KeysMatch<InferSelectModel<typeof enrollments>, SupabaseTables["enrollments"]["Row"]>
>;
assignableBothWays<InferSelectModel<typeof enrollments>, SupabaseTables["enrollments"]["Row"]>(
  (a) => a,
  (b) => b,
);
export type _enrollmentsInsertKeys = Assert<
  KeysMatch<InferInsertModel<typeof enrollments>, SupabaseTables["enrollments"]["Insert"]>
>;
assignableBothWays<InferInsertModel<typeof enrollments>, SupabaseTables["enrollments"]["Insert"]>(
  (a) => a,
  (b) => b,
);

// -- course_progress - percent is a generated column, excluded on both sides -
export type _courseProgressKeys = Assert<
  KeysMatch<InferSelectModel<typeof courseProgress>, SupabaseTables["course_progress"]["Row"]>
>;
assignableBothWays<
  InferSelectModel<typeof courseProgress>,
  SupabaseTables["course_progress"]["Row"]
>(
  (a) => a,
  (b) => b,
);
export type _courseProgressInsertKeys = Assert<
  KeysMatch<InferInsertModel<typeof courseProgress>, SupabaseTables["course_progress"]["Insert"]>
>;
assignableBothWays<
  InferInsertModel<typeof courseProgress>,
  SupabaseTables["course_progress"]["Insert"]
>(
  (a) => a,
  (b) => b,
);

// -- concept_mastery - no narrowed columns -----------------------------------
export type _conceptMasteryKeys = Assert<
  KeysMatch<InferSelectModel<typeof conceptMastery>, SupabaseTables["concept_mastery"]["Row"]>
>;
assignableBothWays<
  InferSelectModel<typeof conceptMastery>,
  SupabaseTables["concept_mastery"]["Row"]
>(
  (a) => a,
  (b) => b,
);
export type _conceptMasteryInsertKeys = Assert<
  KeysMatch<InferInsertModel<typeof conceptMastery>, SupabaseTables["concept_mastery"]["Insert"]>
>;
assignableBothWays<
  InferInsertModel<typeof conceptMastery>,
  SupabaseTables["concept_mastery"]["Insert"]
>(
  (a) => a,
  (b) => b,
);

// -- daily_challenge_progress - no narrowed columns --------------------------
export type _dailyChallengeProgressKeys = Assert<
  KeysMatch<
    InferSelectModel<typeof dailyChallengeProgress>,
    SupabaseTables["daily_challenge_progress"]["Row"]
  >
>;
assignableBothWays<
  InferSelectModel<typeof dailyChallengeProgress>,
  SupabaseTables["daily_challenge_progress"]["Row"]
>(
  (a) => a,
  (b) => b,
);
export type _dailyChallengeProgressInsertKeys = Assert<
  KeysMatch<
    InferInsertModel<typeof dailyChallengeProgress>,
    SupabaseTables["daily_challenge_progress"]["Insert"]
  >
>;
assignableBothWays<
  InferInsertModel<typeof dailyChallengeProgress>,
  SupabaseTables["daily_challenge_progress"]["Insert"]
>(
  (a) => a,
  (b) => b,
);
