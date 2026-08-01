/**
 * Accessibility preferences and helpers.
 *
 * Two things live here: the user-facing Reduce Motion preference (which layers
 * on top of the OS `prefers-reduced-motion` rather than replacing it), and the
 * announcement channel screen readers listen to.
 */

const MOTION_KEY = "eclipta:motion";

export type MotionPreference = "system" | "reduce" | "full";

export function getMotionPreference(): MotionPreference {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(MOTION_KEY);
  return stored === "reduce" || stored === "full" ? stored : "system";
}

/**
 * Persist the preference and reflect it on `<html data-motion>`, which the
 * stylesheet reads. "system" removes the attribute so the OS media query is
 * the only signal; "full" opts *out* of reduced motion even when the OS asks
 * for it, which some users with vestibular-safe setups prefer.
 */
export function setMotionPreference(pref: MotionPreference): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MOTION_KEY, pref);
  applyMotionPreference(pref);
}

export function applyMotionPreference(pref: MotionPreference = getMotionPreference()): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-motion");
  else root.setAttribute("data-motion", pref);
}

/** True when motion should be suppressed right now, for JS-driven animation. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  const pref = getMotionPreference();
  if (pref === "reduce") return true;
  if (pref === "full") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ─── Screen-reader announcements ─────────────────────────────────────────────

/**
 * Announce a message in the shell's live region.
 *
 * `polite` waits for the reader to finish its current sentence and is right for
 * almost everything (XP gained, a saved draft). `assertive` interrupts and is
 * reserved for things the user must hear immediately — a battle ending, an
 * error that blocks them. Over-using assertive makes an app unusable with a
 * screen reader, so the default is polite.
 */
export type Politeness = "polite" | "assertive";

const REGION_ID: Record<Politeness, string> = {
  polite: "a11y-live-polite",
  assertive: "a11y-live-assertive",
};

export function announce(message: string, politeness: Politeness = "polite"): void {
  if (typeof document === "undefined" || message.trim() === "") return;
  const region = document.getElementById(REGION_ID[politeness]);
  if (!region) return;
  // Re-setting identical text does not re-announce, so clear first. The
  // microtask gap is enough for the reader to register a change.
  region.textContent = "";
  requestAnimationFrame(() => {
    region.textContent = message;
  });
}

/**
 * Format a progress value for a screen reader. A bare "70%" is ambiguous —
 * progress toward what? — so the label always carries the subject.
 */
export function progressLabel(subject: string, current: number, max: number): string {
  const pct = max > 0 ? Math.round((current / max) * 100) : 0;
  return `${subject}: ${current} of ${max}, ${pct} percent`;
}
