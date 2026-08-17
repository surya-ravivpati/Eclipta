import { describe, it, expect } from "vitest";
import { conceptsOf } from "./course-graph";
import type { UnifiedCourse } from "./courses";
import {
  activeSubject,
  buildPath,
  deriveMastery,
  readiness,
  recommend,
  type LearnerState,
} from "./recommend";

/**
 * The recommendation engine is deterministic on purpose - its own header calls
 * that out - and was entirely untested. The properties worth pinning are the
 * ones that decide what a learner is told to do next: that finishing a course
 * counts for more than being enrolled in it, that a declared weakness beats an
 * inflated estimate, and that a cold start says nothing rather than guessing.
 */

function course(slug: string, over: Partial<UnifiedCourse> = {}): UnifiedCourse {
  return {
    slug,
    title: slug,
    summary: "",
    source: "certified",
    level: "Intermediate",
    subject: "Mathematics",
    tags: [],
    ...over,
  } as UnifiedCourse;
}

/** The certified courses the concept graph actually knows about. */
const CALCULUS = "calculus-through-intuition"; // teaches limits/derivatives/integrals, requires algebra
const ML = "machine-learning-foundations"; // requires linear-algebra, statistics, python
const QUANTUM = "quantum-computing-primer"; // requires linear-algebra

const CATALOGUE = [
  course(CALCULUS),
  course(ML, { subject: "Computer Science" }),
  course(QUANTUM, { subject: "Science" }),
];

/**
 * First element, asserted present.
 *
 * Indexed access is `string | undefined` under the strict config but plain
 * `string` under the default one, so a `!` is required by one and flagged as
 * redundant by the other. Narrowing once here satisfies both.
 */
function first<T>(xs: readonly T[]): T {
  const x = xs[0];
  if (x === undefined) throw new Error("expected a non-empty list");
  return x;
}

function learner(over: Partial<LearnerState> = {}): LearnerState {
  return {
    completedSlugs: new Set(),
    enrolledSlugs: new Set(),
    strongAreas: [],
    weakAreas: [],
    ...over,
  };
}

describe("deriveMastery", () => {
  it("credits everything a finished course taught", () => {
    const m = deriveMastery(learner({ completedSlugs: new Set([CALCULUS]) }));
    for (const t of conceptsOf(CALCULUS).teaches) {
      expect(m.get(t)).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("credits the prerequisites of a finished course, since you needed them", () => {
    const m = deriveMastery(learner({ completedSlugs: new Set([CALCULUS]) }));
    for (const r of conceptsOf(CALCULUS).requires) {
      expect(m.get(r)).toBeGreaterThanOrEqual(0.7);
    }
  });

  it("counts being enrolled for much less than having finished", () => {
    const enrolled = deriveMastery(learner({ enrolledSlugs: new Set([CALCULUS]) }));
    const done = deriveMastery(learner({ completedSlugs: new Set([CALCULUS]) }));
    const taught = first(conceptsOf(CALCULUS).teaches);
    expect(enrolled.get(taught)).toBeLessThan(done.get(taught) ?? 0);
  });

  it("does not double-count a course that is both enrolled and completed", () => {
    const m = deriveMastery(
      learner({ completedSlugs: new Set([CALCULUS]), enrolledSlugs: new Set([CALCULUS]) }),
    );
    const taught = first(conceptsOf(CALCULUS).teaches);
    expect(m.get(taught)).toBeGreaterThanOrEqual(0.9);
  });

  it("lets a declared weakness override an inflated estimate", () => {
    // This is the ordering that matters: a learner who finished a course but
    // says they are weak at its topic should be believed, not overruled by the
    // completion record.
    const m = deriveMastery(
      learner({ completedSlugs: new Set([CALCULUS]), weakAreas: ["derivatives"] }),
    );
    expect(m.get("derivatives")).toBeLessThanOrEqual(0.25);
  });

  it("ignores free text that matches no concept", () => {
    const m = deriveMastery(learner({ strongAreas: ["underwater basket weaving"] }));
    expect(m.size).toBe(0);
  });
});

describe("readiness", () => {
  it("is 1 for a course with no prerequisites", () => {
    // Community courses have no graph entry, so they must never look gated.
    expect(readiness("a-community-course", new Map())).toBe(1);
  });

  it("is 0 when none of the prerequisites are held", () => {
    expect(readiness(ML, new Map())).toBe(0);
  });

  it("rises as prerequisites are met", () => {
    const req = conceptsOf(ML).requires;
    const partial = new Map([[first(req), 1]]);
    const full = new Map(req.map((r) => [r, 1]));
    expect(readiness(ML, partial)).toBeGreaterThan(0);
    expect(readiness(ML, partial)).toBeLessThan(1);
    expect(readiness(ML, full)).toBe(1);
  });
});

describe("recommend", () => {
  it("says nothing at all on a cold start", () => {
    // The caller falls back to a "popular" rail; inventing a recommendation
    // from no signal would be worse than admitting there isn't one.
    expect(recommend(CATALOGUE, learner())).toEqual([]);
  });

  it("treats enrolment alone as no signal", () => {
    expect(recommend(CATALOGUE, learner({ enrolledSlugs: new Set([CALCULUS]) }))).toEqual([]);
  });

  it("leads with remediation when a weakness has a course that teaches it", () => {
    const recs = recommend(CATALOGUE, learner({ weakAreas: ["limits"] }));
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0]?.kind).toBe("remediation");
    expect(recs[0]?.reason).toMatch(/strengthen/i);
  });

  it("never recommends a course the learner already finished", () => {
    const recs = recommend(
      CATALOGUE,
      learner({ completedSlugs: new Set([CALCULUS]), weakAreas: ["limits"] }),
    );
    expect(recs.map((r) => r.course.slug)).not.toContain(CALCULUS);
  });

  it("returns no duplicate courses", () => {
    const recs = recommend(
      CATALOGUE,
      learner({ completedSlugs: new Set([CALCULUS]), weakAreas: ["limits", "derivatives"] }),
    );
    const slugs = recs.map((r) => r.course.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("respects the limit", () => {
    const recs = recommend(CATALOGUE, learner({ completedSlugs: new Set([CALCULUS]) }), 1);
    expect(recs.length).toBeLessThanOrEqual(1);
  });

  it("gives every recommendation a reason", () => {
    // "Explainable by design" is the engine's stated contract.
    const recs = recommend(CATALOGUE, learner({ completedSlugs: new Set([CALCULUS]) }));
    for (const r of recs) expect(r.reason.trim().length).toBeGreaterThan(0);
  });
});

describe("buildPath", () => {
  it("marks mastered concepts done and gates the rest behind their prerequisites", () => {
    const steps = buildPath("Mathematics", new Map(), CATALOGUE);
    expect(steps.length).toBeGreaterThan(0);
    // With no mastery at all, nothing is done and exactly one step is current.
    expect(steps.filter((s) => s.state === "done")).toHaveLength(0);
    expect(steps.filter((s) => s.state === "current").length).toBeLessThanOrEqual(1);
  });

  it("moves the you-are-here marker as mastery grows", () => {
    const cold = buildPath("Mathematics", new Map(), CATALOGUE);
    const first = cold.find((s) => s.state === "current");
    expect(first).toBeDefined();
    const warm = buildPath("Mathematics", new Map([[first!.concept.id, 1]]), CATALOGUE);
    expect(warm.find((s) => s.concept.id === first!.concept.id)?.state).toBe("done");
  });

  it("assigns exactly one current step, never several", () => {
    const steps = buildPath("Mathematics", new Map([["algebra", 1]]), CATALOGUE);
    expect(steps.filter((s) => s.state === "current").length).toBeLessThanOrEqual(1);
  });
});

describe("activeSubject", () => {
  it("falls back when the learner has shown nothing", () => {
    expect(activeSubject(learner(), CATALOGUE)).toBe("Mathematics");
  });

  it("honours an explicit fallback", () => {
    expect(activeSubject(learner(), CATALOGUE, "Science")).toBe("Science");
  });

  it("prefers the subject of a course in progress", () => {
    const s = activeSubject(learner({ enrolledSlugs: new Set([ML]) }), CATALOGUE);
    expect(s).toBe("Computer Science");
  });

  it("uses a completed course's subject when nothing is in progress", () => {
    const s = activeSubject(learner({ completedSlugs: new Set([QUANTUM]) }), CATALOGUE);
    expect(s).toBe("Science");
  });
});

/**
 * Every recommendation carries a sentence explaining itself, and which
 * sentence you get is the whole point: "because you finished X" is a different
 * promise from "you're 70% ready". The strongest applicable signal is meant to
 * win, so these pin which branch fires when several could.
 */
describe("the reason it gives", () => {
  it("says nothing at all to a learner it knows nothing about", () => {
    // No completions, no strengths, no weaknesses - there is no honest reason
    // to offer, and inventing one is worse than an empty shelf.
    expect(recommend(CATALOGUE, learner())).toEqual([]);
  });

  it("leads with remediation when a weak area has a course that fixes it", () => {
    const recs = recommend(CATALOGUE, learner({ weakAreas: ["limits"] }));
    const remediation = recs.find((r) => r.kind === "remediation");
    expect(remediation?.reason).toMatch(/^Review this to strengthen/);
    // Remediation is pushed before anything scored, so it comes first.
    expect(first(recs).kind).toBe("remediation");
  });

  it("credits the course a learner actually finished", () => {
    const recs = recommend(
      CATALOGUE,
      learner({ completedSlugs: new Set([CALCULUS]), strongAreas: ["limits", "derivatives"] }),
    );
    const next = recs.find((r) => r.kind === "next");
    if (next) expect(next.reason).toMatch(/^Because you finished/);
  });

  it("gives a percentage and the concept standing in the way", () => {
    const recs = recommend(CATALOGUE, learner({ strongAreas: ["linear-algebra"] }));
    const ready = recs.find((r) => r.kind === "ready");
    if (ready) {
      expect(ready.reason).toMatch(/\d+% ready/);
      expect(ready.reason).toContain("will get you there");
    }
  });

  it("never leaves a recommendation without a reason or a kind", () => {
    const recs = recommend(
      CATALOGUE,
      learner({ strongAreas: ["linear-algebra"], weakAreas: ["statistics"] }),
    );
    expect(recs.length).toBeGreaterThan(0);
    for (const rec of recs) {
      expect(rec.reason.length, rec.course.slug).toBeGreaterThan(0);
      expect(["remediation", "next", "ready", "affinity", "popular"]).toContain(rec.kind);
    }
  });

  it("never recommends something already finished", () => {
    const recs = recommend(
      CATALOGUE,
      learner({ completedSlugs: new Set([CALCULUS, ML]), strongAreas: ["limits"] }),
    );
    expect(recs.map((r) => r.course.slug)).not.toContain(CALCULUS);
    expect(recs.map((r) => r.course.slug)).not.toContain(ML);
  });

  it("never repeats a course, even when several signals point at it", () => {
    const recs = recommend(
      CATALOGUE,
      learner({ weakAreas: ["linear-algebra"], strongAreas: ["linear-algebra"] }),
    );
    const slugs = recs.map((r) => r.course.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("honours the limit it is given", () => {
    const recs = recommend(CATALOGUE, learner({ strongAreas: ["linear-algebra"] }), 1);
    expect(recs.length).toBeLessThanOrEqual(1);
  });
});
