import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

import { supabase } from "@/integrations/supabase/client";
import {
  adminGrantXpRpc,
  adminSetXpRpc,
  awardBattleXpRpc,
  awardVerifiedBattleXpRpc,
  awardXpRpc,
  claimChestRpc,
  claimRandomEcliptarRpc,
  countUnownedEcliptarsRpc,
  getClaimedChestNodeIds,
  getEcliptarClaimCountsByNode,
  setBirthDate,
  getOwnedEcliptarSlugs,
  getUsername,
  getUserXp,
} from "./profile";

function mockSelectEq(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi
    .fn()
    .mockReturnValue({ maybeSingle, then: (cb: (r: typeof result) => void) => cb(result) });
  const select = vi.fn().mockReturnValue({ eq });
  vi.mocked(supabase.from).mockReturnValue({ select } as never);
  return { select, eq, maybeSingle };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getUserXp", () => {
  it("queries user_profiles filtered to the given user", async () => {
    const { select, eq } = mockSelectEq({ data: { xp: 450 }, error: null });

    await getUserXp("u1");

    expect(supabase.from).toHaveBeenCalledWith("user_profiles");
    expect(select).toHaveBeenCalledWith("xp");
    expect(eq).toHaveBeenCalledWith("user_id", "u1");
  });

  it("returns the row's xp", async () => {
    mockSelectEq({ data: { xp: 450 }, error: null });
    await expect(getUserXp("u1")).resolves.toBe(450);
  });

  it("returns 0 for a user with no profile row yet, rather than throwing", async () => {
    mockSelectEq({ data: null, error: null });
    await expect(getUserXp("new-user")).resolves.toBe(0);
  });

  it("throws on a genuine database error", async () => {
    mockSelectEq({ data: null, error: { message: "connection reset" } });
    await expect(getUserXp("u1")).rejects.toThrow("connection reset");
  });
});

describe("getUsername", () => {
  // Goes through get_username_by_id (security-definer RPC), not a direct
  // user_profiles select - that table's SELECT policy is own-row-only, so a
  // direct query would silently return null for every user but the caller.
  it("calls get_username_by_id with the given user", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: "nova", error: null } as never);

    await getUsername("u2");

    expect(supabase.rpc).toHaveBeenCalledWith("get_username_by_id", { p_user_id: "u2" });
  });

  it("returns the username", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: "nova", error: null } as never);
    await expect(getUsername("u2")).resolves.toBe("nova");
  });

  it("returns null for a user with no profile row or no username set, rather than throwing", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never);
    await expect(getUsername("new-user")).resolves.toBeNull();
  });

  it("throws on a genuine database error", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { message: "connection reset" },
    } as never);
    await expect(getUsername("u2")).rejects.toThrow("connection reset");
  });
});

describe("getOwnedEcliptarSlugs", () => {
  it("queries user_ecliptars filtered to the given user", async () => {
    const eq = vi.fn().mockResolvedValue({ data: [{ ecliptar_slug: "nitpick" }], error: null });
    const select = vi.fn().mockReturnValue({ eq });
    vi.mocked(supabase.from).mockReturnValue({ select } as never);

    const slugs = await getOwnedEcliptarSlugs("u1");

    expect(supabase.from).toHaveBeenCalledWith("user_ecliptars");
    expect(select).toHaveBeenCalledWith("ecliptar_slug");
    expect(eq).toHaveBeenCalledWith("user_id", "u1");
    expect(slugs).toEqual(["nitpick"]);
  });

  it("returns an empty array rather than null when the user owns nothing", async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) } as never);

    await expect(getOwnedEcliptarSlugs("u1")).resolves.toEqual([]);
  });
});

describe("getClaimedChestNodeIds", () => {
  it("returns the set of claimed node ids", async () => {
    const eq = vi.fn().mockResolvedValue({ data: [{ node_id: 3 }, { node_id: 7 }], error: null });
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) } as never);

    await expect(getClaimedChestNodeIds("u1")).resolves.toEqual([3, 7]);
  });
});

describe("awardXpRpc", () => {
  it("calls award_xp with the event name and returns the new total", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 520, error: null } as never);

    await expect(awardXpRpc("lesson_complete")).resolves.toBe(520);
    expect(supabase.rpc).toHaveBeenCalledWith("award_xp", { p_event: "lesson_complete" });
  });

  it("throws on RPC failure rather than fabricating an XP total", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { message: "rate limited" },
    } as never);
    await expect(awardXpRpc("lesson_complete")).rejects.toThrow("rate limited");
  });
});

describe("awardBattleXpRpc", () => {
  it("calls award_battle_xp with the battle result", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 600, error: null } as never);

    await awardBattleXpRpc(8, 10, true);

    expect(supabase.rpc).toHaveBeenCalledWith("award_battle_xp", {
      p_correct: 8,
      p_total: 10,
      p_won: true,
    });
  });
});

describe("awardVerifiedBattleXpRpc", () => {
  it("passes only challenge IDs to the server-authoritative award function", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 645, error: null } as never);

    await expect(awardVerifiedBattleXpRpc(["challenge-1", "challenge-2"])).resolves.toBe(645);
    expect(supabase.rpc).toHaveBeenCalledWith("award_verified_battle_xp", {
      p_challenge_ids: ["challenge-1", "challenge-2"],
    });
  });
});

describe("claimChestRpc", () => {
  it("calls claim_chest with the node and label and returns the bonus awarded", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 450, error: null } as never);

    await expect(claimChestRpc(12, "Gold Chest")).resolves.toBe(450);
    expect(supabase.rpc).toHaveBeenCalledWith("claim_chest", {
      p_node_id: 12,
      p_chest_label: "Gold Chest",
    });
  });

  it("returns 0 rather than throwing when the chest was already claimed", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { message: "already claimed" },
    } as never);
    await expect(claimChestRpc(12, "Gold Chest")).resolves.toBe(0);
  });
});

describe("adminGrantXpRpc", () => {
  it("calls admin_grant_xp and returns the resulting total", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 1000, error: null } as never);

    await expect(adminGrantXpRpc("u1", 100)).resolves.toBe(1000);
    expect(supabase.rpc).toHaveBeenCalledWith("admin_grant_xp", { p_user_id: "u1", p_amount: 100 });
  });

  it("returns null on failure rather than throwing, matching the admin UI's error handling", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { message: "forbidden" },
    } as never);
    await expect(adminGrantXpRpc("u1", 100)).resolves.toBeNull();
  });
});

describe("adminSetXpRpc", () => {
  it("calls admin_set_xp and returns the resulting total", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 5000, error: null } as never);

    await expect(adminSetXpRpc("u1", 5000)).resolves.toBe(5000);
    expect(supabase.rpc).toHaveBeenCalledWith("admin_set_xp", { p_user_id: "u1", p_xp: 5000 });
  });
});

/**
 * The draw is the server's to make, so these check that this layer asks
 * correctly and reports faithfully - and, in particular, that it never invents
 * a result. A malformed response has to read as "nothing was granted" rather
 * than as a creature the player did not get, because the caller turns that
 * straight into a celebration toast.
 */
describe("claimRandomEcliptarRpc", () => {
  it("sends the archetype and the node, and nothing resembling a pick", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { granted: true, slug: "tank-c", remaining: 1 },
      error: null,
    } as never);

    await claimRandomEcliptarRpc("tank", 61);

    expect(supabase.rpc).toHaveBeenCalledWith("claim_random_ecliptar", {
      p_archetype: "tank",
      p_node_id: 61,
    });
  });

  it("reports what the server drew", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { granted: true, slug: "tank-c", remaining: 1 },
      error: null,
    } as never);

    expect(await claimRandomEcliptarRpc("tank", 61)).toEqual({
      granted: true,
      slug: "tank-c",
      remaining: 1,
    });
  });

  it("reports an exhausted pool without a slug", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { granted: false, reason: "none_left", remaining: 0 },
      error: null,
    } as never);

    expect(await claimRandomEcliptarRpc("tank", 61)).toEqual({
      granted: false,
      slug: null,
      remaining: 0,
    });
  });

  it("never invents a draw from a malformed response", async () => {
    for (const data of [null, {}, { granted: "yes" }, { granted: true, slug: 42 }]) {
      vi.mocked(supabase.rpc).mockResolvedValue({ data, error: null } as never);
      const result = await claimRandomEcliptarRpc("tank", 61);
      expect(result.slug, JSON.stringify(data)).toBeNull();
    }
  });

  it("throws when the call fails, so the caller can say so", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { message: "Invalid archetype" },
    } as never);

    await expect(claimRandomEcliptarRpc("nonsense", 61)).rejects.toThrow("Invalid archetype");
  });
});

describe("countUnownedEcliptarsRpc", () => {
  it("returns the count the server gave", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 3, error: null } as never);
    expect(await countUnownedEcliptarsRpc("healer")).toBe(3);
  });

  it("reads a non-numeric answer as none left", async () => {
    for (const data of [null, undefined, "3", {}]) {
      vi.mocked(supabase.rpc).mockResolvedValue({ data, error: null } as never);
      expect(await countUnownedEcliptarsRpc("healer"), JSON.stringify(data)).toBe(0);
    }
  });

  it("throws when the call fails", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { message: "denied" },
    } as never);
    await expect(countUnownedEcliptarsRpc("healer")).rejects.toThrow("denied");
  });
});

describe("getEcliptarClaimCountsByNode", () => {
  /** The node_id read is a plain select().eq(), resolved by awaiting the chain. */
  function mockNodeRows(result: { data: unknown; error: unknown }) {
    const eq = vi.fn().mockResolvedValue(result);
    const select = vi.fn().mockReturnValue({ eq });
    vi.mocked(supabase.from).mockReturnValue({ select } as never);
    return { select, eq };
  }

  it("counts a node once per Ecliptar it handed out", async () => {
    mockNodeRows({ data: [{ node_id: 2 }, { node_id: 2 }, { node_id: 61 }], error: null });

    expect(await getEcliptarClaimCountsByNode("u1")).toEqual(
      new Map([
        [2, 2],
        [61, 1],
      ]),
    );
  });

  it("reads only the caller's own claims", async () => {
    const { select, eq } = mockNodeRows({ data: [], error: null });

    await getEcliptarClaimCountsByNode("u1");

    expect(supabase.from).toHaveBeenCalledWith("user_ecliptars");
    expect(select).toHaveBeenCalledWith("node_id");
    expect(eq).toHaveBeenCalledWith("user_id", "u1");
  });

  it("is empty for someone who has claimed nothing", async () => {
    mockNodeRows({ data: [], error: null });
    expect(await getEcliptarClaimCountsByNode("u1")).toEqual(new Map());
  });

  it("throws when the read fails", async () => {
    mockNodeRows({ data: null, error: { message: "denied" } });
    await expect(getEcliptarClaimCountsByNode("u1")).rejects.toThrow("denied");
  });
});

/**
 * The refusal has to be the server's, and this side must not soften it. A
 * malformed or missing response means "not eligible", never "probably fine" -
 * getting that backwards would let an under-13 account through on a network
 * hiccup, which is the exact failure the gate exists to prevent.
 */
describe("setBirthDate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends the month and year, and nothing else", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true, already_set: false, meets_minimum: true },
      error: null,
    } as never);

    await setBirthDate(2005, 7);

    expect(supabase.rpc).toHaveBeenCalledWith("set_birth_date", {
      p_year: 2005,
      p_month: 7,
    });
    // No day is collected, so none may be sent.
    const [, args] = vi.mocked(supabase.rpc).mock.calls[0] as [string, Record<string, unknown>];
    expect(Object.keys(args).sort()).toEqual(["p_month", "p_year"]);
  });

  it("reports an accepted date", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true, already_set: false },
      error: null,
    } as never);
    expect(await setBirthDate(2005, 7)).toEqual({ ok: true, alreadySet: false });
  });

  it("reports a refusal without saying why to the caller", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: false, reason: "below_minimum_age" },
      error: null,
    } as never);
    expect(await setBirthDate(2020, 3)).toEqual({ ok: false, alreadySet: false });
  });

  it("reports a date already on file, because the routine is write-once", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true, already_set: true, meets_minimum: true },
      error: null,
    } as never);
    expect(await setBirthDate(1990, 1)).toEqual({ ok: true, alreadySet: true });
  });

  it("treats a malformed response as not eligible", async () => {
    // Failing closed. A truthy default here would let an account through on a
    // response nobody understood.
    for (const data of [null, {}, { ok: "yes" }, { ok: 1 }, []]) {
      vi.mocked(supabase.rpc).mockResolvedValue({ data, error: null } as never);
      expect((await setBirthDate(2005, 7)).ok, JSON.stringify(data)).toBe(false);
    }
  });

  it("throws when the call fails, rather than reporting a silent refusal", async () => {
    // The caller needs to tell these apart: refused is a message about age,
    // failed is a message about trying again.
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { message: "Invalid year" },
    } as never);
    await expect(setBirthDate(1800, 7)).rejects.toThrow("Invalid year");
  });
});
