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
}

/** Result returned by the record_daily_practice RPC. */
export interface PracticeResult {
  daily_streak: number;
  longest_daily_streak: number;
  streak_freezes: number;
  froze: boolean;
  milestone: number | null;
  already: boolean;
}

export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100, 180, 365] as const;

/** Today's date as a UTC YYYY-MM-DD string (matches the server's date math). */
export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Has the user already practiced today? */
export function practicedToday(state: Pick<StreakState, "lastPracticeDate">, now: Date = new Date()): boolean {
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
