import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { Database } from "@/integrations/supabase/database";
import type { userChestClaims, userEcliptars, userProfiles } from "./profile";

/**
 * Same purpose and mechanism as battles.verify.ts - see that file for the
 * full rationale. Narrowed columns here: `user_profiles.learner_profile`
 * (jsonb) and `user_profiles.preferred_pace` / `preferred_style` (CHECK-
 * constrained text), checked one-way for the same reason as battles' status
 * columns.
 *
 * Also same as battles.verify.ts: this file does not satisfy
 * tsconfig.strict.json's `exactOptionalPropertyTypes`, and is not expected
 * to - Drizzle's and Supabase's generator encode "optional" differently
 * (`field?: X | undefined` vs `field?: X`), which is inherent to comparing
 * two independently generated type systems, not a real defect.
 */
type KeysMatch<A, B> = [Exclude<keyof A, keyof B>, Exclude<keyof B, keyof A>] extends [never, never]
  ? true
  : false;
type Assert<T extends true> = T;

declare function assignableBothWays<A, B>(forward: (a: A) => B, backward: (b: B) => A): void;
declare function assignableOneWay<Narrow, Wide>(narrowToWide: (n: Narrow) => Wide): void;

type SupabaseTables = Database["public"]["Tables"];

// -- user_chest_claims - no narrowed columns --------------------------------
export type _userChestClaimsKeys = Assert<
  KeysMatch<InferSelectModel<typeof userChestClaims>, SupabaseTables["user_chest_claims"]["Row"]>
>;
assignableBothWays<
  InferSelectModel<typeof userChestClaims>,
  SupabaseTables["user_chest_claims"]["Row"]
>(
  (a) => a,
  (b) => b,
);
export type _userChestClaimsInsertKeys = Assert<
  KeysMatch<InferInsertModel<typeof userChestClaims>, SupabaseTables["user_chest_claims"]["Insert"]>
>;
assignableBothWays<
  InferInsertModel<typeof userChestClaims>,
  SupabaseTables["user_chest_claims"]["Insert"]
>(
  (a) => a,
  (b) => b,
);

// -- user_ecliptars - no narrowed columns ------------------------------------
export type _userEcliptarsKeys = Assert<
  KeysMatch<InferSelectModel<typeof userEcliptars>, SupabaseTables["user_ecliptars"]["Row"]>
>;
assignableBothWays<InferSelectModel<typeof userEcliptars>, SupabaseTables["user_ecliptars"]["Row"]>(
  (a) => a,
  (b) => b,
);
export type _userEcliptarsInsertKeys = Assert<
  KeysMatch<InferInsertModel<typeof userEcliptars>, SupabaseTables["user_ecliptars"]["Insert"]>
>;
assignableBothWays<
  InferInsertModel<typeof userEcliptars>,
  SupabaseTables["user_ecliptars"]["Insert"]
>(
  (a) => a,
  (b) => b,
);

// -- user_profiles - learner_profile (jsonb) and preferred_pace/style (enum) are narrowed --
const NARROWED_COLUMNS = ["learner_profile", "preferred_pace", "preferred_style"] as const;
type NarrowedColumn = (typeof NARROWED_COLUMNS)[number];

export type _userProfilesKeys = Assert<
  KeysMatch<InferSelectModel<typeof userProfiles>, SupabaseTables["user_profiles"]["Row"]>
>;
assignableBothWays<
  Omit<InferSelectModel<typeof userProfiles>, NarrowedColumn>,
  Omit<SupabaseTables["user_profiles"]["Row"], NarrowedColumn>
>(
  (a) => a,
  (b) => b,
);
assignableOneWay<
  InferSelectModel<typeof userProfiles>["preferred_pace"],
  SupabaseTables["user_profiles"]["Row"]["preferred_pace"]
>((n) => n);
assignableOneWay<
  InferSelectModel<typeof userProfiles>["preferred_style"],
  SupabaseTables["user_profiles"]["Row"]["preferred_style"]
>((n) => n);
// learner_profile's narrowed type has the same closed-shape-vs-open-index-
// signature gap documented in battles.verify.ts for question/question_records
// - not mechanically checked against Json for the same reason.

export type _userProfilesInsertKeys = Assert<
  KeysMatch<InferInsertModel<typeof userProfiles>, SupabaseTables["user_profiles"]["Insert"]>
>;
assignableBothWays<
  Omit<InferInsertModel<typeof userProfiles>, NarrowedColumn>,
  Omit<SupabaseTables["user_profiles"]["Insert"], NarrowedColumn>
>(
  (a) => a,
  (b) => b,
);
