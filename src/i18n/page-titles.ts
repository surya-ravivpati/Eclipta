import type { TFunction } from "./core";

/**
 * Route path → translated page name, used for the SPA route-change
 * announcement. A screen reader gets no signal from a client-side navigation
 * (nothing reloads), so without this the user is silently moved to a new page.
 *
 * Longest prefix wins, so `/certified/x/learn` beats `/certified`.
 */
const ROUTE_KEYS: [prefix: string, key: string][] = [
  ["/battles", "pages.battles"],
  ["/certified", "pages.certified"],
  ["/courses", "pages.courses"],
  ["/build-course", "pages.courses"],
  ["/forum", "pages.forum"],
  ["/groups", "pages.groups"],
  ["/progress", "pages.progress"],
  ["/collection", "pages.collection"],
  ["/profile", "pages.profile"],
  ["/notifications", "pages.notifications"],
  ["/streak", "pages.streak"],
  ["/luna", "pages.luna"],
  ["/onboarding", "pages.onboarding"],
  ["/", "pages.home"],
];

export function pageTitleFor(pathname: string, t: TFunction): string {
  const match = ROUTE_KEYS.filter(([prefix]) => pathname.startsWith(prefix)).sort(
    (a, b) => b[0].length - a[0].length,
  )[0];
  return t(match ? match[1] : "pages.unknown");
}
