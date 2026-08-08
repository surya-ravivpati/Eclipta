import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(),
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  },
}));

import { supabase } from "@/integrations/supabase/client";
import { getDashboard } from "./dashboard";

beforeEach(() => {
  vi.clearAllMocks();
});

/** Wires supabase.from to return per-table query builders for the fallback path. */
function mockFallbackTables(opts: {
  profile?: unknown;
  courses?: unknown[];
  ratings?: unknown;
  battles?: unknown[];
}) {
  vi.mocked(supabase.auth.getUser).mockResolvedValue({
    data: { user: { id: "u1" } },
  } as never);

  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === "user_profiles") {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: opts.profile ?? null }) }),
        }),
      } as never;
    }
    if (table === "course_progress") {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: opts.courses ?? [] }),
            }),
          }),
        }),
      } as never;
    }
    if (table === "player_ratings") {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: opts.ratings ?? null }) }),
        }),
      } as never;
    }
    if (table === "battle_sessions") {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: opts.battles ?? [] }),
            }),
          }),
        }),
      } as never;
    }
    throw new Error(`Unexpected table in test: ${table}`);
  });
}

describe("getDashboard — happy path", () => {
  it("returns status ok with the RPC's data when it succeeds", async () => {
    const rpcData = { profile: { username: "nova" }, resume: null };
    vi.mocked(supabase.rpc).mockResolvedValue({ data: rpcData, error: null } as never);

    const result = await getDashboard();

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data).toEqual(rpcData);
    }
    expect(supabase.rpc).toHaveBeenCalledWith("get_dashboard", {});
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe("getDashboard — degraded path", () => {
  it("distinguishes an undeployed migration (PGRST202) from a generic error", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "function not found" },
    } as never);
    mockFallbackTables({});

    const result = await getDashboard();

    expect(result.status).toBe("degraded");
    if (result.status === "degraded") {
      expect(result.reason).toMatch(/not deployed/i);
    }
  });

  it("reports the RPC's own error message when it isn't a missing-function error", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { code: "OTHER", message: "connection reset" },
    } as never);
    mockFallbackTables({});

    const result = await getDashboard();

    expect(result.status).toBe("degraded");
    if (result.status === "degraded") {
      expect(result.reason).toBe("connection reset");
    }
  });

  it("assembles profile, rating, and recent battles from the fallback reads", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "function not found" },
    } as never);
    mockFallbackTables({
      profile: { username: "nova", xp: 500 },
      ratings: { rating: 1200, wins: 3, losses: 1 },
      battles: [{ id: "b1", archetype: "tank", won: true }],
    });

    const result = await getDashboard();

    expect(result.status).toBe("degraded");
    if (result.status === "degraded") {
      expect(result.data.profile).toEqual({ username: "nova", xp: 500 });
      expect(result.data.rating).toEqual({ rating: 1200, wins: 3, losses: 1 });
      expect(result.data.recent_battles).toHaveLength(1);
    }
  });

  it("picks the most recent unfinished course as the resume target", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "function not found" },
    } as never);
    mockFallbackTables({
      courses: [
        {
          course_slug: "done-course",
          course_title: "Finished",
          current_block_id: null,
          percent: 100,
          lessons_done: 5,
          lessons_total: 5,
          last_opened_at: "2026-08-01",
          completed_at: "2026-08-01",
        },
        {
          course_slug: "in-progress",
          course_title: "Still Going",
          current_block_id: "block-2",
          percent: 40,
          lessons_done: 2,
          lessons_total: 5,
          last_opened_at: "2026-08-05",
          completed_at: null,
        },
      ],
    });

    const result = await getDashboard();

    expect(result.status).toBe("degraded");
    if (result.status === "degraded") {
      expect(result.data.resume?.course_slug).toBe("in-progress");
      expect(result.data.recent_courses).toHaveLength(2);
    }
  });

  it("returns status error, not a crash, when the user isn't signed in", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "function not found" },
    } as never);
    vi.mocked(supabase.auth.getUser).mockResolvedValue({ data: { user: null } } as never);

    const result = await getDashboard();

    expect(result.status).toBe("error");
  });
});
