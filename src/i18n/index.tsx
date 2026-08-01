import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_LOCALE, getLocale, isSupportedLocale } from "./locales";
import { I18nContext, type I18nValue } from "./context";
import {
  fallbackTree,
  interpolate,
  loadMessages,
  lookup,
  readStoredLocale,
  resolveInitialLocale,
  storeLocale,
  type MessageTree,
  type TFunction,
} from "./core";

/**
 * i18n provider.
 *
 * Deliberately dependency-free rather than i18next, because the hard parts are
 * already in the platform. `Intl.PluralRules` knows the plural categories for
 * every language we ship — including the ones a naive `n === 1` check gets
 * wrong (Japanese, Korean and Chinese have a single form; Hindi and French
 * treat 0 as singular; Russian, if added later, needs four). `DateTimeFormat`,
 * `NumberFormat` and `RelativeTimeFormat` cover the rest. A library would
 * mostly be re-exporting these.
 *
 * Message files are discovered with `import.meta.glob` (see core.ts), so
 * **adding a locale is a file drop plus one registry entry — no code changes.**
 *
 * This file exports only the provider; the hook lives in `use-translation.ts`
 * and the plumbing in `core.ts`, so Fast Refresh stays intact.
 */

export function I18nProvider({
  children,
  userPreference,
}: {
  children: ReactNode;
  /** The signed-in user's saved language, when known. */
  userPreference?: string | null;
}) {
  const [locale, setLocaleState] = useState(() => resolveInitialLocale(userPreference));
  const [messages, setMessages] = useState<MessageTree>({});
  const [fallback, setFallback] = useState<MessageTree>(fallbackTree);
  const [loading, setLoading] = useState(true);

  // English is always loaded as the fallback tree, so a partly-translated
  // locale shows English for the gaps instead of raw key paths.
  useEffect(() => {
    let alive = true;
    void loadMessages(DEFAULT_LOCALE).then((m) => {
      if (alive) setFallback(m);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void loadMessages(locale).then((m) => {
      if (!alive) return;
      setMessages(m);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [locale]);

  const def = getLocale(locale);

  // `lang` drives screen-reader pronunciation and hyphenation; `dir` flips the
  // layout wholesale. Set here rather than in the shell so switching language
  // takes effect without a reload — and so an RTL locale needs no code change.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = def.code;
    document.documentElement.dir = def.dir;
  }, [def.code, def.dir]);

  // A signed-in user's saved language wins once it arrives, unless they have
  // already overridden it locally.
  useEffect(() => {
    if (isSupportedLocale(userPreference) && userPreference && !readStoredLocale()) {
      setLocaleState(userPreference);
    }
  }, [userPreference]);

  const setLocale = useCallback((code: string) => {
    if (!isSupportedLocale(code)) return;
    storeLocale(code);
    setLocaleState(code);
  }, []);

  const plural = useMemo(() => new Intl.PluralRules(def.intlLocale), [def.intlLocale]);

  const t = useCallback<TFunction>(
    (key, vars) => {
      // Pluralised keys are stored as `key_one` / `key_other` (plus `_zero`,
      // `_two`, `_few`, `_many` where a language needs them). Intl picks the
      // category, so a message file only has to supply the forms that exist.
      let resolved: string | undefined;
      // Bracket access: `vars` is an index signature, so a dotted read is
      // ambiguous under noPropertyAccessFromIndexSignature.
      const count = vars?.["count"];
      if (typeof count === "number") {
        const category = plural.select(count);
        resolved =
          lookup(messages, `${key}_${category}`) ??
          lookup(messages, `${key}_other`) ??
          lookup(fallback, `${key}_${category}`) ??
          lookup(fallback, `${key}_other`);
      }
      resolved ??= lookup(messages, key) ?? lookup(fallback, key);
      // Surfacing the key beats rendering an empty string: it is obvious in
      // review and searchable in a bug report.
      return interpolate(resolved ?? key, vars);
    },
    [messages, fallback, plural],
  );

  const formatNumber = useCallback(
    (value: number, options?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(def.intlLocale, options).format(value),
    [def.intlLocale],
  );

  const formatDate = useCallback(
    (value: Date | number | string, options?: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(def.intlLocale, options ?? { dateStyle: "medium" }).format(
        new Date(value),
      ),
    [def.intlLocale],
  );

  const formatRelative = useCallback(
    (value: Date | number | string) => {
      const rtf = new Intl.RelativeTimeFormat(def.intlLocale, { numeric: "auto" });
      const diffMs = new Date(value).getTime() - Date.now();
      const units: [Intl.RelativeTimeFormatUnit, number][] = [
        ["year", 31_536_000_000],
        ["month", 2_592_000_000],
        ["week", 604_800_000],
        ["day", 86_400_000],
        ["hour", 3_600_000],
        ["minute", 60_000],
      ];
      for (const [unit, ms] of units) {
        if (Math.abs(diffMs) >= ms) return rtf.format(Math.round(diffMs / ms), unit);
      }
      return rtf.format(Math.round(diffMs / 1000), "second");
    },
    [def.intlLocale],
  );

  const value = useMemo<I18nValue>(
    () => ({
      locale: def.code,
      dir: def.dir,
      t,
      setLocale,
      loading,
      formatNumber,
      formatDate,
      formatRelative,
    }),
    [def.code, def.dir, t, setLocale, loading, formatNumber, formatDate, formatRelative],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
