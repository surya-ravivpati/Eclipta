import { describe, it, expect } from "vitest";
import { pickDrillTopic, rankWeakTopics, tallyTopics } from "./weak-spot";
import type { QuestionRecord } from "./types";

/** A record carrying only the fields the ranking actually reads. */
function rec(topic: string, correct: boolean): QuestionRecord {
  return {
    question: { topic, difficulty: "medium" },
    correct,
    timeSpent: 5,
    action: "attack",
  } as unknown as QuestionRecord;
}

describe("tallyTopics", () => {
  it("counts totals and misses per topic", () => {
    const t = tallyTopics([rec("Algebra", false), rec("Algebra", true), rec("Division", true)]);
    expect(t.get("Algebra")).toMatchObject({ total: 2, wrong: 1, missRate: 0.5 });
    expect(t.get("Division")).toMatchObject({ total: 1, wrong: 0, missRate: 0 });
  });

  it("returns an empty map for an empty battle", () => {
    expect(tallyTopics([]).size).toBe(0);
  });
});

describe("rankWeakTopics", () => {
  it("omits topics the learner got entirely right", () => {
    const ranked = rankWeakTopics([rec("Algebra", true), rec("Division", false)]);
    expect(ranked.map((t) => t.topic)).toEqual(["Division"]);
  });

  it("ranks by miss count, not miss rate", () => {
    // This is the whole reason the module exists. Exponents was seen once and
    // missed once (rate 1.00); Algebra was missed three times out of five
    // (rate 0.60). Rate-first ranking sends the learner to drill Exponents on
    // the strength of a single unlucky question, which is the wrong lesson.
    const records = [
      rec("Exponents", false),
      rec("Algebra", false),
      rec("Algebra", false),
      rec("Algebra", false),
      rec("Algebra", true),
      rec("Algebra", true),
    ];
    expect(rankWeakTopics(records).map((t) => t.topic)).toEqual(["Algebra", "Exponents"]);
    expect(pickDrillTopic(records)).toBe("Algebra");
  });

  it("breaks a miss-count tie with the higher miss rate", () => {
    // Both missed twice, but Division was only seen twice.
    const records = [
      rec("Division", false),
      rec("Division", false),
      rec("Algebra", false),
      rec("Algebra", false),
      rec("Algebra", true),
      rec("Algebra", true),
    ];
    expect(rankWeakTopics(records)[0]?.topic).toBe("Division");
  });

  it("is deterministic when count and rate both tie", () => {
    // Same battle must always yield the same recommendation, or the report and
    // the practice session can disagree between renders.
    const records = [rec("Subtraction", false), rec("Addition", false)];
    expect(rankWeakTopics(records).map((t) => t.topic)).toEqual(["Addition", "Subtraction"]);
  });
});

describe("pickDrillTopic", () => {
  it("returns null for a flawless battle rather than inventing a weak spot", () => {
    expect(pickDrillTopic([rec("Algebra", true), rec("Division", true)])).toBeNull();
  });

  it("returns null for a battle with no records", () => {
    expect(pickDrillTopic([])).toBeNull();
  });

  it("returns the only missed topic when there is just one", () => {
    expect(pickDrillTopic([rec("Algebra", true), rec("Exponents", false)])).toBe("Exponents");
  });
});
