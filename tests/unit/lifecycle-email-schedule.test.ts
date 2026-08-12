import { describe, expect, it } from "vitest";
import {
  LIFECYCLE_EMAIL_TUNING,
  decideLifecycleEmail,
  decideLifecycleEmails,
  type LifecycleCandidate,
} from "../../supabase/functions/_shared/email/schedule.ts";

/**
 * These tests are the safety net for the one bug in this feature that reaches
 * real inboxes: sending the same person the same mail twice, or two mails at
 * once. Every rule that prevents that is asserted here, with no database.
 */

const NOW = new Date("2026-08-10T20:00:00Z"); // a Monday, 20:00 UTC

function candidate(over: Partial<LifecycleCandidate> = {}): LifecycleCandidate {
  return {
    userId: "u1",
    dailyStreak: 0,
    lastPracticeDate: null,
    lastActivityAt: NOW.toISOString(),
    localHour: 8,
    localWeekday: 0,
    digestHour: 8,
    muted: [],
    lastSentAt: {},
    lastTopic: null,
    ...over,
  };
}

/**
 * An active streak that has not been practised today. Deliberately set to a
 * mid-week day so these cases test the streak rule alone — on the digest
 * weekday the weekly report would answer instead, and "null" would stop
 * meaning "the streak rule declined".
 */
function streakAtRisk(over: Partial<LifecycleCandidate> = {}): LifecycleCandidate {
  return candidate({ dailyStreak: 12, lastPracticeDate: "2026-08-09", localWeekday: 3, ...over });
}

/** Away long enough to re-engage, with no streak left to save. */
function dormant(over: Partial<LifecycleCandidate> = {}): LifecycleCandidate {
  return candidate({ dailyStreak: 0, lastActivityAt: "2026-07-20T09:00:00Z", ...over });
}

describe("streak saver", () => {
  it("fires for an active streak that has not practised today, late in the UTC day", () => {
    const d = decideLifecycleEmail(streakAtRisk(), NOW);
    expect(d).toEqual({
      kind: "streak_saver",
      userId: "u1",
      idempotencyKey: "streak_saver:u1:2026-08-10",
      streakDays: 12,
      hoursLeft: 4,
    });
  });

  it("stays silent when the user already practised today", () => {
    expect(decideLifecycleEmail(streakAtRisk({ lastPracticeDate: "2026-08-10" }), NOW)).toBeNull();
  });

  it("stays silent when there is no streak to save", () => {
    expect(decideLifecycleEmail(streakAtRisk({ dailyStreak: 0 }), NOW)).toBeNull();
  });

  it("waits until the day is genuinely running out", () => {
    const morning = new Date("2026-08-10T09:00:00Z");
    expect(decideLifecycleEmail(streakAtRisk({ localHour: 9 }), morning)).toBeNull();
  });

  it("stops once the hour is too late for anyone to act", () => {
    const midnight = new Date("2026-08-10T23:59:00Z");
    expect(decideLifecycleEmail(streakAtRisk(), midnight)).toBeNull();
  });

  it("honours a muted category", () => {
    expect(decideLifecycleEmail(streakAtRisk({ muted: ["streak_saver"] }), NOW)).toBeNull();
  });
});

describe("weekly report", () => {
  const active = candidate({ localWeekday: 0, localHour: 8, digestHour: 8 });

  it("fires on the configured weekday at the user's own digest hour", () => {
    const d = decideLifecycleEmail(active, NOW);
    expect(d).toMatchObject({
      kind: "weekly_report",
      userId: "u1",
      idempotencyKey: "weekly_report:u1:2026-08-10",
    });
  });

  it("covers the seven days before now", () => {
    const d = decideLifecycleEmail(active, NOW);
    expect(d?.kind === "weekly_report" && d.since).toBe("2026-08-03T20:00:00.000Z");
  });

  it("waits for the user's own digest hour rather than a fixed one", () => {
    expect(decideLifecycleEmail(candidate({ digestHour: 19 }), NOW)).toBeNull();
  });

  it("only fires on the configured weekday", () => {
    expect(decideLifecycleEmail(candidate({ localWeekday: 3 }), NOW)).toBeNull();
  });

  it("does not report a week to someone who was not there for it", () => {
    expect(
      decideLifecycleEmail(candidate({ lastActivityAt: "2026-07-01T00:00:00Z" }), NOW),
    ).not.toMatchObject({ kind: "weekly_report" });
  });

  it("honours a muted category", () => {
    expect(decideLifecycleEmail(candidate({ muted: ["weekly_report"] }), NOW)).toBeNull();
  });
});

describe("re-engagement", () => {
  it("fires for a dormant user with no streak, at their digest hour", () => {
    const d = decideLifecycleEmail(dormant({ localWeekday: 3 }), NOW);
    expect(d).toEqual({
      kind: "re_engagement",
      userId: "u1",
      idempotencyKey: "re_engagement:u1:2026-08-10",
      daysAway: 21,
      topic: null,
    });
  });

  it("waits out the grace period — a few quiet days is not a lapse", () => {
    const away3 = dormant({ localWeekday: 3, lastActivityAt: "2026-08-07T20:00:00Z" });
    expect(decideLifecycleEmail(away3, NOW)).toBeNull();
  });

  it("gives up once someone is long gone, instead of nagging forever", () => {
    const away200 = dormant({ localWeekday: 3, lastActivityAt: "2026-01-01T00:00:00Z" });
    expect(decideLifecycleEmail(away200, NOW)).toBeNull();
  });

  it("honours a muted category", () => {
    expect(
      decideLifecycleEmail(dormant({ localWeekday: 3, muted: ["re_engagement"] }), NOW),
    ).toBeNull();
  });
});

describe("mutual exclusion", () => {
  it("never lets streak saver and re-engagement match the same user", () => {
    // The two are defined on opposite sides of `dailyStreak > 0`, so sweep every
    // streak value across the window where both would otherwise be eligible.
    for (const streak of [0, 1, 5, 400]) {
      for (const daysAway of [0, 3, 8, 30, 90]) {
        const c = candidate({
          dailyStreak: streak,
          lastPracticeDate: streak > 0 ? "2026-08-09" : null,
          lastActivityAt: new Date(NOW.getTime() - daysAway * 86_400_000).toISOString(),
          localWeekday: 3,
          localHour: 8,
        });
        const kinds = [decideLifecycleEmail(c, NOW)].filter(Boolean).map((d) => d?.kind);
        expect(
          kinds.filter((k) => k === "streak_saver" || k === "re_engagement").length,
          `streak=${streak} daysAway=${daysAway}`,
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  it("sends at most one email per user per sweep", () => {
    // Eligible for the streak saver and the weekly report at the same instant.
    const both = streakAtRisk({ localWeekday: 0, localHour: 8, digestHour: 8 });
    expect(decideLifecycleEmail(both, NOW)?.kind).toBe("streak_saver");
  });
});

describe("rate limiting", () => {
  it("will not send a second streak saver inside the minimum interval", () => {
    const justSent = streakAtRisk({
      lastSentAt: { streak_saver: "2026-08-10T09:00:00Z" },
    });
    expect(decideLifecycleEmail(justSent, NOW)).toBeNull();
  });

  it("will not send a second weekly report inside the minimum interval", () => {
    const justSent = candidate({ lastSentAt: { weekly_report: "2026-08-06T08:00:00Z" } });
    expect(decideLifecycleEmail(justSent, NOW)).toBeNull();
  });

  it("will not send a second re-engagement inside the minimum interval", () => {
    const justSent = dormant({
      localWeekday: 3,
      lastSentAt: { re_engagement: "2026-08-04T08:00:00Z" },
    });
    expect(decideLifecycleEmail(justSent, NOW)).toBeNull();
  });

  it("lets a streak saver through even if other mail went out this morning", () => {
    // Time-critical: a digest at 08:00 must not cost the user their streak.
    const c = streakAtRisk({ lastSentAt: { weekly_report: "2026-08-10T08:00:00Z" } });
    expect(decideLifecycleEmail(c, NOW)?.kind).toBe("streak_saver");
  });

  it("holds back non-urgent mail when something else arrived recently", () => {
    const c = dormant({
      localWeekday: 3,
      lastSentAt: { streak_saver: "2026-08-10T02:00:00Z" },
    });
    expect(decideLifecycleEmail(c, NOW)).toBeNull();
  });
});

describe("idempotency keys", () => {
  it("collide for a repeat of the same window and differ across windows", () => {
    const c = streakAtRisk();
    const first = decideLifecycleEmail(c, NOW)?.idempotencyKey;
    const rerunSameDay = decideLifecycleEmail(c, new Date("2026-08-10T21:30:00Z"))?.idempotencyKey;
    const nextDay = decideLifecycleEmail(
      streakAtRisk({ lastPracticeDate: "2026-08-10" }),
      new Date("2026-08-11T20:00:00Z"),
    )?.idempotencyKey;

    expect(first).toBe(rerunSameDay);
    expect(nextDay).not.toBe(first);
  });

  it("scopes the key to the user", () => {
    const a = decideLifecycleEmail(streakAtRisk({ userId: "a" }), NOW)?.idempotencyKey;
    const b = decideLifecycleEmail(streakAtRisk({ userId: "b" }), NOW)?.idempotencyKey;
    expect(a).not.toBe(b);
  });
});

describe("decideLifecycleEmails", () => {
  it("drops the candidates with nothing to send and keeps one decision each", () => {
    const decisions = decideLifecycleEmails(
      [
        streakAtRisk({ userId: "at-risk" }),
        candidate({ userId: "practised", dailyStreak: 3, lastPracticeDate: "2026-08-10" }),
        dormant({ userId: "gone", localWeekday: 3 }),
      ],
      NOW,
    );

    expect(decisions.map((d) => [d.userId, d.kind])).toEqual([
      ["at-risk", "streak_saver"],
      ["practised", "weekly_report"],
      ["gone", "re_engagement"],
    ]);
    expect(new Set(decisions.map((d) => d.userId)).size).toBe(decisions.length);
  });
});

describe("tuning", () => {
  it("keeps the re-engagement grace period clear of the streak-saver window", () => {
    // A user who lapsed yesterday is a streak problem, not a dormancy problem.
    expect(LIFECYCLE_EMAIL_TUNING.reEngagementMinDaysAway).toBeGreaterThan(1);
    expect(LIFECYCLE_EMAIL_TUNING.reEngagementMinDaysAway).toBeLessThan(
      LIFECYCLE_EMAIL_TUNING.reEngagementMaxDaysAway,
    );
  });
});
