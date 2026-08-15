import { describe, it, expect } from "vitest";
import { extractPreference, mergePreference, preferenceCategory } from "./luna-preference-detector";

/**
 * This detector decides what Luna is told about a learner on every future
 * turn, from a heuristic read of one chat message. Its own header calls false
 * positives cheap, which is fair - but two behaviours are not cheap and had no
 * tests: a contradicted instruction has to actually replace the old one rather
 * than sit next to it, and ordinary conversation must not be mistaken for an
 * instruction and then repeated back at the learner forever.
 */

describe("extractPreference", () => {
  it("catches a direct request to change length", () => {
    expect(extractPreference("can you write shorter responses")).toMatch(/shorter/);
    expect(extractPreference("please keep it brief")).toMatch(/brief/);
  });

  it("catches a request for more or fewer of something", () => {
    expect(extractPreference("use more analogies please")).toMatch(/analogies/);
    expect(extractPreference("fewer hints")).toMatch(/hints/);
  });

  it("catches an instruction to stop doing something", () => {
    expect(extractPreference("stop using emojis")).toMatch(/avoid emojis/);
  });

  it("catches a level request", () => {
    expect(extractPreference("explain it like I'm five")).toMatch(/explain like i'm/i);
  });

  it("ignores text too short to be an instruction", () => {
    expect(extractPreference("ok")).toBeNull();
    expect(extractPreference("")).toBeNull();
  });

  it("ignores a very long message rather than mining it for a phrase", () => {
    // A wall of text is a question, not a standing instruction.
    expect(extractPreference("x".repeat(500))).toBeNull();
  });

  it("returns null for ordinary conversation", () => {
    expect(extractPreference("what is the derivative of x squared")).toBeNull();
    expect(extractPreference("thanks, that helped a lot")).toBeNull();
  });

  it("normalises whitespace in what it extracts", () => {
    const p = extractPreference("please    write   shorter   responses");
    expect(p).toBeTruthy();
    expect(p).not.toMatch(/\s{2,}/);
  });
});

describe("preferenceCategory", () => {
  it("groups the length instructions together", () => {
    expect(preferenceCategory("shorter responses")).toBe("length");
    expect(preferenceCategory("longer responses")).toBe("length");
    expect(preferenceCategory("detailed responses")).toBe("length");
  });

  it("recognises the other categories it claims to", () => {
    expect(preferenceCategory("use more analogies")).toBe("analogies");
    expect(preferenceCategory("avoid emojis")).toBe("emoji");
    expect(preferenceCategory("explain like I'm five")).toBe("level");
    expect(preferenceCategory("warmer tone")).toBe("tone");
  });

  it("returns null for a line it cannot classify", () => {
    expect(preferenceCategory("something entirely unrelated")).toBeNull();
  });
});

describe("mergePreference", () => {
  it("adds the first preference to an empty blob", () => {
    expect(mergePreference(null, "shorter responses")).toBe("shorter responses");
    expect(mergePreference("", "shorter responses")).toBe("shorter responses");
  });

  it("pins the newest instruction to the top", () => {
    const out = mergePreference("use more analogies", "avoid emojis");
    expect(out.split("\n")[0]).toBe("avoid emojis");
  });

  it("replaces a contradicted instruction instead of keeping both", () => {
    // The reason categories exist: "shorter" and "longer" cannot both be true,
    // and leaving both would send Luna contradictory standing orders.
    const out = mergePreference("shorter responses", "longer responses");
    expect(out).toContain("longer responses");
    expect(out).not.toContain("shorter responses");
  });

  it("leaves unrelated preferences alone", () => {
    const out = mergePreference("use more analogies", "longer responses");
    expect(out).toContain("use more analogies");
    expect(out).toContain("longer responses");
  });

  it("dedupes the same instruction regardless of case or punctuation", () => {
    const out = mergePreference("Shorter responses!", "shorter responses");
    expect(out.split("\n").filter((l) => /shorter/i.test(l))).toHaveLength(1);
  });

  it("caps the blob so it cannot grow without bound", () => {
    // Uncategorised lines are never evicted by category, so without the cap
    // this would grow forever and be pasted into every prompt.
    let blob = "";
    for (let i = 0; i < 20; i++) blob = mergePreference(blob, `unclassifiable preference ${i}`);
    expect(blob.split("\n").length).toBeLessThanOrEqual(12);
  });

  it("keeps the most recent lines when it caps", () => {
    let blob = "";
    for (let i = 0; i < 20; i++) blob = mergePreference(blob, `unclassifiable preference ${i}`);
    expect(blob.split("\n")[0]).toBe("unclassifiable preference 19");
  });
});
