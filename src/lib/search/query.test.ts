import { describe, expect, it } from "vitest";
import { highlight, parseQuery } from "./query";

describe("parseQuery", () => {
  it("infers a kind and strips the kind word from the needle", () => {
    expect(parseQuery("physics battles")).toMatchObject({
      needle: "physics",
      kinds: ["battle"],
      inferredKinds: true,
    });
  });

  it("expands a synonym key found in the remaining words", () => {
    expect(parseQuery("integration lesson")).toMatchObject({
      needle: "integration",
      kinds: ["lesson"],
      expansions: ["integral", "integrals", "calculus"],
    });
  });

  it("drops stop words and infers a kind from a non-noun-phrase word (AI -> note)", () => {
    expect(parseQuery("AI explained vectors")).toMatchObject({
      needle: "vectors",
      kinds: ["note"],
      expansions: ["vector", "linear algebra"],
    });
  });

  it("does not expand a word that is only a synonym TARGET, not a key (one-directional)", () => {
    // SYNONYMS maps "chem" -> "chemistry", not the reverse, so a query that
    // already spells out "chemistry" gets zero expansions - looks like it
    // should expand, but by design it doesn't.
    expect(parseQuery("friends studying chemistry")).toMatchObject({
      needle: "chemistry",
      kinds: ["user"],
      expansions: [],
    });
  });

  it("matches the longest kind phrase first, so 'study rooms' isn't split into two words", () => {
    const result = parseQuery("study rooms");
    expect(result.kinds).toEqual(["group"]);
  });

  it("falls back to the raw text as the needle when the query is only an intent word", () => {
    // Stripping "battles" as a kind word leaves nothing - falling back to
    // the original text means the search still returns that category
    // instead of silently returning zero results.
    expect(parseQuery("battles")).toMatchObject({
      needle: "battles",
      kinds: ["battle"],
    });
  });

  it("returns an empty needle and no kinds for blank input", () => {
    expect(parseQuery("  ")).toMatchObject({
      needle: "",
      kinds: [],
      expansions: [],
      inferredKinds: false,
    });
  });

  it("does not infer a kind when an explicit filter chip is already chosen", () => {
    const result = parseQuery("physics", ["user"]);
    expect(result.kinds).toEqual(["user"]);
    expect(result.inferredKinds).toBe(false);
  });
});

describe("highlight", () => {
  it("splits text into matched/unmatched segments for each word of a multi-word needle", () => {
    expect(highlight("Linear Algebra Basics", "linear algebra")).toEqual([
      { text: "Linear", match: true },
      { text: " ", match: false },
      { text: "Algebra", match: true },
      { text: " Basics", match: false },
    ]);
  });

  it("returns the whole text as one unmatched segment for an empty needle", () => {
    expect(highlight("Nothing matches", "")).toEqual([{ text: "Nothing matches", match: false }]);
  });

  it("ignores single-character needle words (too short to usefully highlight)", () => {
    expect(highlight("short", "a")).toEqual([{ text: "short", match: false }]);
  });

  it("matches case-insensitively", () => {
    expect(highlight("PHYSICS 101", "physics")).toEqual([
      { text: "PHYSICS", match: true },
      { text: " 101", match: false },
    ]);
  });
});
