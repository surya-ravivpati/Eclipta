import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

import { supabase } from "@/integrations/supabase/client";
import {
  enqueuePvpRpc,
  findActivePvpBattleForUser,
  findPvpMatchRpc,
  getGhostSessionRpc,
  leavePvpQueue,
  recordBattleSessionRpc,
  type RecordBattleSessionPayload,
} from "./battles";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("enqueuePvpRpc", () => {
  it("calls enqueue_pvp with the archetype", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: undefined, error: null } as never);

    await enqueuePvpRpc("speedster");

    expect(supabase.rpc).toHaveBeenCalledWith("enqueue_pvp", { p_archetype: "speedster" });
  });
});

describe("leavePvpQueue", () => {
  it("deletes the caller's own queue row", async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: null });
    const del = vi.fn().mockReturnValue({ eq });
    vi.mocked(supabase.from).mockReturnValue({ delete: del } as never);

    await leavePvpQueue("u1");

    expect(supabase.from).toHaveBeenCalledWith("pvp_queue");
    expect(eq).toHaveBeenCalledWith("user_id", "u1");
  });
});

describe("findPvpMatchRpc", () => {
  it("calls find_pvp_match with archetype and rating", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: { matched: false }, error: null } as never);

    await findPvpMatchRpc("tank", 1200);

    expect(supabase.rpc).toHaveBeenCalledWith("find_pvp_match", {
      p_archetype: "tank",
      p_rating: 1200,
    });
  });

  it("returns the matched result on success", async () => {
    const matched = {
      matched: true,
      battle_id: "b1",
      opponent_user_id: "u2",
      opponent_username: "rival",
      opponent_archetype: "tank",
      opponent_rating: 1100,
    };
    vi.mocked(supabase.rpc).mockResolvedValue({ data: matched, error: null } as never);

    await expect(findPvpMatchRpc("tank", 1200)).resolves.toEqual(matched);
  });

  it("throws on RPC failure", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: "boom" } } as never);
    await expect(findPvpMatchRpc("tank", 1200)).rejects.toThrow("boom");
  });
});

describe("findActivePvpBattleForUser", () => {
  it("queries pvp_battles for either side of the match, most recent first", async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const order = vi.fn().mockReturnValue({ limit });
    const gte = vi.fn().mockReturnValue({ order });
    const eq = vi.fn().mockReturnValue({ gte });
    const or = vi.fn().mockReturnValue({ eq });
    const select = vi.fn().mockReturnValue({ or });
    vi.mocked(supabase.from).mockReturnValue({ select } as never);

    await findActivePvpBattleForUser("u1");

    expect(supabase.from).toHaveBeenCalledWith("pvp_battles");
    expect(or).toHaveBeenCalledWith("challenger_id.eq.u1,opponent_id.eq.u1");
    expect(eq).toHaveBeenCalledWith("status", "active");
  });

  it("returns null when no active battle is found", async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        or: vi.fn().mockReturnValue({
          eq: vi
            .fn()
            .mockReturnValue({
              gte: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit }) }),
            }),
        }),
      }),
    } as never);

    await expect(findActivePvpBattleForUser("u1")).resolves.toBeNull();
  });

  it("returns the most recent battle row when one exists", async () => {
    const row = {
      id: "b1",
      challenger_id: "u1",
      opponent_id: "u2",
      challenger_archetype: "tank",
      opponent_archetype: "speedster",
      status: "active" as const,
    };
    const limit = vi.fn().mockResolvedValue({ data: [row], error: null });
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        or: vi.fn().mockReturnValue({
          eq: vi
            .fn()
            .mockReturnValue({
              gte: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit }) }),
            }),
        }),
      }),
    } as never);

    await expect(findActivePvpBattleForUser("u1")).resolves.toEqual(row);
  });
});

describe("recordBattleSessionRpc", () => {
  it("calls record_battle_session with the given payload", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: "session-1", error: null } as never);

    const payload: RecordBattleSessionPayload = {
      p_archetype: "tank",
      p_won: true,
      p_rating: 1200,
      p_total_questions: 10,
      p_correct_answers: 8,
      p_best_streak: 4,
      p_question_records: [{ action: "attack", correct: true, timeSpent: 5 }],
      p_opponent_type: "bot",
    };
    await expect(recordBattleSessionRpc(payload)).resolves.toBe("session-1");
    expect(supabase.rpc).toHaveBeenCalledWith("record_battle_session", payload);
  });

  it("returns null rather than throwing when the RPC fails", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: "boom" } } as never);
    const payload: RecordBattleSessionPayload = {
      p_archetype: "tank",
      p_won: true,
      p_rating: 1200,
      p_total_questions: 10,
      p_correct_answers: 8,
      p_best_streak: 4,
      p_question_records: [],
      p_opponent_type: "bot",
    };
    await expect(recordBattleSessionRpc(payload)).resolves.toBeNull();
  });
});

describe("getGhostSessionRpc", () => {
  it("calls get_ghost_session with the player's rating", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never);

    await getGhostSessionRpc(1200);

    expect(supabase.rpc).toHaveBeenCalledWith("get_ghost_session", { p_player_rating: 1200 });
  });

  it("returns null rather than throwing when the RPC fails", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: "boom" } } as never);
    await expect(getGhostSessionRpc(1200)).resolves.toBeNull();
  });
});
