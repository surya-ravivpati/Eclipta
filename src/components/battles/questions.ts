import type { MathQuestion, Difficulty } from "./types";

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const TOPICS: Record<Difficulty, string[]> = {
  easy: ["Addition", "Subtraction", "Basic Arithmetic"],
  medium: ["Multiplication", "Division", "Fractions"],
  hard: ["Exponents", "Order of Operations", "Algebra"],
};

export function generateQuestion(difficulty: Difficulty): MathQuestion {
  let a: number, b: number, answer: number, q: string;
  let topic: string;

  if (difficulty === "easy") {
    const op = Math.random() > 0.5;
    a = rand(2, 30); b = rand(2, 30);
    if (op) {
      answer = a + b; q = `${a} + ${b}`; topic = "Addition";
    } else {
      if (a < b) [a, b] = [b, a];
      answer = a - b; q = `${a} − ${b}`; topic = "Subtraction";
    }
  } else if (difficulty === "medium") {
    const type = rand(0, 1);
    if (type === 0) {
      a = rand(3, 15); b = rand(3, 12);
      answer = a * b; q = `${a} × ${b}`; topic = "Multiplication";
    } else {
      b = rand(2, 12); answer = rand(2, 15); a = answer * b;
      q = `${a} ÷ ${b}`; topic = "Division";
    }
  } else {
    const type = rand(0, 2);
    if (type === 0) {
      a = rand(2, 15); answer = a * a; q = `${a}²`; topic = "Exponents";
    } else if (type === 1) {
      a = rand(5, 20); b = rand(2, 12); const c = rand(2, 8);
      answer = a + b * c; q = `${a} + ${b} × ${c}`; topic = "Order of Operations";
    } else {
      // Solve for x: x + b = a  →  x = a - b
      const x = rand(2, 20);
      b = rand(2, 15);
      a = x + b;
      answer = x;
      q = `x + ${b} = ${a}, x = ?`;
      topic = "Algebra";
    }
  }

  const options = new Set<number>([answer]);
  while (options.size < 4) {
    const offset = rand(1, Math.max(5, Math.abs(answer) || 5)) * (Math.random() > 0.5 ? 1 : -1);
    options.add(answer + offset);
  }

  return { q, answer, options: shuffle([...options]), difficulty, topic };
}

export const TIMER_DURATIONS: Record<Difficulty, number> = { easy: 10, medium: 12, hard: 15 };
