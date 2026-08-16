import { describe, it, expect } from "vitest";
import {
  CALIBRATION_QUESTION_COUNT,
  CALIBRATION_STEPS,
  describeProfile,
  inferProfile,
  profileToLunaBlock,
  type CalibrationResponse,
  type Confidence,
  type ItemRole,
} from "./luna-calibration";

/**
 * Calibration runs once and then shapes every Luna session afterwards, so a
 * wrong inference is not a wrong pixel - it is months of the tutor pitching at
 * the wrong level. All of the scoring is pure and none of it was covered.
 *
 * The cases worth pinning are the ones where the code makes a judgement rather
 * than a measurement: a rapid wrong guess meaning low struggle tolerance rather
 * than high, confidence being read against accuracy rather than on its own, and
 * a skipped calibration degrading to a neutral profile instead of an extreme
 * one.
 */

const NOW = new Date("2026-03-15T12:00:00Z");

function res(role: ItemRole, over: Partial<CalibrationResponse> = {}): CalibrationResponse {
  return {
    itemId: `${role}-item`,
    role,
    correct: true,
    ms: 20_000,
    confidence: 3,
    action: "answered",
    ...over,
  };
}

describe("the calibration script", () => {
  it("has steps, and counts only the question ones", () => {
    expect(CALIBRATION_STEPS.length).toBeGreaterThan(0);
    const questions = CALIBRATION_STEPS.filter((s) => s.kind === "question").length;
    expect(CALIBRATION_QUESTION_COUNT).toBe(questions);
  });

  it("gives every question item a unique id", () => {
    const ids = CALIBRATION_STEPS.filter((s) => s.kind === "question").map((s) =>
      s.kind === "question" ? s.item.id : "",
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("inferProfile - degenerate input", () => {
  it("returns a neutral profile when nothing was answered", () => {
    // Someone who skips calibration must not be modelled as an extreme.
    const p = inferProfile([], NOW);
    expect(p.pace).toBe("standard");
    expect(p.chunk_size).toBe("medium");
    expect(p.struggle_tolerance).toBe("medium");
    expect(p.metacognition).toBe("calibrated");
    expect(p.lean).toBe("balanced");
  });

  it("reports low confidence in a profile built from nothing", () => {
    const empty = inferProfile([], NOW);
    const full = inferProfile(
      Array.from({ length: 8 }, (_, i) => res("procedural", { itemId: `q${i}` })),
      NOW,
    );
    expect(full.confidence).toBeGreaterThan(empty.confidence);
  });

  it("never claims certainty, however much it saw", () => {
    const many = inferProfile(
      Array.from({ length: 40 }, (_, i) => res("procedural", { itemId: `q${i}` })),
      NOW,
    );
    expect(many.confidence).toBeLessThanOrEqual(0.7);
  });

  it("stamps the calibration date", () => {
    expect(inferProfile([], NOW).calibrated_at).toBe("2026-03-15");
  });
});

describe("inferProfile - pace", () => {
  it("reads consistently quick answers as fast", () => {
    const rs = [
      res("procedural", { ms: 6_000 }),
      res("conceptual", { ms: 7_000 }),
      res("chunk", { ms: 8_000 }),
    ];
    expect(inferProfile(rs, NOW).pace).toBe("fast");
  });

  it("reads consistently slow answers as deliberate", () => {
    const rs = [
      res("procedural", { ms: 45_000 }),
      res("conceptual", { ms: 50_000 }),
      res("chunk", { ms: 60_000 }),
    ];
    expect(inferProfile(rs, NOW).pace).toBe("deliberate");
  });
});

describe("inferProfile - struggle tolerance", () => {
  it("treats skipping the hard item as low tolerance", () => {
    const p = inferProfile([res("struggle", { action: "skipped", correct: false })], NOW);
    expect(p.struggle_tolerance).toBe("low");
  });

  it("treats taking a hint as middling", () => {
    const p = inferProfile([res("struggle", { action: "hint", correct: false })], NOW);
    expect(p.struggle_tolerance).toBe("medium");
  });

  it("treats a rapid wrong guess as low, not high", () => {
    // This is the judgement worth guarding: answering fast and wrong is
    // bailing out, not persistence, and the naive read would be the opposite.
    const p = inferProfile([res("struggle", { correct: false, ms: 3_000 })], NOW);
    expect(p.struggle_tolerance).toBe("low");
  });

  it("treats a long wrong attempt as high tolerance", () => {
    const p = inferProfile([res("struggle", { correct: false, ms: 30_000 })], NOW);
    expect(p.struggle_tolerance).toBe("high");
  });
});

describe("inferProfile - scaffold preference", () => {
  it("prefers the mode that actually transferred", () => {
    expect(
      inferProfile(
        [res("transfer_worked", { correct: true }), res("transfer_socratic", { correct: false })],
        NOW,
      ).scaffold,
    ).toBe("worked_example_first");

    expect(
      inferProfile(
        [res("transfer_worked", { correct: false }), res("transfer_socratic", { correct: true })],
        NOW,
      ).scaffold,
    ).toBe("socratic_first");
  });

  it("falls back to the more fluent mode when both landed", () => {
    const p = inferProfile(
      [
        res("transfer_worked", { correct: true, confidence: 2 as Confidence }),
        res("transfer_socratic", { correct: true, confidence: 4 as Confidence }),
      ],
      NOW,
    );
    expect(p.scaffold).toBe("socratic_first");
  });

  it("defaults to worked-example-first when there is nothing to go on", () => {
    expect(inferProfile([], NOW).scaffold).toBe("worked_example_first");
  });
});

describe("inferProfile - metacognition", () => {
  it("calls high confidence with low accuracy overconfident", () => {
    const rs = Array.from({ length: 4 }, (_, i) =>
      res("procedural", { itemId: `q${i}`, correct: false, confidence: 4 as Confidence }),
    );
    expect(inferProfile(rs, NOW).metacognition).toBe("overconfident");
  });

  it("calls low confidence with high accuracy underconfident", () => {
    const rs = Array.from({ length: 4 }, (_, i) =>
      res("procedural", { itemId: `q${i}`, correct: true, confidence: 1 as Confidence }),
    );
    expect(inferProfile(rs, NOW).metacognition).toBe("underconfident");
  });

  it("stays calibrated without enough answers to judge", () => {
    // Two answers is not evidence of a self-assessment habit.
    const rs = [res("procedural", { correct: false, confidence: 4 as Confidence })];
    expect(inferProfile(rs, NOW).metacognition).toBe("calibrated");
  });
});

describe("inferProfile - lean", () => {
  it("names the side that landed when only one did", () => {
    expect(
      inferProfile(
        [res("procedural", { correct: true }), res("conceptual", { correct: false })],
        NOW,
      ).lean,
    ).toBe("procedural");
    expect(
      inferProfile(
        [res("procedural", { correct: false }), res("conceptual", { correct: true })],
        NOW,
      ).lean,
    ).toBe("conceptual");
  });

  it("is balanced when both or neither landed", () => {
    expect(
      inferProfile(
        [res("procedural", { correct: true }), res("conceptual", { correct: true })],
        NOW,
      ).lean,
    ).toBe("balanced");
  });
});

describe("rendering a profile", () => {
  it("describes every profile in full sentences", () => {
    const p = inferProfile([res("procedural"), res("conceptual")], NOW);
    const lines = describeProfile(p);
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      expect(l.label.length).toBeGreaterThan(0);
      expect(l.value.length).toBeGreaterThan(0);
    }
  });

  it("renders a Luna block that mentions the inferred traits", () => {
    const p = inferProfile([res("struggle", { action: "skipped", correct: false })], NOW);
    const block = profileToLunaBlock(p);
    expect(block.length).toBeGreaterThan(0);
    expect(block).toContain(p.pace);
  });
});
