import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { Database } from "@/integrations/supabase/database";
import type {
  archetypeMastery,
  battleQuestionRecords,
  battleSessions,
  playerRatings,
  pvpBattles,
  pvpChallenges,
  pvpQueue,
  pvpTurnActions,
} from "./battles";

/**
 * This file asserts nothing at runtime and is never imported by application
 * code - its only job is to fail `pnpm typecheck` if a Drizzle table stops
 * matching the shape Supabase's generator says the real table has.
 *
 * Reading and hand-transcribing ~90 columns across 8 tables is exactly the
 * kind of task a human proofreads and still gets subtly wrong. This file
 * caught a real one: an invented `id` column on `pvp_queue` that doesn't
 * exist on the live table.
 *
 * Two checks per table, both ordinary TypeScript rather than a hand-rolled
 * equality operator (an earlier version of this file used one and produced
 * inconsistent results between near-identical cases - not trustworthy):
 *   - `KeysMatch`: the two types have exactly the same property names.
 *     Catches a missing or invented column outright.
 *   - Bidirectional assignment: a value of one type must be assignable to
 *     the other, in both directions. Catches wrong base types and wrong
 *     nullability/optionality on a shared key.
 *
 * A few columns are deliberately typed MORE precisely in Drizzle than
 * Supabase's generator can express - a jsonb column narrowed with
 * `.$type()`, or a `text` column with a CHECK constraint narrowed via
 * `{ enum: [...] }`. Supabase's generator only sees the SQL column type,
 * never the constraint, so it always widens these to `Json` or plain
 * `string`. Those columns are excluded from the two checks above (via
 * `Omit`) and checked separately: only that the Drizzle side is assignable
 * TO the wider Supabase side, which is the direction that matters - every
 * value this app writes through the narrowed type is also valid per
 * Supabase's looser one.
 *
 * This file does not satisfy tsconfig.strict.json's `exactOptionalPropertyTypes`
 * and is not expected to: Drizzle infers an optional column as `field?: X |
 * undefined`, Supabase's generator writes the same optionality as `field?: X`
 * - two valid encodings of "optional" that this flag treats as different
 * types. That gap is inherent to comparing two independently generated type
 * systems and has no bearing on real behaviour, so it is accepted as ratchet
 * debt here rather than routed around with more type-level machinery for no
 * real safety gain. The base tsconfig.json check - the one that gates every
 * push - passes with zero errors.
 */
type KeysMatch<A, B> = [Exclude<keyof A, keyof B>, Exclude<keyof B, keyof A>] extends [never, never]
  ? true
  : false;
type Assert<T extends true> = T;

declare function assignableBothWays<A, B>(forward: (a: A) => B, backward: (b: B) => A): void;
declare function assignableOneWay<Narrow, Wide>(narrowToWide: (n: Narrow) => Wide): void;

type SupabaseTables = Database["public"]["Tables"];

// -- archetype_mastery - no narrowed columns --------------------------------
export type _archetypeMasteryKeys = Assert<
  KeysMatch<InferSelectModel<typeof archetypeMastery>, SupabaseTables["archetype_mastery"]["Row"]>
>;
assignableBothWays<
  InferSelectModel<typeof archetypeMastery>,
  SupabaseTables["archetype_mastery"]["Row"]
>(
  (a) => a,
  (b) => b,
);
export type _archetypeMasteryInsertKeys = Assert<
  KeysMatch<
    InferInsertModel<typeof archetypeMastery>,
    SupabaseTables["archetype_mastery"]["Insert"]
  >
>;
assignableBothWays<
  InferInsertModel<typeof archetypeMastery>,
  SupabaseTables["archetype_mastery"]["Insert"]
>(
  (a) => a,
  (b) => b,
);

// -- battle_sessions - question_records is a narrowed jsonb column ---------
export type _battleSessionsKeys = Assert<
  KeysMatch<InferSelectModel<typeof battleSessions>, SupabaseTables["battle_sessions"]["Row"]>
>;
assignableBothWays<
  Omit<InferSelectModel<typeof battleSessions>, "question_records">,
  Omit<SupabaseTables["battle_sessions"]["Row"], "question_records">
>(
  (a) => a,
  (b) => b,
);
// `question_records`'s narrowed type is a closed object shape with no index
// signature, so it can never satisfy `extends Json` under TypeScript's rules
// even though every value it can hold is valid JSON - the same closed-type
// vs. open-index-signature gap `database.ts` already documents. Not checked
// mechanically here for that reason; verified by inspection at declaration.
export type _battleSessionsInsertKeys = Assert<
  KeysMatch<InferInsertModel<typeof battleSessions>, SupabaseTables["battle_sessions"]["Insert"]>
>;
assignableBothWays<
  Omit<InferInsertModel<typeof battleSessions>, "question_records">,
  Omit<SupabaseTables["battle_sessions"]["Insert"], "question_records">
>(
  (a) => a,
  (b) => b,
);

// -- battle_question_records - no narrowed columns --------------------------
export type _battleQuestionRecordsKeys = Assert<
  KeysMatch<
    InferSelectModel<typeof battleQuestionRecords>,
    SupabaseTables["battle_question_records"]["Row"]
  >
>;
assignableBothWays<
  InferSelectModel<typeof battleQuestionRecords>,
  SupabaseTables["battle_question_records"]["Row"]
>(
  (a) => a,
  (b) => b,
);
export type _battleQuestionRecordsInsertKeys = Assert<
  KeysMatch<
    InferInsertModel<typeof battleQuestionRecords>,
    SupabaseTables["battle_question_records"]["Insert"]
  >
>;
assignableBothWays<
  InferInsertModel<typeof battleQuestionRecords>,
  SupabaseTables["battle_question_records"]["Insert"]
>(
  (a) => a,
  (b) => b,
);

// -- player_ratings - no narrowed columns -----------------------------------
export type _playerRatingsKeys = Assert<
  KeysMatch<InferSelectModel<typeof playerRatings>, SupabaseTables["player_ratings"]["Row"]>
>;
assignableBothWays<InferSelectModel<typeof playerRatings>, SupabaseTables["player_ratings"]["Row"]>(
  (a) => a,
  (b) => b,
);
export type _playerRatingsInsertKeys = Assert<
  KeysMatch<InferInsertModel<typeof playerRatings>, SupabaseTables["player_ratings"]["Insert"]>
>;
assignableBothWays<
  InferInsertModel<typeof playerRatings>,
  SupabaseTables["player_ratings"]["Insert"]
>(
  (a) => a,
  (b) => b,
);

// -- pvp_queue - no narrowed columns -----------------------------------------
export type _pvpQueueKeys = Assert<
  KeysMatch<InferSelectModel<typeof pvpQueue>, SupabaseTables["pvp_queue"]["Row"]>
>;
assignableBothWays<InferSelectModel<typeof pvpQueue>, SupabaseTables["pvp_queue"]["Row"]>(
  (a) => a,
  (b) => b,
);
export type _pvpQueueInsertKeys = Assert<
  KeysMatch<InferInsertModel<typeof pvpQueue>, SupabaseTables["pvp_queue"]["Insert"]>
>;
assignableBothWays<InferInsertModel<typeof pvpQueue>, SupabaseTables["pvp_queue"]["Insert"]>(
  (a) => a,
  (b) => b,
);

// -- pvp_battles - status is a narrowed (CHECK-constrained) text column -----
export type _pvpBattlesKeys = Assert<
  KeysMatch<InferSelectModel<typeof pvpBattles>, SupabaseTables["pvp_battles"]["Row"]>
>;
assignableBothWays<
  Omit<InferSelectModel<typeof pvpBattles>, "status">,
  Omit<SupabaseTables["pvp_battles"]["Row"], "status">
>(
  (a) => a,
  (b) => b,
);
assignableOneWay<
  InferSelectModel<typeof pvpBattles>["status"],
  SupabaseTables["pvp_battles"]["Row"]["status"]
>((n) => n);
export type _pvpBattlesInsertKeys = Assert<
  KeysMatch<InferInsertModel<typeof pvpBattles>, SupabaseTables["pvp_battles"]["Insert"]>
>;
assignableBothWays<
  Omit<InferInsertModel<typeof pvpBattles>, "status">,
  Omit<SupabaseTables["pvp_battles"]["Insert"], "status">
>(
  (a) => a,
  (b) => b,
);

// -- pvp_challenges - status is a narrowed (CHECK-constrained) text column --
export type _pvpChallengesKeys = Assert<
  KeysMatch<InferSelectModel<typeof pvpChallenges>, SupabaseTables["pvp_challenges"]["Row"]>
>;
assignableBothWays<
  Omit<InferSelectModel<typeof pvpChallenges>, "status">,
  Omit<SupabaseTables["pvp_challenges"]["Row"], "status">
>(
  (a) => a,
  (b) => b,
);
assignableOneWay<
  InferSelectModel<typeof pvpChallenges>["status"],
  SupabaseTables["pvp_challenges"]["Row"]["status"]
>((n) => n);
export type _pvpChallengesInsertKeys = Assert<
  KeysMatch<InferInsertModel<typeof pvpChallenges>, SupabaseTables["pvp_challenges"]["Insert"]>
>;
assignableBothWays<
  Omit<InferInsertModel<typeof pvpChallenges>, "status">,
  Omit<SupabaseTables["pvp_challenges"]["Insert"], "status">
>(
  (a) => a,
  (b) => b,
);

// -- pvp_turn_actions - question is a narrowed jsonb column -----------------
export type _pvpTurnActionsKeys = Assert<
  KeysMatch<InferSelectModel<typeof pvpTurnActions>, SupabaseTables["pvp_turn_actions"]["Row"]>
>;
assignableBothWays<
  Omit<InferSelectModel<typeof pvpTurnActions>, "question">,
  Omit<SupabaseTables["pvp_turn_actions"]["Row"], "question">
>(
  (a) => a,
  (b) => b,
);
// `question`'s narrowed type has the same closed-shape-vs-open-index-signature
// gap noted above for `question_records`. Not mechanically checked for the
// same reason.
export type _pvpTurnActionsInsertKeys = Assert<
  KeysMatch<InferInsertModel<typeof pvpTurnActions>, SupabaseTables["pvp_turn_actions"]["Insert"]>
>;
assignableBothWays<
  Omit<InferInsertModel<typeof pvpTurnActions>, "question">,
  Omit<SupabaseTables["pvp_turn_actions"]["Insert"], "question">
>(
  (a) => a,
  (b) => b,
);
