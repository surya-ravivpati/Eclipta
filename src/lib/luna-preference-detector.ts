/**
 * Lightweight client-side detector for tutoring-style preferences the user
 * states in chat. We capture intent ("write shorter", "use more analogies",
 * "answer in Spanish") as a short imperative phrase, then merge it into
 * user_profiles.luna_notes so Luna sees it on every future reply.
 *
 * This is intentionally heuristic — false positives are cheap (the user can
 * edit notes from /profile) and false negatives just mean the preference
 * doesn't auto-stick. Anything heavier (LLM extraction) would double our
 * AI bill on every turn.
 */

const TRIGGER_PATTERNS: { rx: RegExp; build: (m: RegExpMatchArray) => string }[] = [
  // Length / brevity
  { rx: /\b(?:can you |could you |please )?(?:write|reply|answer|explain|respond) (?:in )?(?:much )?(shorter|longer|briefer|more concise|more detailed)(?: bursts?| messages?| responses?| replies?)?/i,
    build: m => `${m[1].toLowerCase()} responses` },
  { rx: /\b(?:keep it|be|stay) (short|brief|concise|detailed|thorough)\b/i,
    build: m => `${m[1].toLowerCase()} responses` },
  { rx: /\b(?:fewer|less|more) (words|sentences|paragraphs|hints|examples|analogies|steps|details)\b/i,
    build: m => `${m[0].toLowerCase()}` },
  // Style / framing
  { rx: /\buse (more |fewer |less )?(analogies|metaphors|examples|diagrams|code|equations|stories|real[- ]world examples)\b/i,
    build: m => m[0].toLowerCase() },
  { rx: /\b(?:no|stop using|skip|don't use|avoid) (analogies|metaphors|examples|emojis|jokes|sports analogies|code|equations)\b/i,
    build: m => `avoid ${m[1].toLowerCase()}` },
  { rx: /\b(?:explain|teach) (?:it )?(?:like|as if) (?:i'?m|i am) (a )?([\w\s-]{3,40})\b/i,
    build: m => `explain like I'm ${m[2].trim().toLowerCase()}` },
  // Language
  { rx: /\b(?:answer|reply|respond|write|talk to me) (?:in|using) (english|spanish|french|german|portuguese|italian|chinese|japanese|korean|hindi|arabic|dutch|polish|swedish|norwegian|finnish|danish|turkish|russian|greek|hebrew)\b/i,
    build: m => `respond in ${m[1].toLowerCase()}` },
  // Hints
  { rx: /\b(?:give me|just give|just tell|stop with|skip) (?:the )?(?:full )?(answer|hints|hint)s?\b/i,
    build: m => /answer/i.test(m[0]) ? "ok to give direct answers when asked" : "fewer hints" },
  // Tone
  { rx: /\b(?:be more|sound more|talk more) (formal|casual|technical|friendly|serious|playful|encouraging)\b/i,
    build: m => `${m[1].toLowerCase()} tone` },
];

/**
 * Extract a short normalized preference phrase from a user message.
 * Returns null when nothing preference-like was detected.
 */
export function extractPreference(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length < 4 || trimmed.length > 400) return null;
  for (const { rx, build } of TRIGGER_PATTERNS) {
    const m = trimmed.match(rx);
    if (m) {
      const phrase = build(m).replace(/\s+/g, " ").trim();
      if (phrase.length >= 3 && phrase.length <= 80) return phrase;
    }
  }
  return null;
}

/**
 * Merge a freshly-detected preference into the existing notes blob without
 * duplicating, while preserving order (newest pinned to top, max 12 items).
 */
export function mergePreference(existing: string | null, fresh: string): string {
  const lines = (existing || "")
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const dup = lines.findIndex(l => norm(l) === norm(fresh));
  if (dup === 0) return lines.join("\n");
  if (dup > 0) lines.splice(dup, 1);
  lines.unshift(fresh);
  return lines.slice(0, 12).join("\n");
}