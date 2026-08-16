import { describe, it, expect } from "vitest";
import { RATING_LEAGUES } from "@/config/battle-tuning";
import { formatRatingDelta, leagueProgress, ratingLeague, ratingToTier } from "./rating";
import { first, need } from "./test-helpers";

/**
 * The league a rating falls into is what a player actually sees - "Gold",
 * "Champion" - so the boundaries have to be exact and total. Every rating maps
 * to exactly one league, including 0 and including anything above the top
 * floor, where there is no ceiling to compare against.
 */

describe("ratingLeague", () => {
  it("covers every rating from zero upward", () => {
    for (let r = 0; r <= 2600; r += 25) {
      expect(ratingLeague(r), `no league for ${r}`).toBeDefined();
    }
  });

  it("puts a rating in the league whose floor it has reached", () => {
    for (const league of RATING_LEAGUES) {
      expect(ratingLeague(league.floor).id).toBe(league.id);
    }
  });

  it("puts the rating just below a floor in the league beneath", () => {
    for (const league of RATING_LEAGUES) {
      if (league.floor === 0) continue;
      expect(ratingLeague(league.floor - 1).id).not.toBe(league.id);
    }
  });

  it("keeps climbing ratings in the open-ended top league", () => {
    const top = RATING_LEAGUES[RATING_LEAGUES.length - 1];
    expect(top?.ceiling).toBeNull();
    expect(ratingLeague(9999).id).toBe(top?.id);
  });

  it("floors a rating below the first league rather than failing", () => {
    expect(ratingLeague(-100).id).toBe(first(RATING_LEAGUES).id);
  });
});

describe("ratingToTier", () => {
  it("names the league a rating sits in", () => {
    for (const league of RATING_LEAGUES) {
      expect(ratingToTier(league.floor)).toBe(league.name);
    }
  });
});

describe("leagueProgress", () => {
  it("is 0 at a league floor and approaches 1 at its ceiling", () => {
    const gold = RATING_LEAGUES.find((l) => l.id === "gold");
    expect(gold).toBeDefined();
    expect(leagueProgress(gold!.floor).pct).toBe(0);
    expect(leagueProgress(need(gold?.ceiling) - 1).pct).toBeGreaterThan(0.9);
  });

  it("stays inside 0 and 1 across the whole ladder", () => {
    for (let r = 0; r <= 2600; r += 25) {
      const { pct } = leagueProgress(r);
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(1);
    }
  });

  it("reports the points still needed for the next league", () => {
    const silver = RATING_LEAGUES.find((l) => l.id === "silver");
    expect(silver).toBeDefined();
    const { toNext, next } = leagueProgress(silver!.floor);
    expect(next?.id).toBe("gold");
    expect(toNext).toBe(need(silver?.ceiling) - need(silver).floor);
  });

  it("has nothing left to climb in the top league", () => {
    const { pct, toNext, next } = leagueProgress(9999);
    expect(pct).toBe(1);
    expect(toNext).toBeNull();
    expect(next).toBeNull();
  });
});

describe("formatRatingDelta", () => {
  it("signs a gain and a loss", () => {
    expect(formatRatingDelta(1000, 1018)).toBe("+18");
    expect(formatRatingDelta(1000, 988)).toBe("-12");
  });

  it("shows no change as a signed zero rather than a bare one", () => {
    expect(formatRatingDelta(1000, 1000)).toBe("+0");
  });
});
