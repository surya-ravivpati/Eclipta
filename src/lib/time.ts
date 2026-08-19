/**
 * Relative timestamps.
 *
 * One function, because there were four - in `lib/time.ts`, `lib/notifications.ts`,
 * `AnswerComments.tsx` and `FollowingFeedCard.tsx` - producing three different
 * formats from the same arithmetic. Two of them also disagreed about what to
 * call the first sixty seconds.
 *
 * The two real variants are kept as options rather than as copies:
 * forum-style timestamps read "5m ago" and want the suffix; a timestamp
 * squeezed into a feed row or a notification line reads "5m" and does not.
 */

export interface TimeAgoOptions {
  /** Read "5m ago" rather than "5m". Default true. */
  suffix?: boolean;
  /**
   * Past this many days, show the date instead of a count.
   *
   * "412d ago" is arithmetic, not information - nobody counts back from it.
   * Omit to keep counting days forever, which is right where every row is
   * recent by construction.
   */
  dateAfterDays?: number;
}

export function timeAgo(iso: string, options: TimeAgoOptions = {}): string {
  const { suffix = true, dateAfterDays } = options;
  const ago = suffix ? " ago" : "";

  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return suffix ? "just now" : "now";
  if (m < 60) return `${m}m${ago}`;

  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h${ago}`;

  const d = Math.floor(h / 24);
  if (dateAfterDays !== undefined && d >= dateAfterDays) {
    return new Date(iso).toLocaleDateString();
  }
  return `${d}d${ago}`;
}
