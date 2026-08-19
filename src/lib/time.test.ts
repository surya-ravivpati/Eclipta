import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { timeAgo } from "./time";

/**
 * This used to be four functions with three output formats, so the tests are
 * mostly about the boundaries where those copies disagreed: what the first
 * minute is called, and whether the suffix is there.
 */

const NOW = new Date("2026-03-15T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("timeAgo", () => {
  it("counts up through the units, with the suffix by default", () => {
    expect(timeAgo(ago(30_000))).toBe("just now");
    expect(timeAgo(ago(5 * MINUTE))).toBe("5m ago");
    expect(timeAgo(ago(3 * HOUR))).toBe("3h ago");
    expect(timeAgo(ago(4 * DAY))).toBe("4d ago");
  });

  it("drops the whole suffix, not half of it, when asked", () => {
    // The old terse copies said "just now" and "now" for the same moment.
    expect(timeAgo(ago(30_000), { suffix: false })).toBe("now");
    expect(timeAgo(ago(5 * MINUTE), { suffix: false })).toBe("5m");
    expect(timeAgo(ago(3 * HOUR), { suffix: false })).toBe("3h");
    expect(timeAgo(ago(4 * DAY), { suffix: false })).toBe("4d");
  });

  it("switches to a date past the cutoff", () => {
    const out = timeAgo(ago(200 * DAY), { dateAfterDays: 30 });
    expect(out).not.toMatch(/\d+d/);
    expect(out).toBe(new Date(ago(200 * DAY)).toLocaleDateString());
  });

  it("still counts on the day the cutoff falls", () => {
    expect(timeAgo(ago(29 * DAY), { dateAfterDays: 30 })).toBe("29d ago");
    expect(timeAgo(ago(30 * DAY), { dateAfterDays: 30 })).not.toBe("30d ago");
  });

  it("keeps counting days forever when no cutoff is given", () => {
    expect(timeAgo(ago(900 * DAY))).toBe("900d ago");
  });

  it("rounds down rather than up at every boundary", () => {
    // 59 seconds is "just now", not "1m ago" - a timestamp must never claim
    // more time has passed than actually has.
    expect(timeAgo(ago(59_000))).toBe("just now");
    expect(timeAgo(ago(MINUTE))).toBe("1m ago");
    expect(timeAgo(ago(59 * MINUTE))).toBe("59m ago");
    expect(timeAgo(ago(HOUR))).toBe("1h ago");
    expect(timeAgo(ago(23 * HOUR))).toBe("23h ago");
    expect(timeAgo(ago(DAY))).toBe("1d ago");
  });

  it("reads a future timestamp as now rather than counting backwards", () => {
    // Clock skew between a browser and Postgres is real, and "-1m ago" is
    // worse than a moment of imprecision.
    expect(timeAgo(new Date(NOW.getTime() + 5 * MINUTE).toISOString())).toBe("just now");
  });
});
