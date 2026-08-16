import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `deriveState` is the rule that decides whether a learner sees a concept in
 * their weak spots. Two properties matter and neither is obvious from reading
 * it: a state can never fall as a learner answers more correctly, and thin
 * evidence can never buy a high state - three lucky answers must not read as
 * "mastered" and quietly drop a topic out of practice.
 *
 * `recordOutcomes` is tested against stubbed repositories: the point is the
 * merge arithmetic on top of existing rows, not the SQL.
 */

const insertBattleQuestionRecords = vi.fn<(rows: unknown[]) => Promise<void>>();
const getConceptMasteryEvidence =
  vi.fn<(userId: string, concepts: string[]) => Promise<unknown[]>>();
const upsertConceptMastery = vi.fn<(rows: unknown[]) => Promise<void>>();
const getWeakConceptRows = vi.fn<(userId: string, limit: number) => Promise<unknown[]>>();

// The factories run lazily, on first import of the mocked module, so they can
// close over the consts above even though `vi.mock` itself is hoisted.
vi.mock("@/repositories/battles", () => ({ insertBattleQuestionRecords }));
vi.mock("@/repositories/courses", () => ({
  getConceptMasteryEvidence,
  upsertConceptMastery,
  getWeakConceptRows,
}));

const { deriveState, getWeakConcepts, recordOutcomes } = await import("./concept-mastery");

const STATE_ORDER = ["struggling", "developing", "solid", "mastered"] as const;

function outcome(over: Partial<Parameters<typeof recordOutcomes>[1][number]> = {}) {
  return {
    concept: "Algebra",
    subject: "Mathematics",
    difficulty: "medium",
    correct: true,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getConceptMasteryEvidence.mockResolvedValue([]);
  insertBattleQuestionRecords.mockResolvedValue(undefined);
  upsertConceptMastery.mockResolvedValue(undefined);
  getWeakConceptRows.mockResolvedValue([]);
});

describe("deriveState", () => {
  it("never promotes past developing on thin evidence", () => {
    // Two perfect answers is luck, not mastery.
    for (const evidence of [0, 1, 2]) {
      expect(deriveState(1, evidence), `evidence=${evidence}`).toBe("developing");
      expect(deriveState(0, evidence), `evidence=${evidence}`).toBe("struggling");
    }
  });

  it("separates the bands once there is enough evidence", () => {
    expect(deriveState(0.2, 10)).toBe("struggling");
    expect(deriveState(0.5, 10)).toBe("developing");
    expect(deriveState(0.8, 10)).toBe("solid");
    expect(deriveState(0.95, 10)).toBe("mastered");
  });

  it("never falls as accuracy rises", () => {
    for (const evidence of [1, 3, 10, 50]) {
      let lowest = 0;
      for (let ratio = 0; ratio <= 1.0001; ratio += 0.02) {
        const rank = STATE_ORDER.indexOf(deriveState(ratio, evidence));
        expect(rank, `ratio=${ratio.toFixed(2)} evidence=${evidence}`).toBeGreaterThanOrEqual(
          lowest,
        );
        lowest = rank;
      }
    }
  });

  it("returns a known state for every input", () => {
    for (const evidence of [0, 2, 3, 100]) {
      for (const ratio of [0, 0.44, 0.45, 0.69, 0.7, 0.89, 0.9, 1]) {
        expect(STATE_ORDER).toContain(deriveState(ratio, evidence));
      }
    }
  });
});

describe("recordOutcomes", () => {
  it("does nothing without a user or without outcomes", async () => {
    await recordOutcomes("", [outcome()]);
    await recordOutcomes("u1", []);
    expect(insertBattleQuestionRecords).not.toHaveBeenCalled();
  });

  it("appends every answer to the evidence stream", async () => {
    await recordOutcomes("u1", [outcome({ correct: true }), outcome({ correct: false })]);
    const rows = insertBattleQuestionRecords.mock.calls[0]?.[0] ?? [];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ user_id: "u1", concept: "Algebra", correct: true });
  });

  it("stores a missing time as null rather than undefined", async () => {
    await recordOutcomes("u1", [outcome()]);
    const rows = insertBattleQuestionRecords.mock.calls[0]?.[0] as { time_spent: unknown }[];
    expect(rows[0]?.time_spent).toBeNull();
  });

  it("folds several answers on one concept into a single row", async () => {
    await recordOutcomes("u1", [
      outcome({ correct: true }),
      outcome({ correct: true }),
      outcome({ correct: false }),
    ]);
    const rows = upsertConceptMastery.mock.calls[0]?.[0] as {
      concept: string;
      evidence_count: number;
      correct_count: number;
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ concept: "Algebra", evidence_count: 3, correct_count: 2 });
  });

  it("keeps concepts separate", async () => {
    await recordOutcomes("u1", [
      outcome({ concept: "Algebra" }),
      outcome({ concept: "Fractions", correct: false }),
    ]);
    const rows = upsertConceptMastery.mock.calls[0]?.[0] as { concept: string }[];
    expect(rows.map((r) => r.concept).sort()).toEqual(["Algebra", "Fractions"]);
  });

  it("adds this batch onto the evidence already stored", async () => {
    getConceptMasteryEvidence.mockResolvedValue([
      { concept: "Algebra", evidence_count: 8, correct_count: 4 },
    ]);
    await recordOutcomes("u1", [outcome({ correct: true }), outcome({ correct: true })]);
    const rows = upsertConceptMastery.mock.calls[0]?.[0] as {
      evidence_count: number;
      correct_count: number;
      confidence: number;
      state: string;
    }[];
    expect(rows[0]).toMatchObject({ evidence_count: 10, correct_count: 6, confidence: 0.6 });
    expect(rows[0]?.state).toBe("developing");
  });

  it("schedules a struggling concept sooner than a mastered one", async () => {
    await recordOutcomes("weak", [outcome({ correct: false }), outcome({ correct: false })]);
    const weakRow = (upsertConceptMastery.mock.calls[0]?.[0] as { next_review: string }[])[0];

    getConceptMasteryEvidence.mockResolvedValue([
      { concept: "Algebra", evidence_count: 20, correct_count: 20 },
    ]);
    await recordOutcomes("strong", [outcome({ correct: true })]);
    const strongRow = (upsertConceptMastery.mock.calls[1]?.[0] as { next_review: string }[])[0];

    expect(new Date(weakRow.next_review).getTime()).toBeLessThan(
      new Date(strongRow.next_review).getTime(),
    );
  });

  it("swallows a write failure instead of taking the battle down with it", async () => {
    // Mastery is a side effect of playing; losing it must never cost a result.
    insertBattleQuestionRecords.mockRejectedValue(new Error("relation does not exist"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(recordOutcomes("u1", [outcome()])).resolves.toBeUndefined();
  });
});

describe("getWeakConcepts", () => {
  it("returns nothing for a signed-out user without querying", async () => {
    expect(await getWeakConcepts("")).toEqual([]);
    expect(getWeakConceptRows).not.toHaveBeenCalled();
  });

  it("maps stored rows onto the shape Practice reads", async () => {
    getWeakConceptRows.mockResolvedValue([
      {
        concept: "Fractions",
        subject: "Mathematics",
        state: "struggling",
        confidence: 0.3,
        evidence_count: 9,
      },
    ]);
    expect(await getWeakConcepts("u1")).toEqual([
      {
        concept: "Fractions",
        subject: "Mathematics",
        state: "struggling",
        confidence: 0.3,
        evidenceCount: 9,
      },
    ]);
  });

  it("degrades to an empty list when the read fails", async () => {
    getWeakConceptRows.mockRejectedValue(new Error("offline"));
    expect(await getWeakConcepts("u1")).toEqual([]);
  });
});
