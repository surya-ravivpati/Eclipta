import { describe, it, expect } from "vitest";
import {
  ECLIPTARS,
  ecliptarForArchetype,
  ecliptarSpriteUrl,
  getEcliptarBySlug,
  getEcliptarsByArchetype,
  nodeIdForArchetype,
} from "./ecliptars";
import { first } from "./test-helpers";

/**
 * Ecliptar slugs are a server claim contract - they appear in claim RPCs and in
 * battle_sessions rows - so uniqueness and stability are correctness, not
 * tidiness. The other property worth pinning is that `ecliptarForArchetype` is
 * deterministic: the same opponent has to bring the same creature every time,
 * or its sprite and its ultimate change between encounters and it stops reading
 * as one specific rival.
 */

describe("the roster", () => {
  it("has a unique slug for every Ecliptar", () => {
    const slugs = ECLIPTARS.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("gives every Ecliptar a name and an archetype", () => {
    for (const e of ECLIPTARS) {
      expect(e.name.length).toBeGreaterThan(0);
      expect(e.archetype.length).toBeGreaterThan(0);
    }
  });

  it("uses url-safe slugs, since they travel through RPC arguments", () => {
    for (const e of ECLIPTARS) expect(e.slug).toMatch(/^[a-z0-9-]+$/);
  });
});

describe("lookups", () => {
  it("finds an Ecliptar by its slug", () => {
    const e = first(ECLIPTARS);
    expect(getEcliptarBySlug(e.slug)?.slug).toBe(e.slug);
  });

  it("returns undefined for a slug that does not exist", () => {
    expect(getEcliptarBySlug("not-a-real-ecliptar")).toBeUndefined();
  });

  it("returns only members of the requested archetype", () => {
    const arch = first(ECLIPTARS).archetype;
    const pool = getEcliptarsByArchetype(arch);
    expect(pool.length).toBeGreaterThan(0);
    for (const e of pool) expect(e.archetype).toBe(arch);
  });

  it("partitions the roster - every Ecliptar belongs to exactly one pool", () => {
    const archetypes = new Set(ECLIPTARS.map((e) => e.archetype));
    const total = [...archetypes].reduce((n, a) => n + getEcliptarsByArchetype(a).length, 0);
    expect(total).toBe(ECLIPTARS.length);
  });
});

describe("ecliptarForArchetype", () => {
  const arch = first(ECLIPTARS).archetype;

  it("returns the same creature for the same key, every time", () => {
    const a = ecliptarForArchetype(arch, "opponent-42");
    const b = ecliptarForArchetype(arch, "opponent-42");
    expect(a?.slug).toBe(b?.slug);
    expect(a?.slug).toBeDefined();
  });

  it("always picks from the requested archetype's pool", () => {
    for (const key of ["a", "bb", "user-1", "3f9c2e", ""]) {
      const e = ecliptarForArchetype(arch, key);
      if (e) expect(e.archetype).toBe(arch);
    }
  });

  it("spreads different keys across the pool rather than always picking one", () => {
    const pool = getEcliptarsByArchetype(arch);
    if (pool.length < 2) return; // nothing to spread
    const picked = new Set(
      Array.from({ length: 60 }, (_, i) => ecliptarForArchetype(arch, `key-${i}`)?.slug),
    );
    expect(picked.size).toBeGreaterThan(1);
  });

  it("handles an empty key without throwing", () => {
    expect(() => ecliptarForArchetype(arch, "")).not.toThrow();
  });

  it("returns undefined for an archetype with no Ecliptars", () => {
    expect(
      ecliptarForArchetype("not-an-archetype" as Parameters<typeof ecliptarForArchetype>[0], "k"),
    ).toBeUndefined();
  });
});

describe("ecliptarSpriteUrl", () => {
  it("builds a path under the public sprite directory", () => {
    const e = first(ECLIPTARS);
    const url = ecliptarSpriteUrl(e.slug);
    expect(url).toContain(e.slug);
    expect(url).toMatch(/ecliptars/);
  });
});

describe("nodeIdForArchetype", () => {
  it("returns a number or null, never undefined", () => {
    const archetypes = new Set(ECLIPTARS.map((e) => e.archetype));
    for (const a of archetypes) {
      const id = nodeIdForArchetype(a);
      expect(id === null || typeof id === "number").toBe(true);
    }
  });
});
