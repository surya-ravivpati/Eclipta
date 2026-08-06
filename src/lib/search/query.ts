/**
 * Query understanding: turn what the user typed into a needle plus filters.
 *
 * Typo tolerance lives in Postgres (pg_trgm). This layer handles the two things
 * the database cannot infer: **intent** ("physics battles" means battles about
 * physics, not the word "battles") and **vocabulary** ("prof" and "teacher"
 * should both find people).
 *
 * Deliberately rules over an LLM call. Search has to feel instant, and a network
 * round trip to a model before the query even runs would cost more than the
 * search itself. These patterns cover the phrasings people actually type into a
 * search box, which are short and predictable.
 */

export type SearchKind = "course" | "lesson" | "thread" | "user" | "group" | "battle" | "note";

export const ALL_KINDS: SearchKind[] = [
  "course",
  "lesson",
  "thread",
  "user",
  "group",
  "battle",
  "note",
];

/**
 * Words that name a kind. Matching one in the query both filters the results and
 * removes the word from the needle — searching "physics battles" for the literal
 * string "battles" would rank a thread titled "battles" above every physics
 * battle, which is the opposite of what was asked.
 */
const KIND_WORDS: Record<SearchKind, string[]> = {
  course: ["course", "courses", "class", "classes", "syllabus", "curriculum"],
  lesson: ["lesson", "lessons", "module", "modules", "topic", "topics", "chapter", "chapters"],
  thread: [
    "thread",
    "threads",
    "post",
    "posts",
    "forum",
    "question",
    "questions",
    "discussion",
    "reply",
    "replies",
    "answer",
    "answers",
  ],
  user: [
    "user",
    "users",
    "person",
    "people",
    "friend",
    "friends",
    "classmate",
    "classmates",
    "teacher",
    "teachers",
    "mentor",
    "mentors",
    "prof",
    "professor",
    "tutor",
  ],
  group: [
    "group",
    "groups",
    "room",
    "rooms",
    "study room",
    "study rooms",
    "club",
    "clubs",
    "team",
    "teams",
  ],
  battle: ["battle", "battles", "duel", "duels", "match", "matches", "fight", "fights", "history"],
  note: ["note", "notes", "explanation", "explanations", "ai", "luna", "conversation", "chat"],
};

/**
 * Subject-matter synonyms, so a query finds content filed under a different
 * word than the one the user reached for. One-directional on purpose: expanding
 * "maths" to "mathematics" helps, but expanding every "calculus" to "maths"
 * would flood the results with the whole subject.
 */
const SYNONYMS: Record<string, string[]> = {
  maths: ["mathematics", "math"],
  math: ["mathematics", "maths"],
  bio: ["biology"],
  chem: ["chemistry"],
  phys: ["physics"],
  cs: ["computer science", "programming"],
  ml: ["machine learning"],
  ai: ["artificial intelligence"],
  integration: ["integral", "integrals", "calculus"],
  derivative: ["differentiation", "calculus"],
  vectors: ["vector", "linear algebra"],
  matrices: ["matrix", "linear algebra"],
  probability: ["stats", "statistics"],
  stats: ["statistics", "probability"],
  algo: ["algorithm", "algorithms"],
  db: ["database", "databases"],
};

/** Filler that carries intent for a human but only noise for a trigram match. */
const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "my",
  "me",
  "i",
  "of",
  "for",
  "about",
  "on",
  "in",
  "with",
  "to",
  "from",
  "show",
  "find",
  "search",
  "get",
  "all",
  "any",
  "that",
  "which",
  "who",
  "what",
  "is",
  "are",
  "was",
  "were",
  "and",
  "or",
  "studying",
  "study",
  "explained",
  "explain",
  "learn",
  "learning",
  "previous",
  "recent",
  "saved",
]);

export interface ParsedQuery {
  /** What to send to Postgres as the needle. */
  needle: string;
  /** Kinds inferred from the phrasing; empty means "search everything". */
  kinds: SearchKind[];
  /** Extra needles from synonym expansion, searched as alternatives. */
  expansions: string[];
  /** The original input, kept verbatim for recents and highlighting. */
  raw: string;
  /** True when a kind was inferred rather than chosen from a filter chip. */
  inferredKinds: boolean;
}

/**
 * Parse a raw query.
 *
 * "physics battles"          → needle "physics", kinds [battle]
 * "integration lesson"       → needle "integration", kinds [lesson], + integral/integrals/calculus
 * "AI explained vectors"     → needle "vectors",  kinds [note],   + vector/linear algebra
 * "friends studying chemistry" → needle "chemistry", kinds [user], no expansion
 *   (SYNONYMS only maps "chem" → "chemistry", not the reverse, so a query
 *   that already says the full word gets no synonym boost - by design, see
 *   the SYNONYMS comment below, but worth knowing this example doesn't
 *   expand even though it looks like it should)
 */
export function parseQuery(raw: string, explicitKinds: SearchKind[] = []): ParsedQuery {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();

  const kinds = new Set<SearchKind>(explicitKinds);
  let remaining = ` ${lower} `;

  // Longest phrases first, so "study rooms" is consumed before "rooms".
  const entries: [SearchKind, string][] = [];
  for (const [kind, words] of Object.entries(KIND_WORDS) as [SearchKind, string[]][]) {
    for (const w of words) entries.push([kind, w]);
  }
  entries.sort((a, b) => b[1].length - a[1].length);

  let inferred = false;
  for (const [kind, word] of entries) {
    const pattern = new RegExp(`\\s${escapeRegex(word)}\\s`, "g");
    if (pattern.test(remaining)) {
      // Only infer when an explicit chip has not already decided the scope —
      // a chosen filter is a stronger signal than a guessed one.
      if (explicitKinds.length === 0) {
        kinds.add(kind);
        inferred = true;
      }
      remaining = remaining.replace(pattern, " ");
    }
  }

  const words = remaining
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w));

  // If stripping left nothing, the query was *only* an intent word ("battles").
  // Fall back to the original text so the search still returns that category
  // rather than silently returning nothing.
  const needle = words.length > 0 ? words.join(" ") : lower;

  const expansions = new Set<string>();
  for (const w of words) {
    for (const syn of SYNONYMS[w] ?? []) expansions.add(syn);
  }

  return {
    needle,
    kinds: [...kinds],
    expansions: [...expansions],
    raw: trimmed,
    inferredKinds: inferred,
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Split a string into matched and unmatched runs for highlighting.
 *
 * Returns segments rather than HTML so the caller renders real elements — never
 * `dangerouslySetInnerHTML`, which would make every searchable title (thread
 * bodies, usernames, course summaries) an XSS vector.
 */
export interface Segment {
  text: string;
  match: boolean;
}

export function highlight(text: string, needle: string): Segment[] {
  const n = needle.trim();
  if (!n) return [{ text, match: false }];

  // Match any of the needle's words, so "linear algebra" highlights both halves
  // even when the title interleaves other words between them.
  const terms = n
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .map(escapeRegex);
  if (terms.length === 0) return [{ text, match: false }];

  const re = new RegExp(`(${terms.join("|")})`, "gi");
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index;
    if (i > last) out.push({ text: text.slice(last, i), match: false });
    out.push({ text: m[0], match: true });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), match: false });
  return out.length > 0 ? out : [{ text, match: false }];
}
