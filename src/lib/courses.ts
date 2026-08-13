/**
 * Unified course model - the single shape the Courses hub, cards, search, and
 * (later) recommendations are written against. Both the static "official"
 * catalog (src/lib/certified-courses.ts) and DB-backed "community" courses
 * (user_courses) normalize into `UnifiedCourse`, so the hub never branches on
 * where a course came from. Provenance survives only as a subtle `source` badge.
 */

import { CERTIFIED_COURSES } from "./certified-courses";

export const SUBJECTS = [
  "Mathematics",
  "Science",
  "Computer Science",
  "Engineering",
  "Humanities",
  "Business",
  "Languages",
  "Test Prep",
  "Arts",
  "Health",
  "Personal Finance",
] as const;
export type Subject = (typeof SUBJECTS)[number];

export type CourseSource = "official" | "community";

export interface UnifiedCourse {
  slug: string;
  title: string;
  summary: string;
  source: CourseSource;
  level: string;
  subject: Subject;
  tags: string[];
  rating?: number;
  enrolledCount?: number;
  cover?: string | null;
}

/** Raw row shape from the user_courses table (community courses). */
export interface CommunityCourseRow {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  level: string;
  depth?: string;
  enrolled_count: number;
  cover_image_url: string | null;
}

/* -- Subject categorization ----------------------------------------------
   Courses don't carry a subject column yet, so we infer one from title + tags
   + summary by keyword. Best-match wins; ties break by SUBJECTS order. This is
   a Phase-1 heuristic - once courses get a real `subject` field it goes away. */
const SUBJECT_KEYWORDS: Record<Subject, string[]> = {
  Mathematics: [
    "math",
    "algebra",
    "calculus",
    "geometry",
    "trigonometry",
    "statistic",
    "probability",
    "linear algebra",
    "number theory",
    "discrete",
  ],
  Science: [
    "physics",
    "chemistry",
    "biology",
    "quantum",
    "genetics",
    "cell",
    "astronomy",
    "neuroscience",
    "science",
    "molecular",
    "ecology",
  ],
  "Computer Science": [
    "python",
    "java",
    "javascript",
    "programming",
    "coding",
    "code",
    "algorithm",
    "data structure",
    "machine learning",
    "deep learning",
    "computing",
    "software",
    "web dev",
    "database",
    "cybersecurity",
    "security",
    "systems design",
    "distributed",
    "artificial intelligence",
  ],
  Engineering: [
    "engineering",
    "robotics",
    "mechanical",
    "electrical",
    "civil engineering",
    "circuits",
    "control systems",
    "aerospace",
  ],
  Humanities: [
    "history",
    "philosophy",
    "psychology",
    "literature",
    "writing",
    "english",
    "sociology",
    "ethics",
    "political",
    "anthropology",
  ],
  Business: [
    "business",
    "economics",
    "marketing",
    "management",
    "entrepreneur",
    "accounting",
    "strategy",
    "leadership",
  ],
  Languages: [
    "spanish",
    "french",
    "german",
    "mandarin",
    "chinese",
    "japanese",
    "language",
    "grammar",
    "vocabulary",
    "linguistics",
  ],
  "Test Prep": [
    "sat",
    "act",
    "gre",
    "gmat",
    "mcat",
    "lsat",
    "ap exam",
    "test prep",
    "exam prep",
    "ielts",
    "toefl",
  ],
  Arts: [
    "art",
    "music",
    "design",
    "drawing",
    "painting",
    "photography",
    "film",
    "theater",
    "sculpture",
  ],
  Health: [
    "health",
    "medicine",
    "anatomy",
    "nutrition",
    "fitness",
    "medical",
    "physiology",
    "wellness",
    "psychology of health",
  ],
  "Personal Finance": [
    "personal finance",
    "investing",
    "budgeting",
    "stocks",
    "retirement",
    "taxes",
    "money management",
    "credit",
  ],
};

export function categorize(text: string): Subject {
  const t = text.toLowerCase();
  let best: Subject = "Computer Science";
  let bestScore = 0;
  for (const subject of SUBJECTS) {
    let score = 0;
    for (const kw of SUBJECT_KEYWORDS[subject]) {
      if (t.includes(kw)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = subject;
    }
  }
  return best;
}

/* -- Normalizers ----------------------------------------------------------- */

export function certifiedToUnified(): UnifiedCourse[] {
  return CERTIFIED_COURSES.map((c) => ({
    slug: c.slug,
    title: c.title,
    summary: c.description,
    source: "official" as const,
    level: c.level,
    subject: categorize([c.title, c.tags.join(" "), c.outcomes.join(" ")].join(" ")),
    tags: c.tags,
    rating: c.rating,
    cover: null,
  }));
}

export function communityToUnified(rows: CommunityCourseRow[]): UnifiedCourse[] {
  return rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    summary: r.summary ?? "",
    source: "community" as const,
    level: r.level,
    subject: categorize([r.title, r.summary ?? ""].join(" ")),
    tags: [],
    enrolledCount: r.enrolled_count,
    cover: r.cover_image_url,
  }));
}

/* -- Lightweight, typo-tolerant search scoring (Phase-1, client-side) ------
   Not a full fuzzy index - a fast substring + token-prefix scorer that handles
   partial words and is good enough for hundreds of courses. Returns 0 for no
   match, higher = better, so callers can sort. */
export function searchScore(course: UnifiedCourse, queryRaw: string): number {
  const q = queryRaw.trim().toLowerCase();
  if (!q) return 1; // empty query -> everything passes, neutral score
  const hay = [course.title, course.summary, course.subject, course.level, course.tags.join(" ")]
    .join(" ")
    .toLowerCase();
  let score = 0;
  if (course.title.toLowerCase().includes(q)) score += 10;
  if (hay.includes(q)) score += 5;
  // token-level: every query word that appears anywhere adds a little
  for (const tok of q.split(/\s+/)) {
    if (tok.length >= 2 && hay.includes(tok)) score += 2;
  }
  return score;
}
