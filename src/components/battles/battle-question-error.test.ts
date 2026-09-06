import { describe, expect, it } from "vitest";
import { battleQuestionUnavailableMessage } from "./battle-question-error";

describe("battleQuestionUnavailableMessage", () => {
  it("names the hourly cap when the server reports the limit", () => {
    const message = battleQuestionUnavailableMessage({
      message: "Battle question limit reached; try again later",
    });
    expect(message).toContain("hourly practice-question limit");
  });

  it("stays generic for any other error", () => {
    expect(battleQuestionUnavailableMessage({ message: "Not authenticated" })).toBe(
      "Couldn't prepare a secure battle question. Please try again.",
    );
    expect(battleQuestionUnavailableMessage({ message: "Battle not found" })).toBe(
      "Couldn't prepare a secure battle question. Please try again.",
    );
  });

  it("stays generic when there is no error object or message", () => {
    const generic = "Couldn't prepare a secure battle question. Please try again.";
    expect(battleQuestionUnavailableMessage(null)).toBe(generic);
    expect(battleQuestionUnavailableMessage({})).toBe(generic);
    expect(battleQuestionUnavailableMessage({ message: null })).toBe(generic);
  });
});
