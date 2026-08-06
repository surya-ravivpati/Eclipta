import { describe, expect, it } from "vitest";
import {
  containsProfanity,
  findProfanity,
  isCleanForumContent,
  isCleanUsername,
  normalizeForModeration,
} from "./profanity";

describe("findProfanity", () => {
  it("returns null for clean text", () => {
    expect(findProfanity("what a great battle, well played")).toBeNull();
  });

  it("returns null for empty or falsy input", () => {
    expect(findProfanity("")).toBeNull();
  });

  it("finds a banned word by exact match", () => {
    expect(findProfanity("you are an idiot, fuck off")).toBe("fuck");
  });

  it("is case-insensitive", () => {
    expect(findProfanity("FUCK this")).toBe("fuck");
  });

  it("strips spaces inserted between letters", () => {
    expect(findProfanity("fu ck")).toBe("fuck");
  });

  it("strips punctuation used to break up a word", () => {
    expect(findProfanity("f-u-c-k")).toBe("fuck");
  });

  it("catches homoglyph substitution (Cyrillic look-alikes for a c/u/n/t spelling)", () => {
    // Cyrillic а/с look identical to Latin a/c; the rest are already Latin.
    expect(findProfanity("а с u n t")).toBe("cunt");
  });

  it("catches zero-width character insertion between letters", () => {
    // U+200B ZWSP inserted between every letter of "fuck"
    const zwsp = "​";
    const obfuscated = ["f", "u", "c", "k"].join(zwsp);
    expect(findProfanity(obfuscated)).toBe("fuck");
  });

  it("collapses 3+ repeated characters down to 2, matching words with a doubled letter", () => {
    // "asssshole" collapses to "asshole", which has a genuine double-s.
    expect(findProfanity("asssshole")).toBe("asshole");
  });

  it("does NOT collapse a run down to a single character, so a word needing an exact single letter can still slip through", () => {
    // Collapsing to 2 (not 1) means "fuuuuuuuck" -> "fuuck", which no longer
    // contains "fuck" (single u). This is a known, deliberate limitation of
    // the client-side pre-filter, not a bug - the server-side classifier is
    // the actual source of truth (see the file's own header comment).
    expect(findProfanity("fuuuuuuuck you")).toBeNull();
  });
});

describe("containsProfanity", () => {
  it("mirrors findProfanity as a boolean", () => {
    expect(containsProfanity("nice game")).toBe(false);
    expect(containsProfanity("fuck this")).toBe(true);
  });
});

describe("normalizeForModeration", () => {
  it("lowercases, strips punctuation and symbols (via leet substitution), and drops non-letters", () => {
    expect(normalizeForModeration("F-U-C-K!!")).toBe("fuckii");
  });

  it("returns an empty string for empty input", () => {
    expect(normalizeForModeration("")).toBe("");
  });
});

describe("isCleanUsername", () => {
  it("accepts a clean username", () => {
    expect(isCleanUsername("StarGazer42")).toEqual({ ok: true });
  });

  it("rejects a username containing a banned term, with a username-specific reason", () => {
    const result = isCleanUsername("fuckboy99");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/username/i);
    }
  });
});

describe("isCleanForumContent", () => {
  it("accepts clean forum content", () => {
    expect(isCleanForumContent("Can someone help me with derivatives?")).toEqual({ ok: true });
  });

  it("rejects forum content containing a banned term, with a rephrase-oriented reason", () => {
    const result = isCleanForumContent("this problem is such bullshit, fuck it");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/rephrase/i);
    }
  });
});
