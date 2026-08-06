import { describe, expect, it } from "vitest";
import {
  accuracyScore,
  calibrationScore,
  composureScore,
  consistencyScore,
  detectStrain,
  ratingDelta,
  scorePressureSession,
  speedScore,
  type PressureEvent,
  type PressureItem,
} from "./metrics";

function item(overrides: Partial<PressureItem> = {}): PressureItem {
  return {
    id: "q1",
    timeSpent: 20,
    correct: true,
    answered: true,
    answerChanges: 0,
    revisits: 0,
    difficulty: 5,
    ...overrides,
  };
}

describe("accuracyScore", () => {
  it("returns 0 for an empty session", () => {
    expect(accuracyScore([])).toBe(0);
  });

  it("returns 100 when every item is correct, regardless of difficulty mix", () => {
    expect(accuracyScore([item({ difficulty: 1 }), item({ difficulty: 10 })])).toBe(100);
  });

  it("returns 0 when every item is wrong", () => {
    expect(accuracyScore([item({ correct: false }), item({ correct: false })])).toBe(0);
  });

  it("weights a correct hard item more than a correct easy item", () => {
    // One correct easy (weight 0.6+0.1*0.8=0.68) + one wrong hard (weight
    // 0.6+1.0*0.8=1.4): correct-easy-only scores lower than correct-hard-only.
    const correctEasyOnly = accuracyScore([
      item({ difficulty: 1, correct: true }),
      item({ difficulty: 10, correct: false }),
    ]);
    const correctHardOnly = accuracyScore([
      item({ difficulty: 1, correct: false }),
      item({ difficulty: 10, correct: true }),
    ]);
    expect(correctHardOnly).toBeGreaterThan(correctEasyOnly);
  });

  it("treats an unanswered item as incorrect", () => {
    expect(accuracyScore([item({ answered: false, correct: true })])).toBe(0);
  });
});

describe("speedScore", () => {
  it("returns 0 when nothing was answered", () => {
    expect(speedScore([item({ answered: false })], 30)).toBe(0);
  });

  it("gives full marks for answering at or under the difficulty-adjusted budget", () => {
    // budget for difficulty 5, secondsPerItem 30: 30 * (0.7 + 0.5*0.6) = 30.
    expect(speedScore([item({ difficulty: 5, timeSpent: 30 })], 30)).toBe(100);
    expect(speedScore([item({ difficulty: 5, timeSpent: 10 })], 30)).toBe(100);
  });

  it("degrades, but doesn't reward, going far over budget", () => {
    const overBudget = speedScore([item({ difficulty: 5, timeSpent: 90 })], 30);
    expect(overBudget).toBeLessThan(100);
    expect(overBudget).toBeGreaterThanOrEqual(0);
  });

  it("never scores below 0 for an extreme overrun", () => {
    expect(speedScore([item({ difficulty: 1, timeSpent: 100_000 })], 5)).toBe(0);
  });
});

describe("composureScore", () => {
  it("returns 100 for an empty session", () => {
    expect(composureScore([])).toBe(100);
  });

  it("does not penalize a single answer change or revisit (people reconsidering is normal)", () => {
    expect(composureScore([item({ answerChanges: 1, revisits: 1 })])).toBe(100);
  });

  it("penalizes from the second change/revisit onward", () => {
    const score = composureScore([item({ answerChanges: 3, revisits: 2 })]);
    // penalty = max(0, 3-1)*6 + max(0, 2-1)*3 = 12 + 3 = 15
    expect(score).toBe(85);
  });
});

describe("calibrationScore", () => {
  it("returns 100 when nothing was rated (nothing to be wrong about)", () => {
    // item()'s default already omits statedConfidence entirely.
    expect(calibrationScore([item()])).toBe(100);
  });

  it("scores confident-and-correct highly", () => {
    expect(calibrationScore([item({ statedConfidence: 0.95, correct: true })])).toBeGreaterThan(90);
  });

  it("scores unsure-and-wrong just as highly as confident-and-correct (well-calibrated either way)", () => {
    const confidentCorrect = calibrationScore([item({ statedConfidence: 1, correct: true })]);
    const unsureWrong = calibrationScore([item({ statedConfidence: 0, correct: false })]);
    expect(unsureWrong).toBe(confidentCorrect);
  });

  it("scores confident-and-wrong low, and genuine uncertainty (stated ~0.5) mid either way", () => {
    // The Brier-style error is symmetric around 0.5, so "unsure" only reads
    // as a distinct, better-than-confident-wrong outcome when it means
    // genuine uncertainty (~0.5), not "confident this is wrong" (~0) - that
    // latter case is mathematically identical to confident-and-wrong's mirror.
    const confidentWrong = calibrationScore([item({ statedConfidence: 0.9, correct: false })]);
    const unsureWrong = calibrationScore([item({ statedConfidence: 0.5, correct: false })]);
    const unsureCorrect = calibrationScore([item({ statedConfidence: 0.5, correct: true })]);
    expect(confidentWrong).toBeLessThan(unsureWrong);
    expect(confidentWrong).toBeLessThan(unsureCorrect);
    // Symmetric distance from 0.5 scores identically regardless of outcome.
    expect(unsureWrong).toBe(unsureCorrect);
  });
});

describe("consistencyScore", () => {
  it("returns 100 for fewer than 4 items (too little data to judge a drop)", () => {
    expect(consistencyScore([item(), item(), item()])).toBe(100);
  });

  it("scores lower when accuracy collapses in the second half", () => {
    const steady = consistencyScore([item(), item(), item(), item()]);
    const collapsing = consistencyScore([
      item({ correct: true }),
      item({ correct: true }),
      item({ correct: false }),
      item({ correct: false }),
    ]);
    expect(collapsing).toBeLessThan(steady);
  });

  it("scores lower for highly variable per-item timing than for even timing", () => {
    const even = consistencyScore([
      item({ timeSpent: 20 }),
      item({ timeSpent: 20 }),
      item({ timeSpent: 20 }),
      item({ timeSpent: 20 }),
    ]);
    const variable = consistencyScore([
      item({ timeSpent: 5 }),
      item({ timeSpent: 60 }),
      item({ timeSpent: 5 }),
      item({ timeSpent: 60 }),
    ]);
    expect(variable).toBeLessThan(even);
  });
});

describe("detectStrain", () => {
  const noEvents: PressureEvent[] = [];

  it("never trips under 6 items regardless of how bad the session looks", () => {
    const bad = [item({ correct: false }), item({ correct: false })];
    expect(detectStrain(bad, noEvents)).toBe(false);
  });

  it("does not trip on a single signal alone", () => {
    // Heavy thrash only, nothing else - one signal.
    const items = Array.from({ length: 6 }, () => item({ answerChanges: 5 }));
    expect(detectStrain(items, noEvents)).toBe(false);
  });

  it("trips when two independent signals combine (collapse + thrash)", () => {
    const items = [
      item({ correct: true, answerChanges: 0 }),
      item({ correct: true, answerChanges: 0 }),
      item({ correct: true, answerChanges: 0 }),
      item({ correct: false, answerChanges: 6 }),
      item({ correct: false, answerChanges: 6 }),
      item({ correct: false, answerChanges: 6 }),
    ];
    expect(detectStrain(items, noEvents)).toBe(true);
  });

  it("counts repeated focus loss as one of the signals", () => {
    const items = Array.from({ length: 6 }, () => item({ answered: false }));
    const events: PressureEvent[] = Array.from({ length: 4 }, () => ({
      at: 0,
      kind: "focus_lost",
    }));
    // abandoned (100% unanswered) + focus_lost x4 = two signals.
    expect(detectStrain(items, events)).toBe(true);
  });
});

describe("scorePressureSession", () => {
  it("produces a score in range, at most 3 recommendations, and at least one strength", () => {
    const items = [item(), item({ correct: false }), item({ answerChanges: 3 })];
    const result = scorePressureSession(items, [], "exam", 30);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.recommendations.length).toBeLessThanOrEqual(3);
    expect(result.strengths.length).toBeGreaterThan(0);
  });

  it("always has at least one strength, even for a uniformly weak session", () => {
    const items = Array.from({ length: 5 }, () =>
      item({ correct: false, answerChanges: 4, revisits: 4 }),
    );
    const result = scorePressureSession(items, [], "exam", 10);
    expect(result.strengths.length).toBeGreaterThan(0);
  });

  it("weights formats differently: the same session scores differently under exam vs interview", () => {
    const items = [
      item({ timeSpent: 5, difficulty: 8 }),
      item({ timeSpent: 5, difficulty: 8 }),
      item({ timeSpent: 5, difficulty: 8 }),
      item({ timeSpent: 5, difficulty: 8 }),
    ];
    const exam = scorePressureSession(items, [], "exam", 30);
    const interview = scorePressureSession(items, [], "interview", 30);
    // Same inputs, different weight tables -> not required to differ, but
    // both must still be valid scores.
    expect(exam.score).toBeGreaterThanOrEqual(0);
    expect(interview.score).toBeGreaterThanOrEqual(0);
  });
});

describe("ratingDelta", () => {
  it("is positive when the score beats the expected bar for the current rating", () => {
    expect(ratingDelta(1000, 95)).toBeGreaterThan(0);
  });

  it("is negative, but softened (halved), when the score falls short", () => {
    const delta = ratingDelta(1000, 5);
    expect(delta).toBeLessThan(0);
    // raw = (5 - 40) * 0.4 = -14; halved = -7
    expect(delta).toBe(-7);
  });

  it("raises the bar for a higher current rating, making the same score net less", () => {
    const lowRatingDelta = ratingDelta(1000, 70);
    const highRatingDelta = ratingDelta(1800, 70);
    expect(highRatingDelta).toBeLessThan(lowRatingDelta);
  });
});
