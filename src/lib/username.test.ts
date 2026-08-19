import { describe, expect, it } from "vitest";
import { isUsername, mentionPattern, USERNAME_PATTERN } from "./username";

/**
 * This predicate mirrors `user_profiles_username_format`, the Postgres CHECK
 * that actually decides. Anything it accepts and the database rejects reads to
 * the user as "the form said this was fine and then the save failed", so the
 * boundaries are worth pinning exactly.
 */

describe("isUsername", () => {
  it("accepts letters, numbers and underscores", () => {
    for (const name of ["abc", "Learner_01", "___", "a1_b2", "A".repeat(20)]) {
      expect(isUsername(name), name).toBe(true);
    }
  });

  it("holds the length boundaries", () => {
    expect(isUsername("ab")).toBe(false);
    expect(isUsername("abc")).toBe(true);
    expect(isUsername("a".repeat(20))).toBe(true);
    expect(isUsername("a".repeat(21))).toBe(false);
  });

  it("rejects everything the character class leaves out", () => {
    const accented = `caf${String.fromCharCode(0xe9)}`;
    for (const name of ["has space", "dash-name", "dot.name", "emoji-star*", accented, "sla/sh"]) {
      expect(isUsername(name), name).toBe(false);
    }
  });

  it("is anchored, so a valid name buried in junk does not pass", () => {
    expect(isUsername(" learner ")).toBe(false);
    expect(isUsername("@learner")).toBe(false);
    expect(isUsername("learner\nadmin")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isUsername("")).toBe(false);
  });

  it("does not carry state between calls", () => {
    // The anchored pattern is shared and must not be global; a `g` flag would
    // make every second call fail on the same input.
    expect(USERNAME_PATTERN.global).toBe(false);
    expect(isUsername("learner")).toBe(true);
    expect(isUsername("learner")).toBe(true);
  });
});

describe("mentionPattern", () => {
  const findAll = (text: string) => [...text.matchAll(mentionPattern())].map((m) => m[2]);

  it("finds a mention at the start and mid-sentence", () => {
    expect(findAll("@learner said so")).toEqual(["learner"]);
    expect(findAll("ask @learner about it")).toEqual(["learner"]);
  });

  it("finds several", () => {
    expect(findAll("@one and @two_2")).toEqual(["one", "two_2"]);
  });

  it("leaves email addresses alone", () => {
    // The whole reason for the leading-character rule.
    expect(findAll("write to me@example.com")).toEqual([]);
  });

  it("ignores a name that is too short or too long to be one", () => {
    expect(findAll("@ab")).toEqual([]);
    expect(findAll(`@${"a".repeat(21)}`)).toEqual([]);
  });

  it("hands back a fresh regex each call", () => {
    // A shared global regex keeps `lastIndex`, so the second scan of the same
    // text would start halfway through and find nothing.
    const text = "@learner";
    expect(findAll(text)).toEqual(["learner"]);
    expect(findAll(text)).toEqual(["learner"]);
  });
});
