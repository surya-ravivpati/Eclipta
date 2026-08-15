import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  detectFatigue,
  escalateHint,
  getAccuracy,
  getLunaContext,
  getSessionElapsedMs,
  isSessionActive,
  pauseSession,
  recordAnswer,
  resetHintLevel,
  resetSession,
  resumeSession,
  subscribeFatigue,
  updateLunaContext,
} from "./luna-context";

/**
 * Luna's learning context is module-level state, so every test resets it first.
 *
 * Two behaviours here are worth guarding. The session clock is accumulated
 * across active periods rather than measured from a start timestamp, precisely
 * so a tab left open overnight does not come back claiming a nine-hour study
 * session - the comment in the module says as much, and nothing tested it. And
 * fatigue drives whether Luna offers a break, so the thresholds that trigger it
 * are a product decision, not an implementation detail.
 */

beforeEach(() => {
  resetSession();
  resetHintLevel();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("recordAnswer", () => {
  it("counts a correct answer and grows the streak", () => {
    recordAnswer(true, 3000);
    recordAnswer(true, 3000);
    const c = getLunaContext();
    expect(c.totalQuestions).toBe(2);
    expect(c.correctAnswers).toBe(2);
    expect(c.streak).toBe(2);
  });

  it("breaks the streak on a wrong answer", () => {
    recordAnswer(true, 3000);
    recordAnswer(false, 3000);
    const c = getLunaContext();
    expect(c.streak).toBe(0);
    expect(c.consecutiveErrors).toBe(1);
    expect(c.incorrectCount).toBe(1);
  });

  it("clears the error run as soon as one lands", () => {
    recordAnswer(false, 3000);
    recordAnswer(false, 3000);
    recordAnswer(true, 3000);
    expect(getLunaContext().consecutiveErrors).toBe(0);
  });

  it("counts a fast wrong answer as a rapid guess, but a fast right one not", () => {
    recordAnswer(false, 500);
    expect(getLunaContext().rapidGuessCount).toBe(1);
    recordAnswer(true, 500);
    expect(getLunaContext().rapidGuessCount).toBe(0);
  });

  it("keeps a rolling average of response time in seconds", () => {
    recordAnswer(true, 2000);
    recordAnswer(true, 4000);
    expect(getLunaContext().avgResponseTime).toBeCloseTo(3, 5);
  });
});

describe("detectFatigue", () => {
  it("is none on a clean start", () => {
    expect(detectFatigue()).toBe("none");
  });

  it("goes mild after three errors in a row and severe after five", () => {
    for (let i = 0; i < 3; i++) recordAnswer(false, 5000);
    expect(detectFatigue()).toBe("mild");
    for (let i = 0; i < 2; i++) recordAnswer(false, 5000);
    expect(detectFatigue()).toBe("severe");
  });

  it("also reads repeated rapid guessing as fatigue", () => {
    // Two fast wrong answers is the mild threshold even though the error run
    // is only two - guessing is its own signal.
    recordAnswer(false, 400);
    recordAnswer(false, 400);
    expect(detectFatigue()).toBe("mild");
  });

  it("notifies a subscriber when the level changes, and stops after unsubscribe", () => {
    const seen: string[] = [];
    const off = subscribeFatigue((level) => seen.push(level));
    for (let i = 0; i < 3; i++) recordAnswer(false, 5000);
    expect(seen).toContain("mild");
    const count = seen.length;
    off();
    for (let i = 0; i < 3; i++) recordAnswer(false, 5000);
    expect(seen.length).toBe(count);
  });
});

describe("hints", () => {
  it("escalates one level at a time and stops at the top", () => {
    expect(escalateHint()).toBe(1);
    expect(escalateHint()).toBe(2);
    expect(escalateHint()).toBe(3);
    expect(escalateHint()).toBe(3);
  });

  it("resets back to no hint", () => {
    escalateHint();
    resetHintLevel();
    expect(getLunaContext().hintLevel).toBe(0);
  });
});

describe("the session clock", () => {
  it("accumulates while active", () => {
    vi.useFakeTimers();
    resetSession();
    vi.advanceTimersByTime(60_000);
    expect(getSessionElapsedMs()).toBeGreaterThanOrEqual(60_000);
  });

  it("stops accumulating while paused - the whole point of pause/resume", () => {
    vi.useFakeTimers();
    resetSession();
    vi.advanceTimersByTime(10_000);
    pauseSession();
    const atPause = getSessionElapsedMs();
    // A tab left in the background overnight must not come back claiming the
    // time as study.
    vi.advanceTimersByTime(9 * 60 * 60 * 1000);
    expect(getSessionElapsedMs()).toBe(atPause);
  });

  it("picks up again on resume without losing what came before", () => {
    vi.useFakeTimers();
    resetSession();
    vi.advanceTimersByTime(10_000);
    pauseSession();
    vi.advanceTimersByTime(60_000);
    resumeSession();
    vi.advanceTimersByTime(5_000);
    expect(getSessionElapsedMs()).toBeGreaterThanOrEqual(15_000);
    expect(getSessionElapsedMs()).toBeLessThan(20_000);
  });

  it("is safe to pause or resume repeatedly", () => {
    vi.useFakeTimers();
    resetSession();
    pauseSession();
    pauseSession();
    expect(isSessionActive()).toBe(false);
    resumeSession();
    resumeSession();
    expect(isSessionActive()).toBe(true);
  });
});

describe("getAccuracy", () => {
  it("is 0 before any question is answered, not NaN", () => {
    expect(getAccuracy()).toBe(0);
  });

  it("reports the percentage answered correctly, not a fraction", () => {
    recordAnswer(true, 1000);
    recordAnswer(false, 1000);
    expect(getAccuracy()).toBe(50);
  });
});

describe("updateLunaContext", () => {
  it("merges a partial update without clearing the rest", () => {
    recordAnswer(true, 1000);
    updateLunaContext({ lessonTitle: "Limits" });
    const c = getLunaContext();
    expect(c.lessonTitle).toBe("Limits");
    expect(c.totalQuestions).toBe(1);
  });
});
