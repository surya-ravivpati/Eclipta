/**
 * The recommendation & readiness engine — Phase 2 (docs/courses-redesign.md §5).
 *
 * Deterministic and explainable by design: candidate generation → weighted
 * scoring → a one-sentence reason. No LLM in the hot path, so the hub is instant
 * and every recommendation can be justified and tested. Mastery is derived from
 * signals that already exist (completed/enrolled courses, strong/weak areas);
 * the same shape will later be fed by the concept_mastery store.
 */

import type { UnifiedCourse, Subject } from "./courses";
import {
  CONCEPTS, conceptsOf, matchConcept, courseTeaching, subjectPath,
  type ConceptNode,
} from "./course-graph";

export interface LearnerState {
  completedSlugs: Set<string>;
  enrolledSlugs: Set<string>;
  strongAreas: string[];
  weakAreas: string[];
}

const MASTERED = 0.7;

/** Per-concept mastery in [0,1], inferred from the learner's signals. */
export function deriveMastery(state: LearnerState): Map<string, number> {
  const m = new Map<string, number>();
  const lift = (id: string, v: number) => m.set(id, Math.max(m.get(id) ?? 0, v));

  for (const s of state.strongAreas) {
    const c = matchConcept(s);
    if (c) lift(c.id, 0.8);
  }
  for (const slug of state.completedSlugs) {
    const cc = conceptsOf(slug);
    for (const t of cc.teaches) lift(t, 0.95);
    for (const r of cc.requires) lift(r, 0.7); // you needed the prereqs to finish
  }
  for (const slug of state.enrolledSlugs) {
    if (state.completedSlugs.has(slug)) continue;
    for (const t of conceptsOf(slug).teaches) lift(t, 0.35); // in progress
  }
  // weak areas pull DOWN, applied last so they win over inflated estimates
  for (const w of state.weakAreas) {
    const c = matchConcept(w);
    if (c) {
      const cur = m.get(c.id);
      m.set(c.id, cur === undefined ? 0.25 : Math.min(cur, 0.25));
    }
  }
  return m;
}

/** 0–1 readiness for a course given mastery of its required concepts. */
export function readiness(slug: string, mastery: Map<string, number>): number {
  const req = conceptsOf(slug).requires;
  if (req.length === 0) return 1; // no prereqs (community courses included)
  const sum = req.reduce((a, r) => a + (mastery.get(r) ?? 0), 0);
  return sum / req.length;
}

export type RecKind = "remediation" | "next" | "ready" | "affinity" | "popular";

export interface Recommendation {
  course: UnifiedCourse;
  readiness: number;
  reason: string;
  kind: RecKind;
}

/** Subjects the learner has demonstrated strength/progress in. */
function strongSubjects(state: LearnerState, courses: UnifiedCourse[]): Set<Subject> {
  const out = new Set<Subject>();
  const bySlug = new Map(courses.map((c) => [c.slug, c]));
  for (const slug of state.completedSlugs) {
    const c = bySlug.get(slug);
    if (c) out.add(c.subject);
  }
  for (const s of state.strongAreas) {
    const c = matchConcept(s);
    if (c) out.add(c.subject);
  }
  return out;
}

/**
 * Ranked recommendations with reasons. Returns [] when there's no signal at all
 * (cold start) so the caller can fall back to a "popular" rail.
 */
export function recommend(courses: UnifiedCourse[], state: LearnerState, limit = 6): Recommendation[] {
  const hasSignal =
    state.completedSlugs.size > 0 || state.strongAreas.length > 0 || state.weakAreas.length > 0;
  if (!hasSignal) return [];

  const mastery = deriveMastery(state);
  const subjects = strongSubjects(state, courses);
  const bySlug = new Map(courses.map((c) => [c.slug, c]));
  const titleOf = (slug: string) => bySlug.get(slug)?.title ?? slug;

  // Which completed course taught a given concept (for "because you finished…").
  const taughtBy = new Map<string, string>();
  for (const slug of state.completedSlugs) {
    for (const t of conceptsOf(slug).teaches) if (!taughtBy.has(t)) taughtBy.set(t, slug);
  }

  const weakConcepts = state.weakAreas
    .map((w) => matchConcept(w))
    .filter((c): c is ConceptNode => !!c);

  const recs: Recommendation[] = [];
  const used = new Set<string>();

  // 1) Remediation — a weak prerequisite is worth fixing before advancing.
  for (const wc of weakConcepts) {
    const slug = courseTeaching(wc.id);
    if (!slug || state.completedSlugs.has(slug) || used.has(slug)) continue;
    const course = bySlug.get(slug);
    if (!course) continue;
    used.add(slug);
    recs.push({ course, readiness: 1, reason: `Review this to strengthen ${wc.label}`, kind: "remediation" });
  }

  // 2) Everything else, scored.
  type Scored = Recommendation & { score: number };
  const scored: Scored[] = [];
  for (const course of courses) {
    if (state.completedSlugs.has(course.slug) || used.has(course.slug)) continue;
    const r = readiness(course.slug, mastery);
    const req = conceptsOf(course.slug).requires;

    // continuity: does a completed course teach one of this course's prereqs?
    const successorOf = req.find((rq) => taughtBy.has(rq));
    const affinity = subjects.has(course.subject);
    const popularity = Math.min(1, (course.enrolledCount ?? course.rating ?? 0) / 1000);

    const score =
      0.45 * r +
      0.25 * (successorOf ? 1 : 0) +
      0.20 * (affinity ? 1 : 0) +
      0.10 * popularity;

    // reason — strongest applicable signal wins
    let reason: string;
    let kind: RecKind;
    const missing = req.find((rq) => (mastery.get(rq) ?? 0) < MASTERED);
    if (successorOf && r >= 0.9) {
      reason = `Because you finished ${titleOf(taughtBy.get(successorOf)!)}`;
      kind = "next";
    } else if (r >= 0.5 && r < 0.95 && missing) {
      const label = CONCEPTS.find((c) => c.id === missing)?.label ?? "the basics";
      reason = `You're ${Math.round(r * 100)}% ready — ${label} will get you there`;
      kind = "ready";
    } else if (r >= 0.95 && affinity) {
      reason = `Builds on your strength in ${course.subject}`;
      kind = "affinity";
    } else if (affinity) {
      reason = `More ${course.subject} for you`;
      kind = "affinity";
    } else {
      reason = `A strong next step in ${course.subject}`;
      kind = "popular";
    }
    scored.push({ course, readiness: r, reason, kind, score });
  }

  scored.sort((a, b) => b.score - a.score);
  for (const s of scored) {
    if (recs.length >= limit) break;
    recs.push({ course: s.course, readiness: s.readiness, reason: s.reason, kind: s.kind });
  }
  return recs.slice(0, limit);
}

/* ── Learning path (the progression spine) ─────────────────────────────── */

export type StepState = "done" | "current" | "next" | "locked";

export interface PathStep {
  concept: ConceptNode;
  state: StepState;
  course?: UnifiedCourse;
}

/** A subject's concept spine annotated with the learner's you-are-here state. */
export function buildPath(subject: Subject, mastery: Map<string, number>, courses: UnifiedCourse[]): PathStep[] {
  const seq = subjectPath(subject);
  let currentAssigned = false;
  return seq.map((concept) => {
    const mv = mastery.get(concept.id) ?? 0;
    const prereqsMet = concept.dependsOn.every((d) => (mastery.get(d) ?? 0) >= MASTERED);
    let st: StepState;
    if (mv >= MASTERED) st = "done";
    else if (prereqsMet && !currentAssigned) { st = "current"; currentAssigned = true; }
    else if (prereqsMet) st = "next";
    else st = "locked";
    const slug = courseTeaching(concept.id);
    const course = slug ? courses.find((c) => c.slug === slug) : undefined;
    return { concept, state: st, course };
  });
}

/** Pick the most relevant subject to show a path for. */
export function activeSubject(state: LearnerState, courses: UnifiedCourse[], fallback: Subject = "Mathematics"): Subject {
  const bySlug = new Map(courses.map((c) => [c.slug, c]));
  // most recent enrolled/in-progress course's subject wins
  for (const slug of state.enrolledSlugs) {
    const c = bySlug.get(slug);
    if (c) return c.subject;
  }
  const subs = strongSubjects(state, courses);
  return subs.size ? [...subs][0] : fallback;
}
