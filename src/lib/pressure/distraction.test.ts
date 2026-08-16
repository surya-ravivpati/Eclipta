import { describe, it, expect } from "vitest";
import { planInterruptions } from "./distraction";
import { at } from "@/lib/test-helpers";

/**
 * Only the scheduling half of the distraction layer is tested here. The rest
 * synthesises room tone through Web Audio, which does not exist in Node and
 * would need a real browser to mean anything.
 *
 * The scheduling is worth pinning on its own, because it encodes a teaching
 * decision rather than a technical one: interruptions stop before the end of a
 * session, since interrupting someone during their final minutes teaches
 * nothing and only costs them marks.
 */

describe("planInterruptions", () => {
  it("returns nothing when none were asked for", () => {
    expect(planInterruptions(600, 0)).toEqual([]);
    expect(planInterruptions(600, -1)).toEqual([]);
  });

  it("returns nothing for a session too short to interrupt", () => {
    // Under two minutes there is no room to break concentration and recover.
    expect(planInterruptions(60, 3)).toEqual([]);
    expect(planInterruptions(119, 3)).toEqual([]);
  });

  it("schedules as many interruptions as asked", () => {
    expect(planInterruptions(1200, 3)).toHaveLength(3);
  });

  it("keeps every interruption inside the session", () => {
    for (let i = 0; i < 50; i++) {
      for (const delay of planInterruptions(600, 4)) {
        expect(delay).toBeGreaterThan(0);
        expect(delay).toBeLessThan(600);
      }
    }
  });

  it("leaves the last stretch of the session alone", () => {
    // The 20% tail is deliberate: nobody learns from being interrupted while
    // they are finishing. Sampled repeatedly because the spacing is jittered.
    const duration = 1000;
    for (let i = 0; i < 100; i++) {
      for (const delay of planInterruptions(duration, 3)) {
        expect(delay).toBeLessThan(duration * 0.9);
      }
    }
  });

  it("spreads them out rather than bunching at one moment", () => {
    const delays = planInterruptions(1800, 3).sort((a, b) => a - b);
    expect(delays).toHaveLength(3);
    const gaps = delays.slice(1).map((d, i) => d - at(delays, i));
    for (const gap of gaps) expect(gap).toBeGreaterThan(0);
  });

  it("varies between runs, so a repeat session is not identical", () => {
    const runs = new Set(Array.from({ length: 20 }, () => planInterruptions(1200, 3).join(",")));
    expect(runs.size).toBeGreaterThan(1);
  });
});
