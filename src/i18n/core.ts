import { DEFAULT_LOCALE, isSupportedLocale, resolveBrowserLocale } from "./locales";

/**
 * i18n internals: message loading, key lookup and interpolation.
 *
 * Split out from the provider so that file exports a component and nothing
 * else, which keeps React Fast Refresh working on it. Nothing here touches
 * React.
 */

export type MessageTree = { [key: string]: string | MessageTree };
export type Vars = Record<string, string | number>;
export type TFunction = (key: string, vars?: Vars) => string;

/** Message bundles, discovered at build time. Adding `xx.json` is enough. */
const MESSAGE_LOADERS = import.meta.glob<{ default: MessageTree }>("./messages/*.json");

const cache = new Map<string, MessageTree>();

export async function loadMessages(code: string): Promise<MessageTree> {
  const cached = cache.get(code);
  if (cached) return cached;
  const loader = MESSAGE_LOADERS[`./messages/${code}.json`];
  if (!loader) return {};
  const mod = await loader();
  cache.set(code, mod.default);
  return mod.default;
}

/** Walk a dotted key path. Returns undefined rather than throwing on a miss. */
export function lookup(tree: MessageTree, path: string): string | undefined {
  let node: string | MessageTree | undefined = tree;
  for (const part of path.split(".")) {
    if (typeof node !== "object") return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

/**
 * `{{name}}` substitution. Unknown placeholders are left visible on purpose —
 * a stray `{{count}}` in the UI is a bug report; a silent blank is not.
 */
export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => {
    const value = vars[key];
    return value === undefined ? whole : String(value);
  });
}

const LOCALE_KEY = "eclipta:locale";

export function readStoredLocale(): string | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(LOCALE_KEY);
  return isSupportedLocale(stored) ? stored : null;
}

export function storeLocale(code: string): void {
  if (typeof window !== "undefined") window.localStorage.setItem(LOCALE_KEY, code);
}

/**
 * Resolution order: an explicit per-user choice beats everything, then a
 * locally stored choice, then the browser's ranked preferences, then English.
 */
export function resolveInitialLocale(userPreference?: string | null): string {
  if (isSupportedLocale(userPreference) && userPreference) return userPreference;
  return readStoredLocale() ?? resolveBrowserLocale();
}

/** English text for the un-provided fallback path, primed at startup. */
let FALLBACK_SYNC: MessageTree = {};

export async function primeFallback(): Promise<void> {
  FALLBACK_SYNC = await loadMessages(DEFAULT_LOCALE);
}

export function fallbackTree(): MessageTree {
  return FALLBACK_SYNC;
}
