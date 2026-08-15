import { describe, it, expect } from "vitest";
import {
  CONCEPTS,
  COURSE_CONCEPTS,
  conceptById,
  conceptsOf,
  courseTeaching,
  matchConcept,
  subjectPath,
} from "./course-graph";
import { first, need } from "./test-helpers";

/**
 * The concept graph is the spine everything else in the learning path reasons
 * over: what a course teaches, what it needs first, and what order a subject's
 * ideas come in. It is a hand-maintained DAG, so the failures worth guarding
 * are structural - an edge pointing at a concept that no longer exists, or a
 * cycle that makes `subjectPath` silently drop nodes.
 */

describe("graph integrity", () => {
  it("gives every concept a unique id", () => {
    const ids = CONCEPTS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never depends on a concept that does not exist", () => {
    const ids = new Set(CONCEPTS.map((c) => c.id));
    for (const c of CONCEPTS) {
      for (const dep of c.dependsOn) {
        expect(ids.has(dep), `${c.id} depends on missing ${dep}`).toBe(true);
      }
    }
  });

  it("has no cycles", () => {
    // A cycle makes subjectPath drop every node inside it, so the learner
    // silently loses part of their path rather than seeing an error.
    const byId = new Map(CONCEPTS.map((c) => [c.id, c]));
    const state = new Map<string, "visiting" | "done">();
    const walk = (id: string, trail: string[]): void => {
      if (state.get(id) === "done") return;
      expect(state.get(id), `cycle: ${[...trail, id].join(" -> ")}`).not.toBe("visiting");
      state.set(id, "visiting");
      for (const d of byId.get(id)?.dependsOn ?? []) walk(d, [...trail, id]);
      state.set(id, "done");
    };
    for (const c of CONCEPTS) walk(c.id, []);
  });

  it("gives every concept at least one alias to match free text against", () => {
    for (const c of CONCEPTS) expect(c.aliases.length).toBeGreaterThan(0);
  });

  it("only ever teaches or requires concepts that exist", () => {
    const ids = new Set(CONCEPTS.map((c) => c.id));
    for (const [slug, cc] of Object.entries(COURSE_CONCEPTS)) {
      for (const t of cc.teaches) expect(ids.has(t), `${slug} teaches missing ${t}`).toBe(true);
      for (const r of cc.requires) expect(ids.has(r), `${slug} requires missing ${r}`).toBe(true);
    }
  });
});

describe("conceptById", () => {
  it("finds a concept that exists and returns undefined otherwise", () => {
    const c = first(CONCEPTS);
    expect(conceptById(c.id)?.id).toBe(c.id);
    expect(conceptById("not-a-concept")).toBeUndefined();
  });
});

describe("conceptsOf", () => {
  it("reports what a known course teaches and needs", () => {
    const cc = conceptsOf("calculus-through-intuition");
    expect(cc.teaches.length).toBeGreaterThan(0);
    expect(cc.requires.length).toBeGreaterThan(0);
  });

  it("returns empty lists for an unknown course rather than throwing", () => {
    // Community courses are not in the graph at all, and must not be treated
    // as gated because of it.
    expect(conceptsOf("some-community-course")).toEqual({ teaches: [], requires: [] });
  });
});

describe("matchConcept", () => {
  it("matches an exact alias", () => {
    const c = first(CONCEPTS);
    expect(matchConcept(first(c.aliases))?.id).toBe(c.id);
  });

  it("is case- and whitespace-insensitive", () => {
    const c = first(CONCEPTS);
    const alias = first(c.aliases);
    expect(matchConcept(`  ${alias.toUpperCase()}  `)?.id).toBe(c.id);
  });

  it("matches a phrase that contains an alias", () => {
    const c = first(CONCEPTS);
    const alias = first(c.aliases);
    expect(matchConcept(`struggling with ${alias} lately`)?.id).toBe(c.id);
  });

  it("returns undefined for empty or unrelated text", () => {
    expect(matchConcept("")).toBeUndefined();
    expect(matchConcept("   ")).toBeUndefined();
    expect(matchConcept("competitive dog grooming")).toBeUndefined();
  });
});

describe("courseTeaching", () => {
  it("finds a course for a concept some course teaches", () => {
    const taught = first(first(Object.values(COURSE_CONCEPTS)).teaches);
    expect(courseTeaching(taught)).toBeDefined();
  });

  it("returns undefined for a concept nothing teaches", () => {
    expect(courseTeaching("not-a-concept")).toBeUndefined();
  });
});

describe("subjectPath", () => {
  it("returns every concept in that subject and nothing from another", () => {
    const path = subjectPath("Mathematics");
    expect(path.length).toBeGreaterThan(0);
    for (const c of path) expect(c.subject).toBe("Mathematics");
    const expected = CONCEPTS.filter((c) => c.subject === "Mathematics").length;
    expect(path.length).toBe(expected);
  });

  it("never places a concept before a prerequisite in the same subject", () => {
    // This is the property the whole path rendering depends on.
    const path = subjectPath("Mathematics");
    const position = new Map(path.map((c, i) => [c.id, i]));
    for (const c of path) {
      for (const dep of c.dependsOn) {
        const depIndex = position.get(dep);
        if (depIndex === undefined) continue; // prerequisite in another subject
        expect(depIndex, `${dep} must precede ${c.id}`).toBeLessThan(need(position.get(c.id)));
      }
    }
  });

  it("is stable across calls", () => {
    expect(subjectPath("Mathematics").map((c) => c.id)).toEqual(
      subjectPath("Mathematics").map((c) => c.id),
    );
  });
});
