import { describe, it, expect } from "vitest";
import { ECLIPTARS } from "@/lib/ecliptars";
import {
  DRAFT_CHOICES_PER_ROUND,
  DRAFT_ROUNDS,
  activeMember,
  advanceTeam,
  autoDraftTeam,
  draftComplete,
  draftRoundCandidates,
  hasNextMember,
  startingTeam,
  teamDefeated,
} from "./draft";

/**
 * Draft Battle's team-building is pure and was untested. The properties worth
 * pinning are the ones a player would notice: never being offered the same
 * Ecliptar twice, never being offered one they do not own, and the KO sequence
 * running out exactly once rather than looping or overshooting.
 */

/** Deterministic stand-in for Math.random, cycling a fixed sequence. */
function seq(values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i += 1;
    return v ?? 0.5;
  };
}

const owned = (n: number) => new Set(ECLIPTARS.slice(0, n).map((e) => e.slug));

describe("draftRoundCandidates", () => {
  it("offers three choices when the player owns plenty", () => {
    const out = draftRoundCandidates(owned(10), [], seq([0.5]));
    expect(out).toHaveLength(DRAFT_CHOICES_PER_ROUND);
  });

  it("never offers an Ecliptar the player does not own", () => {
    const pool = owned(5);
    const out = draftRoundCandidates(pool, [], seq([0.3]));
    for (const e of out) expect(pool.has(e.slug)).toBe(true);
  });

  it("never re-offers something already drafted this run", () => {
    const pool = owned(6);
    const taken = [...pool].slice(0, 2);
    const out = draftRoundCandidates(pool, taken, seq([0.7]));
    for (const e of out) expect(taken).not.toContain(e.slug);
  });

  it("offers fewer real choices rather than padding with duplicates", () => {
    // Two owned, one already taken: exactly one honest choice remains.
    const pool = owned(2);
    const out = draftRoundCandidates(pool, [...pool].slice(0, 1), seq([0.5]));
    expect(out).toHaveLength(1);
    expect(new Set(out.map((e) => e.slug)).size).toBe(out.length);
  });

  it("returns nothing when everything owned is already drafted", () => {
    const pool = owned(3);
    expect(draftRoundCandidates(pool, [...pool], seq([0.5]))).toEqual([]);
  });
});

describe("draftComplete", () => {
  it("needs a full team when the pool is deep enough", () => {
    expect(draftComplete([], owned(10))).toBe(false);
    expect(draftComplete(["a", "b"], owned(10))).toBe(false);
    expect(draftComplete(["a", "b", "c"], owned(10))).toBe(true);
  });

  it("completes early when the player owns fewer than a full team", () => {
    // Otherwise a player with two Ecliptars could never finish a draft.
    expect(draftComplete(["a", "b"], owned(2))).toBe(true);
  });
});

describe("autoDraftTeam", () => {
  it("drafts a full team", () => {
    expect(autoDraftTeam(seq([0.5]))).toHaveLength(DRAFT_ROUNDS);
  });

  it("never repeats an Ecliptar", () => {
    for (const roll of [0, 0.25, 0.5, 0.75, 0.99]) {
      const team = autoDraftTeam(seq([roll]));
      expect(new Set(team.map((e) => e.slug)).size).toBe(team.length);
    }
  });

  it("spreads across archetypes rather than fielding one stat sheet three times", () => {
    const team = autoDraftTeam(seq([0.5, 0.2, 0.8]));
    expect(new Set(team.map((e) => e.archetype)).size).toBe(team.length);
  });
});

describe("team sequence through KOs", () => {
  const members = ECLIPTARS.slice(0, 3);

  it("starts on the first member", () => {
    const t = startingTeam([...members]);
    expect(t.activeIndex).toBe(0);
    expect(activeMember(t)?.slug).toBe(members[0]?.slug);
  });

  it("walks the bench one KO at a time", () => {
    let t = startingTeam([...members]);
    expect(hasNextMember(t)).toBe(true);
    t = advanceTeam(t);
    expect(activeMember(t)?.slug).toBe(members[1]?.slug);
    t = advanceTeam(t);
    expect(activeMember(t)?.slug).toBe(members[2]?.slug);
    expect(hasNextMember(t)).toBe(false);
  });

  it("is defeated only once the last member falls", () => {
    let t = startingTeam([...members]);
    expect(teamDefeated(t)).toBe(false);
    t = advanceTeam(advanceTeam(t));
    expect(teamDefeated(t)).toBe(false); // still fighting the third
    t = advanceTeam(t);
    expect(teamDefeated(t)).toBe(true);
    expect(activeMember(t)).toBeNull();
  });

  it("does not overshoot past the end when advanced again", () => {
    // The engine can call this on a KO that lands at the same moment the match
    // ends; running the index away past the bench would break teamDefeated.
    let t = startingTeam([...members]);
    for (let i = 0; i < 10; i++) t = advanceTeam(t);
    expect(t.activeIndex).toBe(members.length);
    expect(teamDefeated(t)).toBe(true);
  });

  it("treats an empty team as immediately defeated", () => {
    const t = startingTeam([]);
    expect(activeMember(t)).toBeNull();
    expect(teamDefeated(t)).toBe(true);
    expect(hasNextMember(t)).toBe(false);
  });
});
