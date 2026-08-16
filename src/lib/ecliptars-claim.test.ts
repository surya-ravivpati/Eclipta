import { describe, it, expect, vi, beforeEach } from "vitest";
import { at } from "./test-helpers";

/**
 * Claiming is the only place the roster meets the server, and it is what a
 * player experiences as "I opened the chest". Three properties matter:
 *
 *  - It is idempotent. A unique violation means the Ecliptar is already owned,
 *    which is a success from the player's point of view, not an error.
 *  - Nothing is ever granted twice. Owned slugs are filtered before any write.
 *  - A partial grant is still a win. If two Ecliptars are due and one write
 *    fails, the player keeps the one that landed and sees no error.
 *
 * The last one is easy to regress into "all or nothing", which would silently
 * cost a player a reward they already saw awarded.
 */

const rpc = vi.fn<(fn: string, args: unknown) => Promise<{ error: unknown }>>();
const getUser = vi.fn<() => Promise<{ data: { user: { id: string } | null } }>>();
let ownedRows: { ecliptar_slug: string }[] = [];

/** Minimal stand-in for the PostgREST builder: .select(...).eq(...) resolves. */
function selectChain() {
  const chain = {
    select: () => chain,
    eq: () => Promise.resolve({ data: ownedRows, error: null }),
  };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args: unknown) => rpc(fn, args),
    auth: { getUser: () => getUser() },
    from: () => selectChain(),
  },
}));

const {
  ECLIPTARS,
  claimArchetypeReward,
  claimEcliptarBySlug,
  claimEcliptarsBySlugs,
  fetchOwnedEcliptarSlugs,
  getEcliptarsByArchetype,
} = await import("./ecliptars");

const TANK_SLUGS = getEcliptarsByArchetype("tank").map((e) => e.slug);

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "me" } } });
  rpc.mockResolvedValue({ error: null });
  ownedRows = [];
});

describe("fetchOwnedEcliptarSlugs", () => {
  it("returns what the user owns", async () => {
    ownedRows = [{ ecliptar_slug: "tank-a" }, { ecliptar_slug: "healer-b" }];
    expect(await fetchOwnedEcliptarSlugs()).toEqual(new Set(["tank-a", "healer-b"]));
  });

  it("returns an empty set when signed out, without querying", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await fetchOwnedEcliptarSlugs()).toEqual(new Set());
  });
});

describe("claimEcliptarBySlug", () => {
  it("grants an unowned Ecliptar and returns it", async () => {
    const result = await claimEcliptarBySlug("tank-a", 12);
    expect(result?.slug).toBe("tank-a");
    expect(rpc).toHaveBeenCalledWith("claim_ecliptar", {
      p_slug: "tank-a",
      p_archetype: "tank",
      p_name: expect.any(String),
      p_node_id: 12,
    });
  });

  it("returns null for a slug that is not in the roster", async () => {
    expect(await claimEcliptarBySlug("not-a-real-slug", 1)).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns null when the user already owns it, without writing", async () => {
    ownedRows = [{ ecliptar_slug: "tank-a" }];
    expect(await claimEcliptarBySlug("tank-a", 12)).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns null when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await claimEcliptarBySlug("tank-a", 12)).toBeNull();
  });

  it("treats a duplicate-key violation as already granted", async () => {
    // Two clicks on one chest must not read as a failure.
    rpc.mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });
    const result = await claimEcliptarBySlug("tank-a", 12);
    expect(result?.slug).toBe("tank-a");
  });

  it("returns null on a real write failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    rpc.mockResolvedValue({ error: { code: "42501", message: "row level security" } });
    expect(await claimEcliptarBySlug("tank-a", 12)).toBeNull();
  });
});

describe("claimEcliptarsBySlugs", () => {
  it("grants every unowned slug in the set", async () => {
    const { granted, error } = await claimEcliptarsBySlugs(TANK_SLUGS.slice(0, 2), 12);
    expect(granted.map((e) => e.slug)).toEqual(TANK_SLUGS.slice(0, 2));
    expect(error).toBeNull();
  });

  it("skips the ones already owned", async () => {
    ownedRows = [{ ecliptar_slug: at(TANK_SLUGS, 0) }];
    const { granted } = await claimEcliptarsBySlugs(TANK_SLUGS.slice(0, 2), 12);
    expect(granted.map((e) => e.slug)).toEqual([at(TANK_SLUGS, 1)]);
  });

  it("explains why nothing was granted rather than failing silently", async () => {
    ownedRows = TANK_SLUGS.map((ecliptar_slug) => ({ ecliptar_slug }));
    expect(await claimEcliptarsBySlugs(TANK_SLUGS, 12)).toEqual({
      granted: [],
      error: "You already own this Ecliptar.",
    });

    expect(await claimEcliptarsBySlugs(["nonsense"], 12)).toEqual({
      granted: [],
      error: "This reward isn't available.",
    });
  });

  it("keeps a partial grant and reports no error", async () => {
    // One of two writes fails. The player saw both awarded; losing the one
    // that landed as well would be worse than the partial result.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    rpc
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValue({ error: { code: "42501", message: "denied" } });

    const { granted, error } = await claimEcliptarsBySlugs(TANK_SLUGS.slice(0, 2), 12);
    expect(granted).toHaveLength(1);
    expect(error).toBeNull();
  });

  it("reports the first error when nothing landed at all", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    rpc.mockResolvedValue({ error: { code: "42501", message: "denied" } });
    const { granted, error } = await claimEcliptarsBySlugs(TANK_SLUGS.slice(0, 2), 12);
    expect(granted).toEqual([]);
    expect(error).toBe("denied");
  });

  it("refuses politely when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await claimEcliptarsBySlugs(TANK_SLUGS, 12)).toEqual({
      granted: [],
      error: "You need to be signed in.",
    });
  });
});

describe("claimArchetypeReward", () => {
  it("grants the whole archetype's pool", async () => {
    const granted = await claimArchetypeReward("tank", 12);
    expect(granted.map((e) => e.slug).sort()).toEqual([...TANK_SLUGS].sort());
  });

  it("grants only what is missing", async () => {
    ownedRows = TANK_SLUGS.slice(0, 3).map((ecliptar_slug) => ({ ecliptar_slug }));
    const granted = await claimArchetypeReward("tank", 12);
    expect(granted.map((e) => e.slug)).toEqual([at(TANK_SLUGS, 3)]);
  });

  it("grants nothing when the pool is already complete", async () => {
    ownedRows = ECLIPTARS.map((e) => ({ ecliptar_slug: e.slug }));
    expect(await claimArchetypeReward("tank", 12)).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns nothing when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await claimArchetypeReward("tank", 12)).toEqual([]);
  });
});
