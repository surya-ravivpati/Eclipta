/**
 * The full schema, assembled from per-domain files. Add a new domain file
 * under src/db/schema/ and re-export it here as each vertical slice lands —
 * see AGENTS.md's "Database" and "Tuning" sections for the plan.
 *
 * Currently covers: battles (archetype mastery, solo/bot sessions, live
 * PvP, player ratings), profile (account XP/streaks, claimed Ecliptars,
 * claimed chests), and courses (community courses and content, enrollment
 * and progress, proposals, concept mastery, daily challenge). The remaining
 * ~28 tables are not yet modelled.
 */
export * from "./battles";
export * from "./profile";
export * from "./courses";
