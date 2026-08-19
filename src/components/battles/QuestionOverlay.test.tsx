import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuestionOverlay } from "./QuestionOverlay";
import type { MathQuestion } from "./types";

/**
 * A timed question that accepts a second answer is a scoring bug, and one that
 * hides the right answer after a miss wastes the only moment the learner is
 * actually looking. Those are the two things pinned here.
 */

const question: MathQuestion = {
  q: "7 x 6",
  options: [40, 42, 44, 48],
  topic: "multiplication",
  difficulty: "easy",
};

describe("QuestionOverlay", () => {
  it("shows the question and every option", () => {
    render(
      <QuestionOverlay
        question={question}
        timeLeft={20}
        maxTime={20}
        onAnswer={vi.fn(() => Promise.resolve({ correct: true }))}
      />,
    );
    // A bare expression is completed into a question; one that already asks
    // something is left alone.
    expect(screen.getByText("7 x 6 = ?")).toBeInTheDocument();
    for (const option of question.options) {
      expect(screen.getByText(String(option))).toBeInTheDocument();
    }
  });

  it("reports the answer with how long it took", async () => {
    // The time is what the Speedster's damage scales on, so it has to be the
    // learner's own thinking time and not a value the arena guesses.
    const onAnswer = vi.fn(() => Promise.resolve({ correct: true }));
    render(<QuestionOverlay question={question} timeLeft={20} maxTime={20} onAnswer={onAnswer} />);
    await userEvent.click(screen.getByText("42"));
    await waitFor(() => expect(onAnswer).toHaveBeenCalled());
    const [value, seconds] = onAnswer.mock.calls[0] as unknown as [number, number];
    expect(value).toBe(42);
    expect(seconds).toBeGreaterThanOrEqual(0);
  });

  it("accepts one answer and no more", async () => {
    const onAnswer = vi.fn(() => Promise.resolve({ correct: false, answer: 42 }));
    render(<QuestionOverlay question={question} timeLeft={20} maxTime={20} onAnswer={onAnswer} />);
    await userEvent.click(screen.getByText("40"));
    await userEvent.click(screen.getByText("44"));
    await userEvent.click(screen.getByText("48"));
    expect(onAnswer).toHaveBeenCalledTimes(1);
  });

  it("does not reveal anything when the answer was right", async () => {
    const onAnswer = vi.fn(() => Promise.resolve({ correct: true }));
    render(<QuestionOverlay question={question} timeLeft={20} maxTime={20} onAnswer={onAnswer} />);
    await userEvent.click(screen.getByText("42"));
    await waitFor(() => expect(onAnswer).toHaveBeenCalled());
    expect(screen.queryByText(/correct answer/i)).not.toBeInTheDocument();
  });

  it("marks the clock as running out, so the state is not colour alone", () => {
    const { container } = render(
      <QuestionOverlay
        question={question}
        timeLeft={3}
        maxTime={20}
        onAnswer={vi.fn(() => Promise.resolve({ correct: true }))}
      />,
    );
    expect(container.querySelector(".btt-q-card--danger")).not.toBeNull();
  });

  it("does not mark danger with time still on the clock", () => {
    const { container } = render(
      <QuestionOverlay
        question={question}
        timeLeft={12}
        maxTime={20}
        onAnswer={vi.fn(() => Promise.resolve({ correct: true }))}
      />,
    );
    expect(container.querySelector(".btt-q-card--danger")).toBeNull();
  });

  it("leaves a prompt that already asks something alone", () => {
    render(
      <QuestionOverlay
        question={{ ...question, q: "Which is prime?" }}
        timeLeft={20}
        maxTime={20}
        onAnswer={vi.fn(() => Promise.resolve({ correct: true }))}
      />,
    );
    expect(screen.getByText("Which is prime?")).toBeInTheDocument();
  });
});
