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
  awardXpRpc,
  claimChestRpc,
  getClaimedChestNodeIds,
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
  it("queries user_profiles filtered to the given user", async () => {
    const { select, eq } = mockSelectEq({ data: { username: "nova" }, error: null });

    await getUsername("u2");

    expect(supabase.from).toHaveBeenCalledWith("user_profiles");
    expect(select).toHaveBeenCalledWith("username");
    expect(eq).toHaveBeenCalledWith("user_id", "u2");
  });

  it("returns the username", async () => {
    mockSelectEq({ data: { username: "nova" }, error: null });
    await expect(getUsername("u2")).resolves.toBe("nova");
  });

  it("returns null for a user with no profile row, rather than throwing", async () => {
    mockSelectEq({ data: null, error: null });
    await expect(getUsername("new-user")).resolves.toBeNull();
  });

  it("returns null when username was never set, without conflating it with 'no row'", async () => {
    mockSelectEq({ data: { username: null }, error: null });
    await expect(getUsername("u2")).resolves.toBeNull();
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
