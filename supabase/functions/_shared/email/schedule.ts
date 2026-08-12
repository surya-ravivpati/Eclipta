/**
 * Who gets which lifecycle email, and when.
 *
 * Kept pure — no Deno, no network, no database — for two reasons. First, this
 * is the code that decides to email a real person, so it has to be testable
 * exhaustively without a live database (see
 * tests/unit/lifecycle-email-schedule.test.ts). Second, the same split already
 * works for the streak system: src/lib/daily-streak.ts interprets state that
 * Postgres computes, and the RPC stays the only thing that touches rows.
 *
 * Postgres supplies the facts (get_lifecycle_email_candidates), this module
 * decides, and send-lifecycle-email remains the single gate that actually
 * sends — including its own idempotency claim on `email_log`.
 */

export type LifecycleKind = "streak_saver" | "weekly_report" | "re_engagement";

export interface LifecycleCandidate {
  userId: string;
  dailyStreak: number;
  /** UTC YYYY-MM-DD of the last practised day, matching the streak RPC's date math. */
  lastPracticeDate: string | null;
  /** ISO timestamp of the most recent activity of any kind, never null in practice. */
  lastActivityAt: string | null;
  /** Hour 0–23 in the user's own timezone at sweep time. */
  localHour: number;
  /** 0 = Monday … 6 = Sunday, in the user's own timezone. */
  localWeekday: number;
  /** Hour the user asked for their digest, in their own timezone. */
  digestHour: number;
  /** Categories the user switched off, as raw strings from `email_preferences`. */
  muted: string[];
  /** Last send per kind, from `email_log`. Absent means never sent. */
  lastSentAt: Partial<Record<LifecycleKind, string | null>>;
  /** Most recent topic they studied, for a re-engagement mail that knows them. */
  lastTopic: string | null;
}

export type LifecycleDecision =
  | {
      kind: "streak_saver";
      userId: string;
      idempotencyKey: string;
      streakDays: number;
      hoursLeft: number;
    }
  | { kind: "weekly_report"; userId: string; idempotencyKey: string; since: string }
  | {
      kind: "re_engagement";
      userId: string;
      idempotencyKey: string;
      daysAway: number;
      topic: string | null;
    };

/**
 * Everything a human might want to retune without touching logic.
 *
 * The intervals are the anti-spam contract. They are deliberately longer than
 * the cron period so a sweep that runs every hour still cannot produce hourly
 * mail even if the idempotency key were somehow lost.
 */
export const LIFECYCLE_EMAIL_TUNING = {
  /**
   * UTC hours in which a streak saver is worth sending. Streaks roll over at
   * UTC midnight (record_daily_practice's date math), so this is the only
   * decision that ignores the user's own timezone — the deadline is real and
   * it is in UTC. Late enough that the user has had a full day to practise,
   * early enough that one lesson still fits.
   */
  streakSaverFromUtcHour: 18,
  streakSaverUntilUtcHour: 22,
  /** 0 = Monday. The weekly recap lands at the start of the week, not the end of it. */
  weeklyReportWeekday: 0,
  /** A recap only makes sense for someone who was actually there for the week. */
  weeklyReportMaxDaysAway: 7,
  /** Below this, silence beats a nudge: a few quiet days is a weekend, not a lapse. */
  reEngagementMinDaysAway: 7,
  /** Above this we stop. Someone two months gone is not coming back for a fourth email. */
  reEngagementMaxDaysAway: 60,
  /** Minimum hours between two sends of the same kind. */
  minHoursBetweenSameKind: {
    streak_saver: 20,
    weekly_report: 144,
    re_engagement: 336,
  } as Record<LifecycleKind, number>,
  /**
   * Minimum hours between *any* two lifecycle emails. Streak savers are exempt:
   * they are time-critical, capped at one a day anyway, and suppressing one
   * because a digest arrived that morning costs the user the thing the email
   * exists to protect.
   */
  quietHoursBetweenAnyKind: 20,
} as const;

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** UTC YYYY-MM-DD, the same key `record_daily_practice` counts days by. */
function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

function hoursSince(iso: string | null | undefined, now: Date): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const then = Date.parse(iso);
  return Number.isNaN(then) ? Number.POSITIVE_INFINITY : (now.getTime() - then) / HOUR_MS;
}

function daysSince(iso: string | null | undefined, now: Date): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const then = Date.parse(iso);
  return Number.isNaN(then)
    ? Number.POSITIVE_INFINITY
    : Math.floor((now.getTime() - then) / DAY_MS);
}

/** Hours since the most recent lifecycle mail of any kind. */
function hoursSinceAnySend(c: LifecycleCandidate, now: Date): number {
  return Math.min(
    ...(Object.values(c.lastSentAt) as (string | null | undefined)[]).map((iso) =>
      hoursSince(iso, now),
    ),
    Number.POSITIVE_INFINITY,
  );
}

function allowed(c: LifecycleCandidate, kind: LifecycleKind, now: Date): boolean {
  if (c.muted.includes(kind)) return false;
  return (
    hoursSince(c.lastSentAt[kind], now) >= LIFECYCLE_EMAIL_TUNING.minHoursBetweenSameKind[kind]
  );
}

/** True when the user has already logged practice for the current UTC day. */
function practisedToday(c: LifecycleCandidate, now: Date): boolean {
  return c.lastPracticeDate === utcDay(now);
}

/**
 * The one decision for this user on this sweep, or null.
 *
 * Ordered by urgency, and it returns on the first match — which is what makes
 * "at most one lifecycle email per user per sweep" true by construction rather
 * than by a later filter someone could remove.
 *
 * Streak saver and re-engagement are mutually exclusive by definition: one
 * requires `dailyStreak > 0` and the other requires `dailyStreak === 0`. Keep
 * it that way; a "nearly lapsed" re-engagement rule would double-mail the
 * people most likely to leave.
 */
export function decideLifecycleEmail(
  c: LifecycleCandidate,
  now: Date = new Date(),
): LifecycleDecision | null {
  const t = LIFECYCLE_EMAIL_TUNING;
  const day = utcDay(now);
  const utcHour = now.getUTCHours();
  const daysAway = daysSince(c.lastActivityAt, now);

  if (
    c.dailyStreak > 0 &&
    !practisedToday(c, now) &&
    utcHour >= t.streakSaverFromUtcHour &&
    utcHour <= t.streakSaverUntilUtcHour &&
    allowed(c, "streak_saver", now)
  ) {
    return {
      kind: "streak_saver",
      userId: c.userId,
      idempotencyKey: `streak_saver:${c.userId}:${day}`,
      streakDays: c.dailyStreak,
      hoursLeft: 24 - utcHour,
    };
  }

  // Everything below is non-urgent, so it waits for the user's own digest hour
  // and respects the global quiet window.
  const quiet = hoursSinceAnySend(c, now) >= t.quietHoursBetweenAnyKind;
  if (!quiet || c.localHour !== c.digestHour) return null;

  if (
    c.localWeekday === t.weeklyReportWeekday &&
    daysAway <= t.weeklyReportMaxDaysAway &&
    allowed(c, "weekly_report", now)
  ) {
    return {
      kind: "weekly_report",
      userId: c.userId,
      idempotencyKey: `weekly_report:${c.userId}:${day}`,
      since: new Date(now.getTime() - 7 * DAY_MS).toISOString(),
    };
  }

  if (
    c.dailyStreak === 0 &&
    daysAway >= t.reEngagementMinDaysAway &&
    daysAway <= t.reEngagementMaxDaysAway &&
    allowed(c, "re_engagement", now)
  ) {
    return {
      kind: "re_engagement",
      userId: c.userId,
      idempotencyKey: `re_engagement:${c.userId}:${day}`,
      daysAway,
      topic: c.lastTopic,
    };
  }

  return null;
}

/** The decisions for a page of candidates, with the silent ones dropped. */
export function decideLifecycleEmails(
  candidates: LifecycleCandidate[],
  now: Date = new Date(),
): LifecycleDecision[] {
  const out: LifecycleDecision[] = [];
  for (const c of candidates) {
    const decision = decideLifecycleEmail(c, now);
    if (decision) out.push(decision);
  }
  return out;
}
