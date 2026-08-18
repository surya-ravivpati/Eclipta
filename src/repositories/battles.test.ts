import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The Supabase client is the one thing this module can't exercise directly
 * without a real database - it's mocked here so these tests prove the
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
import { completeBotBattleVerified, getPlayerRating, insertBattleQuestionRecords } from "./battles";

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

/**
 * The whole point of this call is that it does not send an outcome. The older
 * `complete_bot_battle` took a client-written `won` flag, which made a forged
 * victory worth free rating and got it revoked; this one hands over the
 * questions the server issued and lets the server judge them.
 *
 * So the two things worth asserting are that nothing resembling a result goes
 * out in the request, and that an unrated session comes back as a fact rather
 * than an error - a player who answered too few questions to be judged has not
 * done anything wrong.
 */
describe("completeBotBattleVerified", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends the challenge ids and no claim about who won, or which session", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { rated: true, won: true, rating_after: 1006, rating_delta: 6 },
      error: null,
    } as never);

    await completeBotBattleVerified(["c1", "c2", "c3"], "tank", "tank-a");

    expect(supabase.rpc).toHaveBeenCalledWith("complete_bot_battle_verified", {
      p_challenge_ids: ["c1", "c2", "c3"],
      p_archetype: "tank",
      p_ecliptar_slug: "tank-a",
    });

    // Nothing resembling a result crosses: no won flag, and no session id -
    // a client-minted session is exactly the evidence this replaced.
    const [, args] = vi.mocked(supabase.rpc).mock.calls[0] as [string, Record<string, unknown>];
    expect(Object.keys(args).sort()).toEqual(["p_archetype", "p_challenge_ids", "p_ecliptar_slug"]);
    expect(args).not.toHaveProperty("p_won");
    expect(args).not.toHaveProperty("p_session_id");
  });

  it("reports the rating the server settled on", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { rated: true, won: true, rating_after: 1006, rating_delta: 6 },
      error: null,
    } as never);

    expect(await completeBotBattleVerified(["c"], "tank", null)).toEqual({
      rated: true,
      won: true,
      ratingAfter: 1006,
      ratingDelta: 6,
    });
  });

  it("carries a loss through as a loss", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { rated: true, won: false, rating_after: 994, rating_delta: -6 },
      error: null,
    } as never);

    const outcome = await completeBotBattleVerified(["c"], "tank", null);
    expect(outcome.won).toBe(false);
    expect(outcome.ratingDelta).toBe(-6);
  });

  it("treats an unrated session as an outcome, not a failure", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { already_completed: false, rated: false, reason: "not_enough_verified_answers" },
      error: null,
    } as never);

    expect(await completeBotBattleVerified(["c"], "tank", null)).toEqual({
      rated: false,
      won: null,
      ratingAfter: null,
      ratingDelta: 0,
    });
  });

  it("does not invent a rating change from a malformed response", async () => {
    for (const data of [null, {}, { rated: true }, { rated: "yes", rating_delta: "6" }]) {
      vi.mocked(supabase.rpc).mockResolvedValue({ data, error: null } as never);
      const outcome = await completeBotBattleVerified(["c"], "tank", null);
      expect(outcome.ratingDelta, JSON.stringify(data)).toBe(0);
      expect(outcome.ratingAfter).toBeNull();
    }
  });

  it("throws when the call itself fails, so the caller can say so", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { message: "Not authenticated" },
    } as never);

    await expect(completeBotBattleVerified(["c"], "tank", null)).rejects.toThrow(
      "Not authenticated",
    );
  });
});
