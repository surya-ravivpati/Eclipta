/**
 * What a username is allowed to look like.
 *
 * The same shape was spelled out in seven places, each one a chance to drift
 * from `user_profiles_username_format` - the Postgres CHECK constraint that
 * actually decides. That constraint is the authority; this is the copy the
 * browser uses so a user learns their username is invalid while typing it
 * rather than after pressing save.
 *
 * If the constraint ever changes, `USERNAME_BODY` is the one string to change,
 * and the migration that changes it is the reason to.
 */

/** The character class and length, unanchored, so a mention scanner can reuse it. */
export const USERNAME_BODY = "[a-zA-Z0-9_]{3,20}";

/** Anchored: the whole string has to be a username. */
export const USERNAME_PATTERN = new RegExp(`^${USERNAME_BODY}$`);

/**
 * Whether a string is a well-formed username.
 *
 * Shape only. Whether the name is taken, or whether it reads as profanity, are
 * separate questions with separate answers - the profile form asks all three.
 */
export function isUsername(value: string): boolean {
  return USERNAME_PATTERN.test(value);
}

/**
 * Finds `@name` mentions in free text.
 *
 * Built fresh on each call because a global regex carries `lastIndex` between
 * uses, and a shared one silently skips matches on every second call.
 */
export function mentionPattern(): RegExp {
  // A non-word character (or the start) has to come first, or an email address
  // turns its domain into a mention.
  return new RegExp(`(^|[^\\w@])@(${USERNAME_BODY})\\b`, "g");
}
