import type { PressureEvent } from "./metrics";

/**
 * Exam-condition integrity.
 *
 * -- What a browser can and cannot do ----------------------------------------
 * The brief asks for fullscreen, no pausing and navigation restrictions. A web
 * page **cannot enforce any of those**, and it is important the product does not
 * pretend otherwise:
 *
 *   - Fullscreen is user-revocable by design. Escape always exits, and the spec
 *     forbids a page from blocking it or re-entering without a fresh gesture.
 *   - Nothing can prevent alt-tab, a second monitor, a phone beside the laptop,
 *     or a screenshot. `visibilitychange` tells you focus was lost; it cannot
 *     tell you why, and it fires for a notification banner as readily as for
 *     cheating.
 *   - "No pausing" is enforceable for *our* timer - it runs off wall-clock, so
 *     closing the tab does not stop it - but not for the learner's attention.
 *
 * Real lockdown needs a native client or a proctoring service. So this module
 * does the honest thing: it **observes and records**, surfaces what it saw in
 * the review, and never accuses. That is genuinely useful - a learner who
 * discovers they lost focus nine times in a mock exam has learned something
 * real about their own conditions - and it does not lie about being proctoring.
 */

export interface IntegrityState {
  fullscreen: boolean;
  focusLostCount: number;
  fullscreenExitCount: number;
  /** Total seconds the tab spent hidden. */
  hiddenSeconds: number;
}

export interface IntegrityMonitor {
  state: () => IntegrityState;
  stop: () => void;
}

/**
 * Start observing. Returns a stop function; the caller owns the lifecycle.
 *
 * `onEvent` receives every signal so it lands in the same event log the score
 * reads, which is what lets the review put a focus loss on the same timeline as
 * the question it happened during.
 */
export function startIntegrityMonitor(
  onEvent: (e: PressureEvent) => void,
  onFocusLost?: () => void,
): IntegrityMonitor {
  const s: IntegrityState = {
    fullscreen: Boolean(document.fullscreenElement),
    focusLostCount: 0,
    fullscreenExitCount: 0,
    hiddenSeconds: 0,
  };
  let hiddenAt: number | null = null;

  const onVisibility = () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      s.focusLostCount += 1;
      onEvent({ at: Date.now(), kind: "focus_lost" });
      onFocusLost?.();
    } else {
      if (hiddenAt !== null) s.hiddenSeconds += (Date.now() - hiddenAt) / 1000;
      hiddenAt = null;
      onEvent({ at: Date.now(), kind: "focus_regained" });
    }
  };

  const onFullscreenChange = () => {
    const now = Boolean(document.fullscreenElement);
    if (s.fullscreen && !now) {
      s.fullscreenExitCount += 1;
      onEvent({ at: Date.now(), kind: "fullscreen_exit" });
    }
    s.fullscreen = now;
  };

  document.addEventListener("visibilitychange", onVisibility);
  document.addEventListener("fullscreenchange", onFullscreenChange);

  return {
    state: () => ({ ...s }),
    stop: () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    },
  };
}

/**
 * Request fullscreen. Must be called from a user gesture or the browser refuses.
 *
 * Resolves false rather than throwing when unavailable - iOS Safari does not
 * support fullscreen on arbitrary elements at all, and a mock exam that cannot
 * start on an iPhone is worse than one that runs windowed.
 */
export async function enterFullscreen(el: HTMLElement): Promise<boolean> {
  if (!el.requestFullscreen) return false;
  try {
    await el.requestFullscreen({ navigationUI: "hide" });
    return true;
  } catch {
    return false;
  }
}

export async function exitFullscreen(): Promise<void> {
  if (document.fullscreenElement) {
    try {
      await document.exitFullscreen();
    } catch {
      // Nothing to recover: the user is already out.
    }
  }
}

/**
 * A wall-clock deadline.
 *
 * Deliberately *not* an accumulating interval. A `setInterval` that ticks a
 * counter drifts, and browsers throttle timers in background tabs to once a
 * minute - so a learner who switched tabs would come back to a clock that had
 * barely moved. Storing the end instant and diffing against `Date.now()` means
 * the exam runs in real time whatever the tab does, which is the actual meaning
 * of "no pausing".
 */
export class ExamClock {
  private readonly endsAt: number;
  private readonly breaks: { start: number; end: number }[] = [];

  constructor(durationSeconds: number) {
    this.endsAt = Date.now() + durationSeconds * 1000;
  }

  /** Scheduled breaks stop the clock; nothing else does. */
  startBreak(): void {
    this.breaks.push({ start: Date.now(), end: 0 });
  }

  endBreak(): void {
    const open = this.breaks.find((b) => b.end === 0);
    if (open) open.end = Date.now();
  }

  private breakMs(): number {
    return this.breaks.reduce((a, b) => a + ((b.end || Date.now()) - b.start), 0);
  }

  remainingSeconds(): number {
    return Math.max(0, Math.round((this.endsAt + this.breakMs() - Date.now()) / 1000));
  }

  expired(): boolean {
    return this.remainingSeconds() <= 0;
  }

  onBreak(): boolean {
    return this.breaks.some((b) => b.end === 0);
  }
}

/** Human-readable summary of what the monitor saw, for the review screen. */
export function describeIntegrity(s: IntegrityState): string[] {
  const out: string[] = [];
  if (s.focusLostCount > 0) {
    out.push(
      `You left the window ${s.focusLostCount} ${s.focusLostCount === 1 ? "time" : "times"}` +
        (s.hiddenSeconds >= 5 ? `, for about ${Math.round(s.hiddenSeconds)}s in total.` : "."),
    );
  }
  if (s.fullscreenExitCount > 0) {
    out.push(
      `Fullscreen was exited ${s.fullscreenExitCount} ${s.fullscreenExitCount === 1 ? "time" : "times"}.`,
    );
  }
  if (out.length === 0) out.push("You stayed in the session the whole way through.");
  return out;
}
