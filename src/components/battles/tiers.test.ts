import { describe, expect, it } from "vitest";
import { tierColors } from "./tiers";
import { RATING_LEAGUES } from "@/config/battle-tuning";
import { TIER_THRESHOLDS } from "@/lib/trophy-road-data";

/**
 * Two ladders share this table, and a name missing from it renders as an
 * uncoloured row rather than as an error - so nothing would say the table had
 * fallen behind a newly added realm or league.
 */

describe("tierColors", () => {
  it("colours every Expedition realm the XP board can show", () => {
    for (const tier of TIER_THRESHOLDS) {
      expect(tierColors[tier.name], tier.name).toBeDefined();
    }
  });

  it("colours every competitive league the rating board can show", () => {
    for (const league of RATING_LEAGUES) {
      expect(tierColors[league.name], league.name).toBeDefined();
    }
  });

  it("names a real utility class for each", () => {
    for (const [name, className] of Object.entries(tierColors)) {
      expect(className, name).toMatch(/^text-tier-[a-z]+$/);
    }
  });
});
