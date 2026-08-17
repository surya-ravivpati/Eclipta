import { describe, it, expect } from "vitest";
import {
  botAccuracyFor,
  defaultRoster,
  driftRating,
  generateRoster,
  isActiveAt,
  pickBotOpponent,
  rosterStats,
  type BotProfile,
} from "./roster";
import { first } from "@/lib/test-helpers";

/**
 * Opponent selection is the seam where a bot stops being a row and starts
 * being someone the player is looking at, so the properties worth pinning are
 * the ones a player would notice if they broke: a wildly mismatched rating, or
 * the same handle every single match.
 *
 * A fixed seed makes the roster identical run to run, and an explicit `r`
 * removes the other source of nondeterminism - so a failure here is a real
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
    const hour = 3; // deep night - only night owls are active
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

/**
 * The roster is meant to read as a population of people, not a table of rows.
 * That intent lives in distributions rather than in any single field, so these
 * check the shape: a spread of ratings rather than a clump, unique handles,
 * and histories whose numbers agree with each other. A player who scrolls a
 * leaderboard notices when they do not.
 */
describe("generateRoster", () => {
  it("is reproducible from its seed", () => {
    expect(generateRoster(40, 12345)).toEqual(generateRoster(40, 12345));
  });

  it("produces a different population from a different seed", () => {
    const a = generateRoster(40, 1).map((b) => b.username);
    const b = generateRoster(40, 2).map((b) => b.username);
    expect(a).not.toEqual(b);
  });

  it("never repeats a handle", () => {
    const stats = rosterStats(ROSTER);
    expect(stats.uniqueNames).toBe(stats.count);
  });

  it("flags every member as a bot, on the record itself", () => {
    expect(rosterStats(ROSTER).allFlaggedAsBots).toBe(true);
  });

  it("spreads ratings across a ladder instead of clumping", () => {
    const { ratingMin, ratingP25, ratingMedian, ratingP75, ratingMax } = rosterStats(ROSTER);
    expect(ratingMin).toBeLessThan(ratingP25);
    expect(ratingP25).toBeLessThan(ratingMedian);
    expect(ratingMedian).toBeLessThan(ratingP75);
    expect(ratingP75).toBeLessThan(ratingMax);
  });

  it("keeps every rating inside the ladder's bounds", () => {
    for (const bot of ROSTER) {
      expect(bot.rating, bot.username).toBeGreaterThanOrEqual(500);
      expect(bot.rating).toBeLessThanOrEqual(2400);
    }
  });

  it("gives nobody a peak below their current rating", () => {
    // A profile whose best-ever is worse than today reads as a bug.
    for (const bot of ROSTER) {
      expect(bot.peakRating, bot.username).toBeGreaterThanOrEqual(bot.rating);
    }
  });

  it("gives everyone a history and hours they are awake", () => {
    for (const bot of ROSTER) {
      expect(bot.progression.length, bot.username).toBeGreaterThan(0);
      expect(bot.activeHours.length).toBeGreaterThan(0);
      for (const hour of bot.activeHours) {
        expect(hour).toBeGreaterThanOrEqual(0);
        expect(hour).toBeLessThan(24);
      }
    }
  });

  it("never claims a best streak shorter than the current one", () => {
    for (const bot of ROSTER) {
      expect(bot.bestStreak, bot.username).toBeGreaterThanOrEqual(bot.currentStreak);
    }
  });
});

describe("defaultRoster", () => {
  it("builds the population once and reuses it", () => {
    // Matchmaking asks on every battle; regenerating 300 histories each time
    // would be work done to throw away.
    expect(defaultRoster()).toBe(defaultRoster());
  });
});

describe("botAccuracyFor", () => {
  const bot = first(ROSTER);

  it("stays inside bounds that read as a person", () => {
    // Never perfect, never hopeless - at either extreme it stops being an
    // opponent and becomes an obstacle.
    for (const roll of [0, 0.25, 0.5, 0.75, 1]) {
      for (const difficulty of [0, 5, 10]) {
        const accuracy = botAccuracyFor(bot, difficulty, () => roll);
        expect(accuracy).toBeGreaterThanOrEqual(0.2);
        expect(accuracy).toBeLessThanOrEqual(0.94);
      }
    }
  });

  it("does worse on a harder question", () => {
    const easy = botAccuracyFor(bot, 1, () => 0.5);
    const hard = botAccuracyFor(bot, 9, () => 0.5);
    expect(hard).toBeLessThan(easy);
  });

  it("varies between questions rather than being a fixed probability", () => {
    // The wobble is what makes a strong bot fumbling an easy one read as human.
    const low = botAccuracyFor(bot, 5, () => 0);
    const high = botAccuracyFor(bot, 5, () => 1);
    expect(high).toBeGreaterThan(low);
  });
});

describe("driftRating", () => {
  const bot = first(ROSTER);

  it("stays inside the ladder however long it runs", () => {
    for (const days of [1, 7, 90, 1000]) {
      for (const roll of [0, 0.5, 1]) {
        const rating = driftRating(bot, days, () => roll);
        expect(rating, `days=${days} roll=${roll}`).toBeGreaterThanOrEqual(500);
        expect(rating).toBeLessThanOrEqual(2400);
      }
    }
  });

  it("cannot leap past a human overnight", () => {
    // Capped per day, so a returning player never finds the board rearranged.
    const moved = driftRating(bot, 1, () => 1);
    expect(Math.abs(moved - bot.rating)).toBeLessThanOrEqual(40);
  });

  it("returns a whole rating, not a fraction", () => {
    expect(Number.isInteger(driftRating(bot, 3, () => 0.7))).toBe(true);
  });
});

describe("isActiveAt", () => {
  it("agrees with the hours on the profile", () => {
    const bot = first(ROSTER);
    for (const hour of bot.activeHours) expect(isActiveAt(bot, hour)).toBe(true);

    const asleep = [...Array(24).keys()].filter((h) => !bot.activeHours.includes(h));
    for (const hour of asleep) expect(isActiveAt(bot, hour)).toBe(false);
  });
});
