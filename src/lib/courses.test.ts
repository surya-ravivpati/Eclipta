import { describe, it, expect } from "vitest";
import {
  SUBJECTS,
  categorize,
  certifiedToUnified,
  communityToUnified,
  searchScore,
  type CommunityCourseRow,
  type UnifiedCourse,
} from "./courses";

/**
 * The point of this module is that the Courses hub never has to know whether a
 * course came from the static catalogue or from the database. So the property
 * worth testing is not any single mapping but the sameness: both normalisers
 * have to emit a complete `UnifiedCourse`, with a real subject, or the hub's
 * filters silently drop courses from one source.
 */

function unified(over: Partial<UnifiedCourse> = {}): UnifiedCourse {
  return {
    slug: "s",
    title: "Intro to Algebra",
    summary: "Solving equations",
    source: "community",
    level: "Beginner",
    subject: "Mathematics",
    tags: ["math"],
    ...over,
  };
}

function communityRow(over: Partial<CommunityCourseRow> = {}): CommunityCourseRow {
  return {
    id: "c1",
    slug: "algebra",
    title: "Intro to Algebra",
    summary: "Solving equations",
    level: "Beginner",
    enrolled_count: 12,
    cover_image_url: null,
    ...over,
  };
}

describe("categorize", () => {
  it("picks the subject whose keywords appear", () => {
    expect(categorize("Calculus and linear algebra")).toBe("Mathematics");
    expect(categorize("Organic chemistry and genetics")).toBe("Science");
    expect(categorize("Python programming and data structures")).toBe("Computer Science");
    expect(categorize("SAT and ACT exam prep")).toBe("Test Prep");
    expect(categorize("Budgeting and investing basics")).toBe("Personal Finance");
  });

  it("prefers the subject with more matches when several apply", () => {
    // "science" alone would match Science; the three CS terms should win.
    expect(categorize("computer science: algorithms, software, database")).toBe("Computer Science");
  });

  it("is case-insensitive", () => {
    expect(categorize("PHYSICS AND ASTRONOMY")).toBe("Science");
  });

  it("always returns a real subject, even for text matching nothing", () => {
    for (const text of ["", "zzzz", "     "]) {
      expect(SUBJECTS, `text=${JSON.stringify(text)}`).toContain(categorize(text));
    }
  });
});

describe("normalisers", () => {
  it("gives every certified course a complete unified shape", () => {
    const courses = certifiedToUnified();
    expect(courses.length).toBeGreaterThan(0);
    for (const c of courses) {
      expect(c.source).toBe("official");
      expect(c.slug.length, `${c.title} has no slug`).toBeGreaterThan(0);
      expect(c.title.length).toBeGreaterThan(0);
      expect(SUBJECTS, `${c.title} got a bogus subject`).toContain(c.subject);
    }
  });

  it("gives every community row the same complete shape", () => {
    const [course] = communityToUnified([communityRow()]);
    expect(course).toMatchObject({
      slug: "algebra",
      title: "Intro to Algebra",
      source: "community",
      subject: "Mathematics",
      enrolledCount: 12,
    });
  });

  it("turns a null summary into an empty string, not the word null", () => {
    const [course] = communityToUnified([communityRow({ summary: null })]);
    expect(course?.summary).toBe("");
  });

  it("still categorises a community course with no summary", () => {
    const [course] = communityToUnified([
      communityRow({ title: "Quantum physics", summary: null }),
    ]);
    expect(course?.subject).toBe("Science");
  });

  it("maps an empty list to an empty list", () => {
    expect(communityToUnified([])).toEqual([]);
  });
});

describe("searchScore", () => {
  it("passes everything through on an empty query", () => {
    expect(searchScore(unified(), "")).toBeGreaterThan(0);
    expect(searchScore(unified(), "   ")).toBeGreaterThan(0);
  });

  it("scores a title hit above a body-only hit", () => {
    const titleHit = searchScore(unified({ title: "Algebra basics" }), "algebra");
    const bodyHit = searchScore(
      unified({ title: "Basics", summary: "covers algebra", tags: [] }),
      "algebra",
    );
    expect(titleHit).toBeGreaterThan(bodyHit);
  });

  it("returns 0 when nothing matches", () => {
    expect(searchScore(unified(), "underwater basket weaving")).toBe(0);
  });

  it("ignores case in both the query and the course", () => {
    expect(searchScore(unified({ title: "ALGEBRA" }), "algebra")).toBeGreaterThan(0);
    expect(searchScore(unified({ title: "algebra" }), "ALGEBRA")).toBeGreaterThan(0);
  });

  it("credits each query word that appears somewhere", () => {
    const both = searchScore(
      unified({ title: "Algebra", summary: "equations" }),
      "algebra equations",
    );
    const one = searchScore(unified({ title: "Algebra", summary: "equations" }), "algebra zzzz");
    expect(both).toBeGreaterThan(one);
  });

  it("ignores one-character tokens rather than matching everything", () => {
    // A stray "a" appears in almost any text, so it must contribute nothing.
    // Both queries here are multi-word, so neither gets the whole-string
    // bonus and the only difference between them is the stray character.
    const withStray = searchScore(unified(), "algebra equations a");
    const without = searchScore(unified(), "algebra equations");
    expect(withStray).toBe(without);
  });

  it("searches the subject and level, not just the title", () => {
    expect(searchScore(unified({ subject: "Test Prep" }), "test prep")).toBeGreaterThan(0);
    expect(searchScore(unified({ level: "Advanced" }), "advanced")).toBeGreaterThan(0);
  });
});
