import { describe, it, expect } from "vitest";
import {
  TUG_BAR_MAX,
  initialTugState,
  pushTug,
  recoverTug,
  tugPercent,
  tugWinner,
} from "./tug-of-war";

/**
 * The whole mode rests on one invariant: healing relieves pressure but can
 * never win. `recoverTug` is what enforces it, and without a test the
 * constraint lives only in a comment - one refactor away from turning every
 * heal into a second win condition and making heal-leaning archetypes
 * strictly dominant here.
 */

describe("pushTug", () => {
  it("moves the bar toward whoever pushed", () => {
    expect(pushTug(initialTugState(), "player", 20).position).toBe(20);
    expect(pushTug(initialTugState(), "opponent", 20).position).toBe(-20);
  });

  it("accumulates across pushes from both sides", () => {
    let s = initialTugState();
    s = pushTug(s, "player", 30);
    s = pushTug(s, "opponent", 12);
    expect(s.position).toBe(18);
  });

  it("stops at the edges rather than running off the bar", () => {
    expect(pushTug(initialTugState(), "player", 9999).position).toBe(TUG_BAR_MAX);
    expect(pushTug(initialTugState(), "opponent", 9999).position).toBe(-TUG_BAR_MAX);
  });
});

describe("recoverTug", () => {
  it("pulls a losing position back toward center", () => {
    const losing = { position: -50 };
    expect(recoverTug(losing, "player", 20).position).toBe(-30);
  });

  it("stops at center instead of pushing through it", () => {
    // The invariant: a heal can only undo ground already lost. Overhealing
    // from -10 must land on 0, never on +40.
    expect(recoverTug({ position: -10 }, "player", 50).position).toBe(0);
    expect(recoverTug({ position: 10 }, "opponent", 50).position).toBe(0);
  });

  it("does nothing for a side that is already ahead", () => {
    // Healing while winning is not a way to keep winning harder.
    expect(recoverTug({ position: 40 }, "player", 30).position).toBe(40);
    expect(recoverTug({ position: -40 }, "opponent", 30).position).toBe(-40);
  });

  it("cannot win the game", () => {
    // Exhaustive over every position the game is still live at: no heal of
    // any size turns an undecided bar into a win. (The edges are excluded
    // because reaching one has already ended the battle - a heal there is
    // not what won it.)
    for (let p = -TUG_BAR_MAX + 1; p < TUG_BAR_MAX; p++) {
      for (const amount of [1, 25, 500]) {
        expect(tugWinner(recoverTug({ position: p }, "player", amount)), `p=${p}`).toBeNull();
        expect(tugWinner(recoverTug({ position: p }, "opponent", amount)), `p=${p}`).toBeNull();
      }
    }
  });
});

describe("tugWinner", () => {
  it("has no winner anywhere short of an edge", () => {
    expect(tugWinner(initialTugState())).toBeNull();
    expect(tugWinner({ position: TUG_BAR_MAX - 1 })).toBeNull();
    expect(tugWinner({ position: -TUG_BAR_MAX + 1 })).toBeNull();
  });

  it("declares the side that reached its edge", () => {
    expect(tugWinner({ position: TUG_BAR_MAX })).toBe("player");
    expect(tugWinner({ position: -TUG_BAR_MAX })).toBe("opponent");
  });
});

describe("tugPercent", () => {
  it("reads 50 at the start and runs 0 to 100 across the bar", () => {
    expect(tugPercent(initialTugState())).toBe(50);
    expect(tugPercent({ position: TUG_BAR_MAX })).toBe(100);
    expect(tugPercent({ position: -TUG_BAR_MAX })).toBe(0);
  });

  it("never leaves 0..100 anywhere on the bar", () => {
    for (let p = -TUG_BAR_MAX; p <= TUG_BAR_MAX; p++) {
      const pct = tugPercent({ position: p });
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(100);
    }
  });
});
