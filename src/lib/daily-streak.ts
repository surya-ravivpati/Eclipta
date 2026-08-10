/**
 * Daily-practice streak — pure display + milestone helpers.
 *
 * The streak itself (consecutive UTC days with practice) is computed
 * server-side by the record_daily_practice RPC; this module only interprets
 * the stored state for the UI. See docs/daily-practice-streak.md.
 */

export interface StreakState {
  dailyStreak: number;
  longestDailyStreak: number;
  streakFreezes: number;
  /** ISO date (UTC) of the last practice day, or null. */
  lastPracticeDate: string | null;
  /** Rolling history of practiced UTC days (YYYY-MM-DD), for the calendar. */
  practiceDates: string[];
}

/** Result returned by the record_daily_practice RPC. */
export interface PracticeResult {
  daily_streak: number;
  longest_daily_streak: number;
  streak_freezes: number;
  practice_dates: string[];
  froze: boolean;
  milestone: number | null;
  milestone_reward: number;
  already: boolean;
}

export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100, 180, 365] as const;

/** Bonus XP the server grants when a milestone is newly crossed. */
export const MILESTONE_REWARDS: Record<number, number> = {
  3: 75,
  7: 150,
  14: 300,
  30: 700,
  60: 1200,
  100: 1800,
  180: 2500,
  365: 4000,
};
export function milestoneReward(milestone: number): number {
  return MILESTONE_REWARDS[milestone] ?? 0;
}

/** Today's date as a UTC YYYY-MM-DD string (matches the server's date math). */
export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Has the user already practiced today? */
export function practicedToday(
  state: Pick<StreakState, "lastPracticeDate">,
  now: Date = new Date(),
): boolean {
  return !!state.lastPracticeDate && state.lastPracticeDate === todayUtc(now);
}

/** Next milestone above the current streak, or null past the top one. */
export function nextMilestone(streak: number): number | null {
  return STREAK_MILESTONES.find((m) => m > streak) ?? null;
}

/**
 * Visual intensity tier — drives flame color/size so a 300-day streak looks
 * unmistakably different from a 7-day one (streak evolution).
 */
export type FlameTier = "ember" | "flame" | "blaze" | "inferno" | "eternal";
export function flameTier(streak: number): FlameTier {
  if (streak >= 365) return "eternal";
  if (streak >= 100) return "inferno";
  if (streak >= 30) return "blaze";
  if (streak >= 7) return "flame";
  return "ember";
}

const TIER_LABEL: Record<FlameTier, string> = {
  ember: "Ember",
  flame: "Flame",
  blaze: "Blaze",
  inferno: "Inferno",
  eternal: "Eternal Flame",
};
export function flameTierLabel(streak: number): string {
  return TIER_LABEL[flameTier(streak)];
}

/** A short, encouraging (never guilt-y) status line for the current state. */
export function streakMessage(state: StreakState, now: Date = new Date()): string {
  const done = practicedToday(state, now);
  const s = state.dailyStreak;
  if (s === 0) return "Start your streak today — one battle is all it takes.";
  if (done) {
    const next = nextMilestone(s);
    return next
      ? `Locked in for today. ${next - s} day${next - s === 1 ? "" : "s"} to your ${next}-day milestone.`
      : "Locked in for today. You're in legendary territory.";
  }
  return `Keep your ${s}-day streak alive — just one session today.`;
}

// ─── Calendar + loss-aversion helpers ───────────────────────────────────────

/** The last `n` UTC dates (YYYY-MM-DD), oldest → newest, ending today. */
export function lastNDays(n: number, now: Date = new Date()): string[] {
  const out: string[] = [];
  const base = new Date(now.toISOString().slice(0, 10) + "T00:00:00Z");
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** One-letter weekday for a YYYY-MM-DD string (UTC). */
export function weekdayLetter(iso: string): string {
  return ["S", "M", "T", "W", "T", "F", "S"][new Date(iso + "T00:00:00Z").getUTCDay()];
}

/**
 * The streak is "at risk" when there's an active streak but today hasn't been
 * practiced yet — the loss-aversion moment that drives the daily return.
 */
export function isAtRisk(
  state: Pick<StreakState, "dailyStreak" | "lastPracticeDate">,
  now: Date = new Date(),
): boolean {
  return state.dailyStreak > 0 && !practicedToday(state, now);
}

/** Urgent (but warm) line shown when the streak is on the line today. */
export function riskMessage(state: StreakState, now: Date = new Date()): string {
  const s = state.dailyStreak;
  const hoursLeft = 24 - now.getUTCHours();
  const window = hoursLeft <= 6 ? ` Only ${hoursLeft}h left today.` : "";
  if (state.streakFreezes > 0) {
    return `Your ${s}-day streak is on the line.${window} A freeze can save it once — but don't waste it. One session keeps it real.`;
  }
  return `Your ${s}-day streak is on the line and you have no freezes left.${window} One session today saves it.`;
}
