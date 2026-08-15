import { describe, it, expect } from "vitest";
import {
  MILESTONE_REWARDS,
  STREAK_MILESTONES,
  flameTier,
  flameTierLabel,
  isAtRisk,
  lastNDays,
  milestoneReward,
  nextMilestone,
  practicedToday,
  riskMessage,
  streakMessage,
  todayUtc,
  weekdayLetter,
  type StreakState,
} from "./daily-streak";
import { at } from "./test-helpers";

/**
 * The streak is the app's daily-return mechanic, and all of its logic is pure
 * date maths that nothing covered. Two things make it worth pinning: the date
 * handling is UTC-based to match the server's own arithmetic, so a
 * timezone-sensitive bug here would silently break streaks for anyone not on
 * UTC; and the copy is deliberately encouraging rather than guilt-inducing,
 * which is a product decision a future edit could quietly undo.
 */

function state(over: Partial<StreakState> = {}): StreakState {
  return {
    dailyStreak: 0,
    lastPracticeDate: null,
    streakFreezes: 0,
    already: false,
    ...over,
  } as StreakState;
}

/** A fixed instant, mid-day UTC so hour-of-day maths is unambiguous. */
const NOON = new Date("2026-03-15T12:00:00Z");

describe("todayUtc", () => {
  it("formats as YYYY-MM-DD in UTC", () => {
    expect(todayUtc(NOON)).toBe("2026-03-15");
  });

  it("uses the UTC day, not the local one", () => {
    // 23:30 UTC on the 15th is already the 16th in some zones and still the
    // 15th here. The server counts days in UTC, so this must too.
    expect(todayUtc(new Date("2026-03-15T23:30:00Z"))).toBe("2026-03-15");
    expect(todayUtc(new Date("2026-03-16T00:30:00Z"))).toBe("2026-03-16");
  });
});

describe("practicedToday", () => {
  it("is false when nothing has ever been practised", () => {
    expect(practicedToday(state(), NOON)).toBe(false);
  });

  it("is true only for today's date", () => {
    expect(practicedToday(state({ lastPracticeDate: "2026-03-15" }), NOON)).toBe(true);
    expect(practicedToday(state({ lastPracticeDate: "2026-03-14" }), NOON)).toBe(false);
  });
});

describe("milestones", () => {
  it("gives every listed milestone a reward", () => {
    for (const m of STREAK_MILESTONES) {
      expect(milestoneReward(m)).toBeGreaterThan(0);
      expect(MILESTONE_REWARDS[m]).toBeGreaterThan(0);
    }
  });

  it("rewards grow with the milestone", () => {
    const rewards = STREAK_MILESTONES.map((m) => milestoneReward(m));
    for (let i = 1; i < rewards.length; i++) {
      expect(at(rewards, i)).toBeGreaterThan(at(rewards, i - 1));
    }
  });

  it("returns 0 for a day that is not a milestone", () => {
    expect(milestoneReward(4)).toBe(0);
  });

  it("points at the next milestone above the current streak", () => {
    expect(nextMilestone(0)).toBe(3);
    expect(nextMilestone(3)).toBe(7);
    expect(nextMilestone(6)).toBe(7);
  });

  it("returns null past the final milestone", () => {
    expect(nextMilestone(365)).toBeNull();
    expect(nextMilestone(10_000)).toBeNull();
  });
});

describe("flameTier", () => {
  it("escalates at each threshold and never skips a tier", () => {
    expect(flameTier(0)).toBe("ember");
    expect(flameTier(6)).toBe("ember");
    expect(flameTier(7)).toBe("flame");
    expect(flameTier(29)).toBe("flame");
    expect(flameTier(30)).toBe("blaze");
    expect(flameTier(99)).toBe("blaze");
    expect(flameTier(100)).toBe("inferno");
    expect(flameTier(364)).toBe("inferno");
    expect(flameTier(365)).toBe("eternal");
  });

  it("labels every tier", () => {
    for (const s of [0, 7, 30, 100, 365]) {
      expect(flameTierLabel(s).length).toBeGreaterThan(0);
    }
  });
});

describe("lastNDays", () => {
  it("returns n days ending today, oldest first", () => {
    const days = lastNDays(3, NOON);
    expect(days).toEqual(["2026-03-13", "2026-03-14", "2026-03-15"]);
  });

  it("crosses a month boundary correctly", () => {
    expect(lastNDays(3, new Date("2026-03-02T12:00:00Z"))).toEqual([
      "2026-02-28",
      "2026-03-01",
      "2026-03-02",
    ]);
  });

  it("handles a leap day", () => {
    expect(lastNDays(2, new Date("2028-03-01T12:00:00Z"))).toEqual(["2028-02-29", "2028-03-01"]);
  });
});

describe("weekdayLetter", () => {
  it("maps a date to its weekday initial in UTC", () => {
    // 2026-03-15 is a Sunday.
    expect(weekdayLetter("2026-03-15")).toBe("S");
    expect(weekdayLetter("2026-03-16")).toBe("M");
  });
});

describe("isAtRisk", () => {
  it("is false with no streak to lose", () => {
    expect(isAtRisk(state({ dailyStreak: 0 }), NOON)).toBe(false);
  });

  it("is false once today is done", () => {
    expect(isAtRisk(state({ dailyStreak: 5, lastPracticeDate: "2026-03-15" }), NOON)).toBe(false);
  });

  it("is true with an active streak and nothing done today", () => {
    expect(isAtRisk(state({ dailyStreak: 5, lastPracticeDate: "2026-03-14" }), NOON)).toBe(true);
  });
});

describe("messages", () => {
  it("invites rather than scolds when there is no streak", () => {
    const msg = streakMessage(state(), NOON);
    expect(msg.length).toBeGreaterThan(0);
    expect(msg).not.toMatch(/lost|failed|broke/i);
  });

  it("acknowledges a completed day and names the next milestone", () => {
    const msg = streakMessage(state({ dailyStreak: 5, lastPracticeDate: "2026-03-15" }), NOON);
    expect(msg).toMatch(/7/);
  });

  it("does not promise a next milestone past the last one", () => {
    const msg = streakMessage(state({ dailyStreak: 400, lastPracticeDate: "2026-03-15" }), NOON);
    expect(msg).toMatch(/legendary/i);
  });

  it("mentions the freeze only when one is actually held", () => {
    const withFreeze = riskMessage(state({ dailyStreak: 9, streakFreezes: 1 }), NOON);
    const without = riskMessage(state({ dailyStreak: 9, streakFreezes: 0 }), NOON);
    expect(withFreeze).toMatch(/freeze/i);
    expect(without).toMatch(/no freezes/i);
  });

  it("adds the countdown only inside the last six hours", () => {
    const early = riskMessage(state({ dailyStreak: 9 }), new Date("2026-03-15T10:00:00Z"));
    const late = riskMessage(state({ dailyStreak: 9 }), new Date("2026-03-15T20:00:00Z"));
    expect(early).not.toMatch(/left today/);
    expect(late).toMatch(/4h left today/);
  });
});
