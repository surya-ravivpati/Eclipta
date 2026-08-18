/**
 * Where a sign-in may send someone afterwards.
 *
 * The auth gate records the page a visitor was trying to reach
 * (`_authenticated.tsx` puts it in `?redirect=`), which means a URL a stranger
 * controls decides where the browser goes once a session exists. Handing that
 * to `navigate()` unchecked is an open redirect: a link to
 * `/login?redirect=https://not-eclipta.example/login` sends a freshly
 * authenticated user to someone else's login form, wearing our brand.
 *
 * So only a same-origin path is ever accepted, and everything else falls back
 * to a destination this app chose. The check is a whitelist of shape rather
 * than a blacklist of tricks - blacklists here have a long history of being
 * one encoding away from wrong.
 */

/** Where to send someone when there is no valid destination to return to. */
export const DEFAULT_POST_AUTH_PATH = "/";

/**
 * A path this app is willing to navigate to after authentication, or the
 * default when the candidate is missing, malformed, or points off-site.
 *
 * Accepted: a single leading slash followed by anything that is not another
 * slash or a backslash - `/battles`, `/u/ada`, `/courses?tab=mine`.
 *
 * Rejected, and each of these is a real attack or a real bug:
 *   - `https://evil.example`  - absolute URL, straightforwardly off-site
 *   - `//evil.example`        - protocol-relative; browsers treat it as absolute
 *   - `/\evil.example`        - backslash variant some parsers normalise to `//`
 *   - `javascript:alert(1)`   - scheme with no slash at all
 *   - `battles`               - no leading slash, resolves relative to the
 *                               current page, so the destination depends on
 *                               where the link was clicked
 */
export function safeRedirect(candidate: unknown, fallback = DEFAULT_POST_AUTH_PATH): string {
  if (typeof candidate !== "string") return fallback;

  const path = candidate.trim();
  if (path.length === 0) return fallback;

  // Control characters can split a header or smuggle a newline into a parser
  // that later re-reads this value; nothing legitimate contains one. Written as
  // escapes rather than literals so the file stays ASCII.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(path)) return fallback;

  if (!path.startsWith("/")) return fallback;
  if (path.startsWith("//") || path.startsWith("/\\")) return fallback;

  // Sending someone back to the page that sent them here is a loop, not a
  // return - and it is what `?redirect=/login` produces.
  if (path === "/login" || path.startsWith("/login?")) return fallback;
  if (path === "/signup" || path.startsWith("/signup?")) return fallback;

  return path;
}

/**
 * Where the intended destination waits out an OAuth round-trip.
 *
 * The provider hop leaves this app entirely and returns to a fixed callback
 * URL, so a query parameter cannot survive it. Session storage can, and is
 * scoped to the one tab that started the sign-in.
 */
const OAUTH_RETURN_KEY = "eclipta:post-auth-redirect";

export function stashPostAuthRedirect(path: string): void {
  if (typeof window === "undefined") return;
  const safe = safeRedirect(path, "");
  if (!safe) return;
  try {
    window.sessionStorage.setItem(OAUTH_RETURN_KEY, safe);
  } catch {
    // Private browsing modes can refuse session storage. Losing the return
    // destination is a worse landing page, not a failure worth surfacing.
  }
}

/** Reads and clears the stashed destination. Re-validated on the way out. */
export function takePostAuthRedirect(fallback = DEFAULT_POST_AUTH_PATH): string {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.sessionStorage.getItem(OAUTH_RETURN_KEY);
    window.sessionStorage.removeItem(OAUTH_RETURN_KEY);
    return safeRedirect(stored, fallback);
  } catch {
    return fallback;
  }
}
