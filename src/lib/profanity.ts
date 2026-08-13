/**
 * Client-side moderation pre-filter.
 *
 * This file is intentionally NOT the source of truth - the authoritative
 * moderation runs server-side (the `moderate-content` edge function plus the
 * `forum_content_moderation_trigger` Postgres trigger). What lives here is:
 *
 *   1. A fast local check so the UI can show "please rephrase" instantly
 *      without a round-trip when the user types something obviously bad.
 *   2. A normalisation routine that mirrors `normalize_for_moderation()` in
 *      Postgres, so the client and server agree on what "obvious" means.
 *
 * The list intentionally stays small. The server can flag many more things
 * via the AI classifier; this local pass just trips on the unambiguous
 * cases (slurs, self-harm bait) where the user shouldn't even get a network
 * round-trip's worth of optimism.
 */

const BAD_WORDS: string[] = [
  // racial / homophobic slurs (mirror moderation_terms severity >= 8)
  "nigger",
  "nigga",
  "chink",
  "spic",
  "kike",
  "gook",
  "wetback",
  "tranny",
  "faggot",
  "fag",
  "dyke",
  "retard",
  "retarded",
  // generic profanity (severity 5)
  "fuck",
  "fucker",
  "fucking",
  "shit",
  "bitch",
  "bastard",
  "cunt",
  "asshole",
  "dick",
  "cock",
  "pussy",
  "whore",
  "slut",
  "motherfucker",
  // sexual / disturbing
  "rape",
  "rapist",
  "pedo",
  "pedophile",
  "molest",
  "childporn",
  // self-harm baiting
  "kys",
  "killyourself",
  "killurself",
  "hangyourself",
];

// Leet-speak substitutions - same source/target lengths so each char maps
// deterministically. Must mirror the Postgres translate() in
// normalize_for_moderation().
const LEET_MAP: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
  "!": "i",
  "@": "a",
  $: "s",
};

// Cyrillic / Greek look-alikes -> Latin. Same set as the server function.
const HOMOGLYPH_MAP: Record<string, string> = {
  // Cyrillic
  а: "a",
  е: "e",
  о: "o",
  р: "p",
  с: "c",
  х: "x",
  у: "y",
  к: "k",
  й: "j",
  і: "i",
  // Greek
  α: "a",
  ε: "e",
  ο: "o",
  ρ: "p",
  υ: "y",
  ν: "n",
  ι: "i",
  κ: "k",
};

// Zero-width characters & non-standard spaces. Removing these stops the
// invisible-glue trick where users insert U+200B between letters of a
// banned word so a naive contains() check misses it. Listing the chars by
// codepoint keeps the source file ASCII-clean.
//   U+200B ZWSP, U+200C ZWNJ, U+200D ZWJ, U+200E LRM, U+200F RLM,
//   U+00A0 NBSP, U+202F narrow NBSP, U+FEFF BOM.
// eslint-disable-next-line no-irregular-whitespace
const ZERO_WIDTH_RE = /[​-‏  ﻿]/g;
const HOMOGLYPH_RE = /[Ѐ-ӿͰ-Ͽ]/g;

/**
 * Aggressively flatten text so obfuscated profanity collapses onto its
 * dictionary form. Order matters: zero-width strip first (otherwise leet
 * substitution can't see across the gaps), then homoglyphs (so the Cyrillic
 * spelling of a slur becomes its Latin form), then digits/symbols, then
 * repeated char collapse, then non-letter strip.
 */
function normalize(s: string): string {
  if (!s) return "";
  let out = s.toLowerCase();
  out = out.replace(ZERO_WIDTH_RE, "");
  out = out.replace(HOMOGLYPH_RE, (c) => HOMOGLYPH_MAP[c] ?? c);
  out = out.replace(/[0134578!@$]/g, (c) => LEET_MAP[c] ?? c);
  // Collapse runs of >=3 identical chars: "fuuuuck" -> "fuuck" (still matches).
  out = out.replace(/(.)\1{2,}/g, "$1$1");
  // Strip everything that isn't a-z so spacing / punctuation tricks fall apart.
  out = out.replace(/[^a-z]/g, "");
  return out;
}

/** Returns the first banned term found in normalised form, or null. */
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

/** Exposed so callers can echo the same normalisation the server uses. */
export function normalizeForModeration(value: string): string {
  return normalize(value);
}

export function isCleanUsername(value: string): { ok: true } | { ok: false; reason: string } {
  const hit = findProfanity(value);
  if (hit) return { ok: false, reason: "Username contains language we don't allow." };
  return { ok: true };
}

export function isCleanForumContent(value: string): { ok: true } | { ok: false; reason: string } {
  const hit = findProfanity(value);
  if (hit)
    return { ok: false, reason: "Please rephrase - your post contains language we don't allow." };
  return { ok: true };
}
