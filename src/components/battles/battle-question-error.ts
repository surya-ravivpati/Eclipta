/**
 * What to tell the player when the server declines to issue a battle question.
 *
 * `issue_battle_question` refuses for a few reasons, but only one is something
 * a normal player can hit and act on: the per-hour cap on practice questions
 * (`Battle question limit reached; try again later`). That one gets a message
 * that says what happened and what to do. Every other refusal - an expired
 * session that survived the refresh retry, a closed live battle, a transport
 * error - is not actionable by the player, so it stays a single generic line;
 * the raw error is logged at the call site for diagnosis.
 */
export function battleQuestionUnavailableMessage(
  error: { message?: string | null } | null,
): string {
  if (error?.message?.includes("limit reached")) {
    return "You've hit the hourly practice-question limit. Take a short break and try again.";
  }
  return "Couldn't prepare a secure battle question. Please try again.";
}
