import { useEffect, useState } from "react";
import {
  getSessionElapsedMs,
  pauseSession,
  resumeSession,
  isSessionActive,
} from "@/lib/luna-context";

/**
 * Live-updating Luna session timer.
 *
 * Why this exists: the old `getSessionDuration()` was computed once during
 * render, so the "12m session" badge stayed frozen between user messages.
 * This hook re-renders the consumer every second (configurable) and also
 * pauses the timer when the browser tab is hidden - a Luna session left in
 * a background tab for hours no longer comes back claiming a 5-hour run.
 *
 * The state object intentionally exposes the raw ms in addition to the
 * formatted minutes so callers can choose their own display granularity.
 */
export function useLunaSessionTimer(
  options: {
    /** Update interval in ms. Default 1000 - cheap, smooth, and lines up
     *  with the seconds -> minutes flip people expect. */
    tickMs?: number;
    /** Pause when document.hidden becomes true. Default on. */
    pauseOnHidden?: boolean;
    /** Pause the timer immediately. The hook will resume it on unmount only
     *  if it owned the pause; manual pauses via pauseSession() are unaffected.*/
    paused?: boolean;
  } = {},
) {
  const { tickMs = 1000, pauseOnHidden = true, paused = false } = options;
  const [elapsedMs, setElapsedMs] = useState<number>(getSessionElapsedMs);

  // Tick loop. We read elapsed straight from the source of truth each
  // tick instead of accumulating locally so the component always agrees
  // with the global luna context (which other code may also pause/resume).
  useEffect(() => {
    const tick = () => setElapsedMs(getSessionElapsedMs());
    tick();
    const id = window.setInterval(tick, tickMs);
    return () => window.clearInterval(id);
  }, [tickMs]);

  // Tab-visibility pause. We only pause when the tab is hidden and we
  // were already active; we only resume when the tab returns AND we
  // were the ones who paused it.
  useEffect(() => {
    if (!pauseOnHidden) return;
    let pausedByUs = false;
    const handler = () => {
      if (document.hidden) {
        if (isSessionActive()) {
          pauseSession();
          pausedByUs = true;
        }
      } else if (pausedByUs) {
        resumeSession();
        pausedByUs = false;
        setElapsedMs(getSessionElapsedMs());
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => {
      document.removeEventListener("visibilitychange", handler);
      // If we were the ones who paused and we're unmounting while still
      // hidden, leave the pause in place - coming back to the page should
      // resume cleanly via the freshly-mounted hook.
    };
  }, [pauseOnHidden]);

  // Explicit caller-driven pause toggle.
  useEffect(() => {
    if (paused) {
      if (isSessionActive()) pauseSession();
    } else {
      if (!isSessionActive()) resumeSession();
    }
  }, [paused]);

  return {
    elapsedMs,
    elapsedSeconds: Math.floor(elapsedMs / 1000),
    elapsedMinutes: elapsedMs / 60_000,
    /** Human-friendly label: "32s", "1m 04s", "12m", "1h 03m". */
    label: formatElapsed(elapsedMs),
    active: isSessionActive(),
  };
}

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  if (m < 60) {
    const s = totalSec % 60;
    // Only show seconds in the first 10 minutes - beyond that the seconds
    // counter just adds noise.
    return m < 10 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${m}m`;
  }
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${h}h ${rem.toString().padStart(2, "0")}m`;
}
