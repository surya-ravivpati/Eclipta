/**
 * How strong a password is, and how to say so.
 *
 * Kept out of the component that draws the meter because the signup form also
 * calls it to decide whether to accept a password at all - a rule that has
 * nothing to do with rendering, and that should be testable without React.
 */

export type StrengthScore = 0 | 1 | 2 | 3 | 4;

export interface StrengthResult {
  score: StrengthScore;
  label: string;
  color: string;
}

/**
 * Keyed by the score union rather than held in an array, so every score has a
 * presentation by construction - there is no index that could come back
 * undefined, and adding a score to the union breaks this table until it is
 * given one. Palette runs red (functional weak) -> blue -> gold (strong).
 */
const PRESENTATION: Record<StrengthScore, { label: string; color: string }> = {
  0: { label: "Too weak", color: "bg-destructive" },
  1: { label: "Weak", color: "bg-destructive" },
  2: { label: "Fair", color: "bg-neon-cyan" },
  3: { label: "Strong", color: "bg-neon-cyan" },
  4: { label: "Excellent", color: "bg-primary" },
};

export function scorePassword(pw: string): StrengthResult {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  const capped = Math.min(score, 4) as StrengthScore;
  return { score: capped, ...PRESENTATION[capped] };
}
