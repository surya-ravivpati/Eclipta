import { supabase } from "./client";

/**
 * Recovering an authenticated call from a stale access token.
 *
 * supabase-js attaches whatever access token it holds in memory to every
 * PostgREST/RPC request. When that token has expired - a tab left open past
 * the token's lifetime, a refresh timer throttled while backgrounded - the
 * request goes out with the dead token and PostgREST rejects it *before* the
 * SQL runs, with `PGRST301` ("JWT expired"). The client repairs itself on the
 * next refresh, so a full page reload always fixes it; but any request that
 * fired in the meantime has already failed, and the caller sees a hard error
 * with no hint that a retry would have worked.
 *
 * `withFreshSession` closes that window for a single call: it runs the call,
 * and only if the failure is that expired-token rejection does it force a
 * synchronous refresh and run the call exactly once more. Every other error -
 * a real authorization failure, a rate limit, a constraint violation - is
 * returned untouched on the first attempt, so this never masks a genuine
 * problem or turns one failed write into two.
 */

/** The `{ error }` half of a supabase-js result. `data` is left to the caller. */
interface Outcome {
  error: { code?: string | null; message?: string | null } | null;
}

/**
 * True when the token, not the request, was rejected: PostgREST answers an
 * expired or not-yet-valid JWT with `PGRST301`/`PGRST303` and a message that
 * names the JWT. Matching the code is enough; the message check is a fallback
 * for older gateways that set only the latter.
 */
function isExpiredTokenError(error: Outcome["error"]): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  if (code === "PGRST301" || code === "PGRST303") return true;
  const message = (error.message ?? "").toLowerCase();
  return message.includes("jwt") && (message.includes("expired") || message.includes("invalid"));
}

/**
 * Run `call`, and if it fails only because the access token had expired,
 * refresh the session and run it once more. The result of the retry (or of
 * the first attempt, when no retry was warranted or the refresh itself failed)
 * is returned as-is.
 */
export async function withFreshSession<T extends Outcome>(call: () => PromiseLike<T>): Promise<T> {
  const first = await call();
  if (!isExpiredTokenError(first.error)) return first;

  const { error: refreshError } = await supabase.auth.refreshSession();
  // No usable session to refresh into (signed out, refresh token revoked):
  // the original error is the honest thing to report.
  if (refreshError) return first;

  return call();
}

export { isExpiredTokenError };
