import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The Supabase client is the one thing this module can't exercise directly
 * without a real database — it's mocked here so these tests prove the
 * repository's own logic (which table, which columns, how errors and empty
 * results map to the return type) rather than Supabase's behaviour.
 */
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

import { supabase } from "@/integrations/supabase/client";
import { getPlayerRating, insertBattleQuestionRecords } from "./battles";

function mockFrom(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  vi.mocked(supabase.from).mockReturnValue({ select } as never);
  return { select, eq, maybeSingle };
}

describe("getPlayerRating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries player_ratings filtered to the given user", async () => {
    const { select, eq } = mockFrom({
      data: {
        user_id: "u1",
        rating: 1200,
        peak_rating: 1300,
        wins: 5,
        losses: 2,
        updated_at: "now",
      },
      error: null,
    });

    await getPlayerRating("u1");

    expect(supabase.from).toHaveBeenCalledWith("player_ratings");
    expect(select).toHaveBeenCalledWith("*");
    expect(eq).toHaveBeenCalledWith("user_id", "u1");
  });

  it("returns the row when one exists", async () => {
    const row = {
      user_id: "u1",
      rating: 1200,
      peak_rating: 1300,
      wins: 5,
      losses: 2,
      updated_at: "now",
    };
    mockFrom({ data: row, error: null });

    await expect(getPlayerRating("u1")).resolves.toEqual(row);
  });

  it("returns null for a player who has never been rated, rather than throwing", async () => {
    mockFrom({ data: null, error: null });

    await expect(getPlayerRating("new-user")).resolves.toBeNull();
  });

  it("throws on a genuine database error rather than silently returning null", async () => {
    mockFrom({ data: null, error: { message: "connection reset" } });

    await expect(getPlayerRating("u1")).rejects.toThrow("connection reset");
  });
});

describe("insertBattleQuestionRecords", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts the given rows into battle_question_records", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabase.from).mockReturnValue({ insert } as never);

    const rows = [
      {
        user_id: "u1",
        concept: "derivatives",
        subject: "Mathematics",
        difficulty: "medium",
        correct: true,
        time_spent: 12.5,
      },
    ];
    await insertBattleQuestionRecords(rows);

    expect(supabase.from).toHaveBeenCalledWith("battle_question_records");
    expect(insert).toHaveBeenCalledWith(rows);
  });

  it("throws on a genuine database error", async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: "connection reset" } });
    vi.mocked(supabase.from).mockReturnValue({ insert } as never);

    await expect(insertBattleQuestionRecords([])).rejects.toThrow("connection reset");
  });
});
