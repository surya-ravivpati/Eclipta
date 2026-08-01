/**
 * The locale registry — the single place a language is declared.
 *
 * Adding a language means adding one entry here and one `<code>.json` message
 * file. Nothing else in the app enumerates languages: the selector, the browser
 * detector, the direction handling and the formatters all read this table. That
 * is what "future translations require zero code changes" means in practice.
 */

export interface LocaleDefinition {
  /** BCP 47 tag. Also the message filename and the value stored per user. */
  code: string;
  /** Name in the language itself — never translated, so speakers can find it. */
  endonym: string;
  /** English name, for admin surfaces and debugging. */
  englishName: string;
  /** Writing direction. Present from day one so RTL is a data change, not a port. */
  dir: "ltr" | "rtl";
  /**
   * Locale used for Intl formatting. Usually identical to `code`; split out
   * because some UI languages format numbers/dates under a different locale
   * (e.g. a regional variant) and we want that to be declarative.
   */
  intlLocale: string;
}

export const LOCALES: LocaleDefinition[] = [
  { code: "en", endonym: "English", englishName: "English", dir: "ltr", intlLocale: "en" },
  { code: "es", endonym: "Español", englishName: "Spanish", dir: "ltr", intlLocale: "es" },
  { code: "fr", endonym: "Français", englishName: "French", dir: "ltr", intlLocale: "fr" },
  { code: "de", endonym: "Deutsch", englishName: "German", dir: "ltr", intlLocale: "de" },
  { code: "ja", endonym: "日本語", englishName: "Japanese", dir: "ltr", intlLocale: "ja" },
  { code: "ko", endonym: "한국어", englishName: "Korean", dir: "ltr", intlLocale: "ko" },
  {
    code: "zh-Hans",
    endonym: "简体中文",
    englishName: "Chinese (Simplified)",
    dir: "ltr",
    intlLocale: "zh-Hans",
  },
  { code: "hi", endonym: "हिन्दी", englishName: "Hindi", dir: "ltr", intlLocale: "hi" },
];

export const DEFAULT_LOCALE = "en";

/** The English definition, used as the fallback everywhere a lookup can miss. */
const FALLBACK_LOCALE: LocaleDefinition = {
  code: "en",
  endonym: "English",
  englishName: "English",
  dir: "ltr",
  intlLocale: "en",
};

export type LocaleCode = string;

export function getLocale(code: string | null | undefined): LocaleDefinition {
  return LOCALES.find((l) => l.code === code) ?? FALLBACK_LOCALE;
}

export function isSupportedLocale(code: string | null | undefined): boolean {
  return LOCALES.some((l) => l.code === code);
}

/**
 * Pick the best supported locale for a set of browser preferences.
 *
 * Matching is progressive: an exact tag first (`zh-Hans`), then the base
 * language (`zh` → `zh-Hans`, `en-GB` → `en`), in the order the browser ranked
 * them. Falls back to English rather than guessing.
 */
export function resolveBrowserLocale(
  preferred: readonly string[] = typeof navigator === "undefined" ? [] : navigator.languages,
): string {
  for (const raw of preferred) {
    const tag = raw.trim();
    if (!tag) continue;
    const exact = LOCALES.find((l) => l.code.toLowerCase() === tag.toLowerCase());
    if (exact) return exact.code;
    const base = tag.split("-")[0]?.toLowerCase();
    if (!base) continue;
    const byBase = LOCALES.find((l) => l.code.split("-")[0]?.toLowerCase() === base);
    if (byBase) return byBase.code;
  }
  return DEFAULT_LOCALE;
}
