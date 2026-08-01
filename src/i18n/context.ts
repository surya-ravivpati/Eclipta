import { createContext } from "react";
import type { TFunction } from "./core";

/**
 * The i18n context object and its value type.
 *
 * Kept apart from the provider so that file exports a component and nothing
 * else — React Fast Refresh cannot preserve state across edits in a module
 * that mixes component and non-component exports.
 */
export interface I18nValue {
  locale: string;
  dir: "ltr" | "rtl";
  /** Translate a key, with optional interpolation and pluralisation. */
  t: TFunction;
  setLocale: (code: string) => void;
  /** True until the active locale's messages have loaded. */
  loading: boolean;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatDate: (value: Date | number | string, options?: Intl.DateTimeFormatOptions) => string;
  /** "3 days ago" / "hace 3 días", for achievement and post timestamps. */
  formatRelative: (value: Date | number | string) => string;
}

export const I18nContext = createContext<I18nValue | null>(null);
