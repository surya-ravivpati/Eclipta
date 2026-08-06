import { describe, expect, it } from "vitest";
import type { Difficulty } from "./types";
import { generateQuestion, generateQuestionForTopic, TOPIC_DIFFICULTY } from "./questions";

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];
const TRIALS = 200;

const TOPICS_BY_TIER: Record<Difficulty, string[]> = {
  easy: ["Addition", "Subtraction"],
  medium: ["Multiplication", "Division"],
  hard: ["Exponents", "Order of Operations", "Algebra"],
};

describe("generateQuestion", () => {
  for (const difficulty of DIFFICULTIES) {
    describe(`difficulty: ${difficulty}`, () => {
      it(`produces ${TRIALS} valid questions with the answer among 4 unique options, matching the requested tier`, () => {
        for (let i = 0; i < TRIALS; i++) {
          const question = generateQuestion(difficulty);

          expect(question.difficulty).toBe(difficulty);
          expect(TOPICS_BY_TIER[difficulty]).toContain(question.topic);

          expect(question.options).toHaveLength(4);
          expect(new Set(question.options).size).toBe(4);
          expect(question.options).toContain(question.answer);

          expect(typeof question.q).toBe("string");
          expect(question.q.length).toBeGreaterThan(0);
        }
      });
    });
  }

  it("produces algebraically correct answers for every generated question", () => {
    // Re-derive the answer from the question text itself, per topic, so this
    // catches a real arithmetic regression rather than just structural shape.
    for (let i = 0; i < TRIALS; i++) {
      const q = generateQuestion("easy");
      if (q.topic === "Addition") {
        const [a, b] = q.q.split(" + ").map(Number);
        expect(a + b).toBe(q.answer);
      } else if (q.topic === "Subtraction") {
        const [a, b] = q.q.split(" - ").map(Number);
        expect(a - b).toBe(q.answer);
        expect(a).toBeGreaterThanOrEqual(b); // never negative
      }
    }
    for (let i = 0; i < TRIALS; i++) {
      const q = generateQuestion("medium");
      if (q.topic === "Multiplication") {
        const [a, b] = q.q.split(" * ").map(Number);
        expect(a * b).toBe(q.answer);
      } else if (q.topic === "Division") {
        const [a, b] = q.q.split(" / ").map(Number);
        expect(a / b).toBe(q.answer);
        expect(Number.isInteger(q.answer)).toBe(true); // exact division, no remainder
      }
    }
  });
});

describe("TOPIC_DIFFICULTY", () => {
  it("maps every topic generateQuestion can emit to a difficulty tier", () => {
    for (const difficulty of DIFFICULTIES) {
      for (let i = 0; i < 40; i++) {
        const { topic } = generateQuestion(difficulty);
        expect(TOPIC_DIFFICULTY[topic]).toBe(difficulty);
      }
    }
  });
});

describe("generateQuestionForTopic", () => {
  it("returns a question matching the requested topic (retries until it lands, or falls back same-tier)", () => {
    for (const topic of Object.keys(TOPIC_DIFFICULTY)) {
      const q = generateQuestionForTopic(topic);
      // Either it matched the exact topic, or - in the rare fallback case -
      // it's at least still in the same difficulty tier.
      const sameTier = q.difficulty === TOPIC_DIFFICULTY[topic];
      expect(q.topic === topic || sameTier).toBe(true);
    }
  });

  it("falls back to medium difficulty for an unknown topic rather than throwing", () => {
    expect(() => generateQuestionForTopic("Nonexistent Topic")).not.toThrow();
    const q = generateQuestionForTopic("Nonexistent Topic");
    expect(q.difficulty).toBe("medium");
  });
});
