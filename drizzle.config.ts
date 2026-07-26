import { defineConfig } from "drizzle-kit";

/**
 * Drizzle's role in this project is narrower than usual: it defines the
 * schema and derives TypeScript types from it. It does not run migrations —
 * Supabase's CLI already owns that (supabase/migrations/*.sql), and those
 * files also carry Row Level Security policies, triggers, and Postgres
 * functions that Drizzle's schema DSL has no way to express. Two tools
 * writing migrations to the same database is exactly the kind of drift
 * AGENTS.md rules out.
 *
 * `dbCredentials.url` is only required for `drizzle-kit introspect` (pulling
 * the schema from a live database) or `drizzle-kit studio`. Day-to-day
 * type-checking and the app itself never read this file.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./src/db/drizzle-introspection",
  dbCredentials: {
    url: process.env["SUPABASE_DB_URL"] ?? "postgresql://placeholder/placeholder",
  },
});
