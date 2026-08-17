import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ECLIPTARS } from "./ecliptars";
import { need } from "./test-helpers";

/**
 * The roster now exists twice: once in TypeScript, and once as a seeded table
 * in 20260816000000_random-ecliptar-rolls.sql, because the server has to own
 * the roll to stop a player re-rolling it.
 *
 * Two copies of the same list is a standing invitation to drift, and drift
 * here is silent in the worst way: an Ecliptar added only to the TypeScript
 * side can never be rolled, and one added only to the catalog is granted with
 * a slug the UI cannot resolve to a name or a sprite. This test is the seam
 * that makes that a failing suite instead of a mystery.
 *
 * It parses the migration rather than querying a database on purpose - it has
 * to run in the unit suite, with no network and no local Postgres.
 */

const MIGRATION = join(
  import.meta.dirname,
  "../../supabase/migrations/20260816000000_random-ecliptar-rolls.sql",
);

interface CatalogRow {
  slug: string;
  archetype: string;
  name: string;
  rollable: boolean;
}

/** Pull the seeded rows out of the migration's INSERT ... VALUES block. */
function readCatalog(): CatalogRow[] {
  const sql = readFileSync(MIGRATION, "utf8");
  const block = /INSERT INTO public\.ecliptar_catalog[^;]*?VALUES([\s\S]*?)ON CONFLICT/.exec(sql);
  if (!block?.[1]) throw new Error("could not find the catalog seed in the migration");

  const rows: CatalogRow[] = [];
  const row =
    /\(\s*'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'\s*,\s*(true|false)\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = row.exec(block[1])) !== null) {
    rows.push({
      slug: need(match[1], "slug"),
      archetype: need(match[2], "archetype"),
      // SQL escapes a quote by doubling it: 'Mr. O''Hara'.
      name: need(match[3], "name").replace(/''/g, "'"),
      rollable: match[4] === "true",
    });
  }
  return rows;
}

const catalog = readCatalog();

describe("the seeded catalog", () => {
  it("parsed at all", () => {
    expect(catalog.length).toBeGreaterThan(0);
  });

  it("has no duplicate slugs", () => {
    expect(new Set(catalog.map((r) => r.slug)).size).toBe(catalog.length);
  });

  it("only holds slugs claim_ecliptar's shape check would accept", () => {
    // The older per-slug claim path validates by shape. A catalog entry it
    // would reject is one the two claim routes disagree about.
    const shaped = /^[a-z]+-[a-d]$/;
    const named = new Set(["newton", "ecliptadon", "einsteinium", "temporobys"]);
    for (const row of catalog) {
      expect(shaped.test(row.slug) || named.has(row.slug), `${row.slug} is unclaimable`).toBe(true);
    }
  });
});

describe("catalog against the TypeScript roster", () => {
  it("holds exactly the same slugs", () => {
    expect(catalog.map((r) => r.slug).sort()).toEqual(ECLIPTARS.map((e) => e.slug).sort());
  });

  it("agrees on every name", () => {
    // A mismatch means the player is granted a creature whose stored name is
    // not the one the UI shows them.
    for (const row of catalog) {
      const ecliptar = ECLIPTARS.find((e) => e.slug === row.slug);
      expect(ecliptar?.name, `${row.slug} name differs`).toBe(row.name);
    }
  });

  it("agrees on every archetype", () => {
    // The roll selects on this column, so a wrong archetype makes a creature
    // unreachable from its own node.
    for (const row of catalog) {
      const ecliptar = ECLIPTARS.find((e) => e.slug === row.slug);
      expect(ecliptar?.archetype, `${row.slug} archetype differs`).toBe(row.archetype);
    }
  });

  it("agrees on which Ecliptars a draw may produce", () => {
    // The server enforces this column; the client uses its copy to decide
    // whether a node still has a draw to offer. If they disagree, the road
    // shows a button that cannot produce anything - or hides one that could.
    for (const row of catalog) {
      const ecliptar = ECLIPTARS.find((e) => e.slug === row.slug);
      expect(ecliptar?.rollable, `${row.slug} rollable differs`).toBe(row.rollable);
    }
  });

  it("keeps the two final bosses out of the draw pool", () => {
    // Newton and Ecliptadon end the road. Rolling them out of the god pool
    // partway up it would hand a player the ending early.
    for (const slug of ["newton", "ecliptadon"]) {
      expect(catalog.find((r) => r.slug === slug)?.rollable, `${slug} is rollable`).toBe(false);
      expect(ECLIPTARS.find((e) => e.slug === slug)?.rollable).toBe(false);
    }
  });

  it("gives every archetype something to roll", () => {
    const byArchetype = new Map<string, number>();
    for (const row of catalog) {
      if (!row.rollable) continue;
      byArchetype.set(row.archetype, (byArchetype.get(row.archetype) ?? 0) + 1);
    }
    for (const ecliptar of ECLIPTARS) {
      expect(
        byArchetype.get(ecliptar.archetype) ?? 0,
        `${ecliptar.archetype} has an empty pool`,
      ).toBeGreaterThan(0);
    }
  });
});
