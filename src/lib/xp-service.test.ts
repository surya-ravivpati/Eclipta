import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getUser: vi.fn() } },
}));
vi.mock("@/repositories/profile", () => ({
  getUserXp: vi.fn(),
  awardXpRpc: vi.fn(),
  awardBattleXpRpc: vi.fn(),
  claimChestRpc: vi.fn(),
  getClaimedChestNodeIds: vi.fn(),
  adminGrantXpRpc: vi.fn(),
  adminSetXpRpc: vi.fn(),
}));
vi.mock("./milestones", () => ({
  checkMilestones: vi.fn().mockReturnValue({ toasts: [], lunaMessages: [] }),
  fireMilestoneToasts: vi.fn(),
  markExistingMilestones: vi.fn(),
}));

import { supabase } from "@/integrations/supabase/client";
import { awardXpRpc, awardBattleXpRpc, getUserXp } from "@/repositories/profile";
import { awardXp, awardBattleXp } from "./xp-service";

function mockSignedInAs(userId: string) {
  vi.mocked(supabase.auth.getUser).mockResolvedValue({
    data: { user: { id: userId } },
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("awardXp", () => {
  it("returns the server's authoritative new total on success", async () => {
    mockSignedInAs("u1");
    vi.mocked(getUserXp).mockResolvedValue(400);
    vi.mocked(awardXpRpc).mockResolvedValue(450);

    await expect(awardXp("lesson_complete")).resolves.toMatchObject({ newXp: 450 });
  });

  it("falls back to prevXp + fallbackAmount when the RPC fails, rather than crashing the caller", async () => {
    mockSignedInAs("u1");
    vi.mocked(getUserXp).mockResolvedValue(400);
    vi.mocked(awardXpRpc).mockRejectedValue(new Error("rate limited"));

    await expect(awardXp("lesson_complete", 25)).resolves.toMatchObject({ newXp: 425 });
  });

  it("does nothing for a signed-out caller", async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValue({ data: { user: null } } as never);

    await expect(awardXp("lesson_complete")).resolves.toEqual({ lunaMessages: [], newXp: 0 });
    expect(getUserXp).not.toHaveBeenCalled();
  });
});

describe("awardBattleXp", () => {
  it("falls back to the pre-battle XP when the RPC fails", async () => {
    mockSignedInAs("u1");
    vi.mocked(getUserXp).mockResolvedValue(600);
    vi.mocked(awardBattleXpRpc).mockRejectedValue(new Error("rate limited"));

    await expect(awardBattleXp(8, 10, true)).resolves.toMatchObject({ newXp: 600 });
  });
});
