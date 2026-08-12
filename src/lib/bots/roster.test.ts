import { describe, it, expect } from "vitest";
import { generateRoster, pickBotOpponent, isActiveAt, type BotProfile } from "./roster";

/**
 * Opponent selection is the seam where a bot stops being a row and starts
 * being someone the player is looking at, so the properties worth pinning are
 * the ones a player would notice if they broke: a wildly mismatched rating, or
 * the same handle every single match.
 *
 * A fixed seed makes the roster identical run to run, and an explicit `r`
 * removes the other source of nondeterminism — so a failure here is a real
 * behaviour change rather than an unlucky draw.
 */
const ROSTER = generateRoster(300, 20260801);

/** Deterministic stand-in for Math.random that cycles a fixed sequence. */
function seq(values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i += 1;
    return v ?? 0.5;
  };
}

describe("pickBotOpponent", () => {
  it("returns a bot within 120 rating when the roster has one", () => {
    // Every bot in the roster is a candidate for some rating, so sample across
    // the ladder rather than trusting one lucky point.
    for (const rating of [700, 900, 1000, 1200, 1500, 1800, 2100]) {
      const near = ROSTER.filter((b) => Math.abs(b.rating - rating) <= 120);
      if (near.length === 0) continue;
      const bot = pickBotOpponent(rating, seq([0.5]), 12, ROSTER);
      expect(Math.abs(bot.rating - rating)).toBeLessThanOrEqual(120);
    }
  });

  it("prefers a bot whose schedule says it is awake", () => {
    const hour = 3; // deep night — only night owls are active
    const bot = pickBotOpponent(1200, seq([0.5]), hour, ROSTER);
    const nearAndAwake = ROSTER.filter(
      (b) => Math.abs(b.rating - 1200) <= 120 && isActiveAt(b, hour),
    );
    // Only assert the preference when the schedule slice is actually non-empty;
    // otherwise the function is correct to ignore it.
    if (nearAndAwake.length > 0) expect(isActiveAt(bot, hour)).toBe(true);
  });

  it("widens the rating window rather than failing when nobody is close", () => {
    // A rating far outside the generated population: no bot is within 120, so
    // the caller must still get an opponent instead of an exception.
    const bot = pickBotOpponent(9999, seq([0.5]), 12, ROSTER);
    expect(bot).toBeDefined();
    expect(bot.isBot).toBe(true);
  });

  it("does not return the same opponent every time", () => {
    // The player notices a repeated handle faster than a repeated rating.
    const names = new Set(
      Array.from(
        { length: 40 },
        (_, i) => pickBotOpponent(1200, seq([i / 40]), 12, ROSTER).username,
      ),
    );
    expect(names.size).toBeGreaterThan(1);
  });

  it("throws on an empty roster rather than returning undefined", () => {
    expect(() => pickBotOpponent(1200, seq([0.5]), 12, [])).toThrow(/empty roster/);
  });

  it("only ever returns bots that are flagged as bots", () => {
    // The flag is what the ladder labels from and what the disclosure copy
    // rests on. It must survive selection even though the battle UI hides it.
    const picks: BotProfile[] = Array.from({ length: 25 }, (_, i) =>
      pickBotOpponent(1000 + i * 40, seq([i / 25]), i % 24, ROSTER),
    );
    expect(picks.every((b) => b.isBot === true)).toBe(true);
  });
});
