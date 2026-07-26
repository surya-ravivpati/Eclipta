/**
 * The full schema, assembled from per-domain files. Add a new domain file
 * under src/db/schema/ and re-export it here as each vertical slice lands —
 * see AGENTS.md's "Database" and "Tuning" sections for the plan.
 *
 * Currently covers: battles (archetype mastery, solo/bot/ghost sessions,
 * live PvP, player ratings). The remaining ~39 tables are not yet modelled.
 */
export * from "./battles";
