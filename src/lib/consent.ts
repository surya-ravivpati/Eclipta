/**
 * Cookie / storage consent state.
 *
 * Split from the banner component so that file exports a component and nothing
 * else — React Fast Refresh cannot preserve state across edits in a module that
 * mixes component and non-component exports.
 */

const KEY = "eclipta:consent";

export type ConsentChoice = "accepted" | "essential-only";

export function readConsent(): ConsentChoice | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(KEY);
  return v === "accepted" || v === "essential-only" ? v : null;
}

export function recordConsent(choice: ConsentChoice): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, choice);
}

/**
 * True only when the user has affirmatively agreed to non-essential storage.
 * Absence of a choice is NOT consent, so this returns false until they decide.
 */
export function hasOptionalConsent(): boolean {
  return readConsent() === "accepted";
}
