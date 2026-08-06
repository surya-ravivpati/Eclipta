import { describe, expect, it } from "vitest";
import { planInterruptions } from "./distraction";

describe("planInterruptions", () => {
  it("returns nothing for a non-positive count", () => {
    expect(planInterruptions(600, 0)).toEqual([]);
    expect(planInterruptions(600, -1)).toEqual([]);
  });

  it("returns nothing for a session shorter than 120 seconds, regardless of count", () => {
    expect(planInterruptions(119, 3)).toEqual([]);
  });

  it("returns exactly `count` timestamps for a valid session", () => {
    const result = planInterruptions(600, 4);
    expect(result).toHaveLength(4);
  });

  it("never schedules an interruption before the session starts or after it ends", () => {
    for (let trial = 0; trial < 50; trial++) {
      const result = planInterruptions(600, 5);
      for (const t of result) {
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThanOrEqual(600);
      }
    }
  });

  it("spaces interruptions roughly evenly across the usable (first 80%) window", () => {
    // With generous jitter tolerance, each timestamp should land near its
    // slot: usable=480 (600*0.8), spacing=480/(4+1)=96, slots at 96,192,288,384.
    const result = planInterruptions(600, 4);
    const expectedSlots = [96, 192, 288, 384];
    result.forEach((t, i) => {
      // Jitter is +/- 20% of spacing (96 * 0.2 = 19.2).
      expect(Math.abs(t - expectedSlots[i])).toBeLessThanOrEqual(20);
    });
  });

  it("is exactly at the 120-second boundary: still returns [] one second short, but works at exactly 120", () => {
    expect(planInterruptions(120, 1)).toHaveLength(1);
  });
});
