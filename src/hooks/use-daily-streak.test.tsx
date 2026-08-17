import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

/**
 * The streak is the number a returning learner looks at first, so the failure
 * that matters is silently showing the wrong one. Two guards do the work: the
 * row is read defensively, because a profile that has never practised has
 * nulls in every one of these columns; and the celebration only fires on a
 * milestone the server says is newly crossed - `already` is what stops the
 * same 7-day banner appearing on every practice that day.
 */

const getUser = vi.fn<() => Promise<{ data: { user: { id: string } | null } }>>();
const rpc = vi.fn<() => Promise<{ data: unknown; error: unknown }>>();
const removeChannel = vi.fn<() => void>();
let profileRow: Record<string, unknown> | null = null;

function profileChain() {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve({ data: profileRow, error: null }),
  };
  return chain;
}

/** Realtime channel stand-in - subscribing is a no-op here. */
function channel() {
  const ch = { on: () => ch, subscribe: () => ch };
  return ch;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: () => getUser() },
    from: () => profileChain(),
    rpc: () => rpc(),
    channel: () => channel(),
    removeChannel: () => removeChannel(),
  },
}));

const { useDailyStreak, emitStreakMilestone } = await import("./use-daily-streak");

/** Render and let the mount effect's awaits settle. */
async function mount() {
  const rendered = renderHook(() => useDailyStreak());
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return rendered;
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "me" } } });
  rpc.mockResolvedValue({ data: null, error: null });
  profileRow = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("reading the streak", () => {
  it("reports what the profile holds", async () => {
    profileRow = {
      daily_streak: 7,
      longest_daily_streak: 12,
      streak_freezes: 2,
      last_practice_date: "2026-08-16",
      practice_dates: ["2026-08-15", "2026-08-16"],
    };

    const { result } = await mount();

    expect(result.current.dailyStreak).toBe(7);
    expect(result.current.longestDailyStreak).toBe(12);
    expect(result.current.streakFreezes).toBe(2);
    expect(result.current.practiceDates).toHaveLength(2);
    expect(result.current.loading).toBe(false);
  });

  it("shows zeroes, not nulls, for someone who has never practised", async () => {
    // Every one of these columns is null on a fresh profile, and a null on the
    // streak card renders as an empty space rather than a zero.
    profileRow = {
      daily_streak: null,
      longest_daily_streak: null,
      streak_freezes: null,
      last_practice_date: null,
      practice_dates: null,
    };

    const { result } = await mount();

    expect(result.current.dailyStreak).toBe(0);
    expect(result.current.longestDailyStreak).toBe(0);
    expect(result.current.streakFreezes).toBe(0);
    expect(result.current.practiceDates).toEqual([]);
  });

  it("shows nothing and stops loading when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const { result } = await mount();

    expect(result.current.dailyStreak).toBe(0);
    expect(result.current.loading).toBe(false);
  });

  it("has no row to read when the profile is missing entirely", async () => {
    profileRow = null;
    const { result } = await mount();
    expect(result.current.dailyStreak).toBe(0);
  });
});

describe("recording a practice", () => {
  it("moves the streak to what the server returned", async () => {
    const { result } = await mount();
    rpc.mockResolvedValue({
      data: { daily_streak: 3, longest_daily_streak: 5, streak_freezes: 1, already: false },
      error: null,
    });

    await act(async () => {
      await result.current.recordPractice();
    });

    expect(result.current.dailyStreak).toBe(3);
    expect(result.current.longestDailyStreak).toBe(5);
  });

  it("returns nothing and asks nothing when signed out", async () => {
    const { result } = await mount();
    getUser.mockResolvedValue({ data: { user: null } });

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.recordPractice();
    });

    expect(outcome).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns nothing when the call fails, rather than a half-updated streak", async () => {
    const { result } = await mount();
    rpc.mockResolvedValue({ data: null, error: { message: "offline" } });

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.recordPractice();
    });

    expect(outcome).toBeNull();
    expect(result.current.dailyStreak).toBe(0);
  });
});

describe("the milestone celebration", () => {
  function listen() {
    const seen: unknown[] = [];
    const handler = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener("eclipta:streak-milestone", handler);
    return { seen, stop: () => window.removeEventListener("eclipta:streak-milestone", handler) };
  }

  it("fires on a milestone the server says is newly crossed", async () => {
    const { result } = await mount();
    const { seen, stop } = listen();
    rpc.mockResolvedValue({
      data: {
        daily_streak: 7,
        longest_daily_streak: 7,
        streak_freezes: 0,
        already: false,
        milestone: 7,
        milestone_reward: 250,
      },
      error: null,
    });

    await act(async () => {
      await result.current.recordPractice();
    });
    stop();

    expect(seen).toEqual([{ milestone: 7, reward: 250, streak: 7 }]);
  });

  it("stays quiet on a repeat practice the same day", async () => {
    // `already` is the whole guard: without it the 7-day banner reappears on
    // every session until midnight.
    const { result } = await mount();
    const { seen, stop } = listen();
    rpc.mockResolvedValue({
      data: {
        daily_streak: 7,
        longest_daily_streak: 7,
        streak_freezes: 0,
        already: true,
        milestone: 7,
      },
      error: null,
    });

    await act(async () => {
      await result.current.recordPractice();
    });
    stop();

    expect(seen).toEqual([]);
  });

  it("stays quiet on an ordinary day with no milestone", async () => {
    const { result } = await mount();
    const { seen, stop } = listen();
    rpc.mockResolvedValue({
      data: { daily_streak: 4, longest_daily_streak: 9, streak_freezes: 0, already: false },
      error: null,
    });

    await act(async () => {
      await result.current.recordPractice();
    });
    stop();

    expect(seen).toEqual([]);
  });

  it("reports a milestone with no stated reward as zero", () => {
    const { seen, stop } = listen();
    emitStreakMilestone({ milestone: 30, reward: 0, streak: 30 });
    stop();
    expect(seen).toEqual([{ milestone: 30, reward: 0, streak: 30 }]);
  });
});
