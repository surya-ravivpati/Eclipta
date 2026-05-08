/**
 * Lightweight profanity / slur filter used for usernames and forum content.
 *
 * This is intentionally a small, hand-curated list — it is *not* a complete
 * moderation solution, but it catches the obvious offenders without shipping
 * a megabyte word-list to the client. Server-side review still happens via
 * forum_reports + moderator tooling.
 */

// Base offensive tokens. Keep lowercase, no punctuation.
const BAD_WORDS: string[] = [
  // racial / homophobic slurs
  "nigger", "nigga", "chink", "spic", "kike", "gook", "wetback", "tranny",
  "faggot", "fag", "dyke", "retard", "retarded",
  // generic profanity
  "fuck", "fucker", "fucking", "shit", "bitch", "bastard", "cunt", "asshole",
  "dick", "cock", "pussy", "whore", "slut", "motherfucker",
  // sexual / disturbing
  "rape", "rapist", "pedo", "pedophile", "molest",
  // self-harm baiting
  "kys", "killyourself",
];

// Common leet-speak substitutions used to bypass naive filters.
const LEET_MAP: Record<string, string> = {
  "0": "o", "1": "i", "!": "i", "3": "e", "4": "a", "@": "a",
  "5": "s", "$": "s", "7": "t", "8": "b", "9": "g",
};

function normalize(s: string): string {
  let out = s.toLowerCase();
  out = out.replace(/[0-9!@$]/g, (c) => LEET_MAP[c] ?? c);
  // collapse repeated chars: "fuuuuck" -> "fuck"
  out = out.replace(/(.)\1{2,}/g, "$1$1");
  // strip non-letters so "f.u.c.k" / "f_u_c_k" fall apart into "fuck"
  out = out.replace(/[^a-z]/g, "");
  return out;
}

/**
 * Returns the offending word if `value` contains a banned token, or null.
 * Matches against a normalized form so most basic obfuscations still trip.
 */
export function findProfanity(value: string): string | null {
  if (!value) return null;
  const flat = normalize(value);
  if (!flat) return null;
  for (const word of BAD_WORDS) {
    if (flat.includes(word)) return word;
  }
  return null;
}

export function containsProfanity(value: string): boolean {
  return findProfanity(value) !== null;
}

/** Username-specific check — also rejects banned words split across tokens. */
export function isCleanUsername(value: string): { ok: true } | { ok: false; reason: string } {
  const hit = findProfanity(value);
  if (hit) return { ok: false, reason: "Username contains language we don't allow." };
  return { ok: true };
}

/** Forum content check — returns user-facing reason on failure. */
export function isCleanForumContent(value: string): { ok: true } | { ok: false; reason: string } {
  const hit = findProfanity(value);
  if (hit) return { ok: false, reason: "Please rephrase — your post contains language we don't allow." };
  return { ok: true };
}