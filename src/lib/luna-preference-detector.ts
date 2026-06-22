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
  // "just give me the answer" is transient frustration, not a durable
  // preference — never persist it as a standing instruction (that would defeat
  // Luna's core never-give-the-answer mechanic). Escalation is handled live by
  // hintLevel instead. Only the "fewer hints" intent persists, and it means
  // "get concrete faster", not "skip to the answer".
  { rx: /\b(?:give me|just give|just tell|stop with|skip) (?:the )?(?:full )?(answer|hints|hint)s?\b/i,
    build: m => /answer/i.test(m[0]) ? "" : "get to concrete, specific guidance faster" },
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
 * Coarse category for a preference line. Used by mergePreference to drop
 * stale entries that the user has just contradicted ("shorter responses"
 * gets replaced when they later say "longer responses"). Returns null when
 * the line doesn't map to a recognisable category — in which case we leave
 * older lines alone and only dedupe by text.
 */
export function preferenceCategory(line: string): string | null {
  const t = line.toLowerCase().trim();
  if (/respond in\s+\w+/.test(t)) return "language";
  if (/\b(short|long|brief|concise|detailed|thorough)\b.*responses?/.test(t)) return "length";
  if (/\b(short|brief|concise|detailed|thorough) responses?/.test(t)) return "length";
  if (/\b(fewer|less|more)\s+(words|sentences|paragraphs|details|steps)\b/.test(t)) return "length";
  if (/analog/.test(t)) return "analogies";
  if (/example/.test(t)) return "examples";
  if (/\b(hint|hints)\b/.test(t) || /get to concrete/.test(t)) return "hints";
  if (/\btone\b/.test(t)) return "tone";
  if (/^explain like i'?m/.test(t)) return "level";
  if (/emoji/.test(t)) return "emoji";
  if (/\b(code|equations?)\b/.test(t)) return "format";
  if (/diagram|story|real[- ]world/.test(t)) return "examples";
  return null;
}

/**
 * Merge a freshly-detected preference into the existing notes blob:
 *  - dedupe by normalised text (case + punctuation insensitive)
 *  - if the fresh line has a known category, drop any older line in the same
 *    category so the newest instruction wins (no stale "shorter responses"
 *    sitting next to "longer responses")
 *  - cap at 12 lines, newest pinned to top
 */
export function mergePreference(existing: string | null, fresh: string): string {
  const lines = (existing || "")
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const freshCat = preferenceCategory(fresh);
  const filtered = lines.filter(l => {
    if (norm(l) === norm(fresh)) return false;
    if (freshCat && preferenceCategory(l) === freshCat) return false;
    return true;
  });
  filtered.unshift(fresh);
  return filtered.slice(0, 12).join("\n");
}