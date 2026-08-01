import { useContext } from "react";
import { I18nContext, type I18nValue } from "./context";
import { DEFAULT_LOCALE } from "./locales";
import { fallbackTree, interpolate, lookup, type TFunction } from "./core";

/**
 * Access translation and formatting.
 *
 * Falls back to an English-only implementation rather than throwing when used
 * outside the provider, so a component rendered by a test or by an error
 * boundary mounted above the provider still produces readable text instead of
 * crashing the page it is trying to rescue.
 */
export function useTranslation(): I18nValue {
  const ctx = useContext(I18nContext);
  if (ctx) return ctx;

  const t: TFunction = (key, vars) => interpolate(lookup(fallbackTree(), key) ?? key, vars);
  return {
    locale: DEFAULT_LOCALE,
    dir: "ltr",
    t,
    setLocale: () => undefined,
    loading: false,
    formatNumber: (v, o) => new Intl.NumberFormat(DEFAULT_LOCALE, o).format(v),
    formatDate: (v, o) =>
      new Intl.DateTimeFormat(DEFAULT_LOCALE, o ?? { dateStyle: "medium" }).format(new Date(v)),
    formatRelative: (v) =>
      new Intl.RelativeTimeFormat(DEFAULT_LOCALE, { numeric: "auto" }).format(
        Math.round((new Date(v).getTime() - Date.now()) / 86_400_000),
        "day",
      ),
  };
}
