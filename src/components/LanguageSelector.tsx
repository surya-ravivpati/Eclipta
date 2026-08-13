import { useEffect, useState } from "react";
import { Check, Globe } from "lucide-react";
import { LOCALES, getLocale } from "@/i18n/locales";
import { useTranslation } from "@/i18n/use-translation";
import { announce } from "@/lib/a11y";
import { setPreferredLanguage } from "@/repositories/profile";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

/**
 * Language picker.
 *
 * Renders straight from the LOCALES registry, so a new language appears here
 * the moment it is registered - no change to this file.
 *
 * Built as a native `<select>` rather than a custom listbox on purpose: it
 * arrives with keyboard support, type-ahead, screen-reader semantics and the
 * platform's own touch picker already correct. A bespoke dropdown would need
 * all of that rebuilt and would almost certainly be worse.
 */
export function LanguageSelector({ className }: { className?: string }) {
  const { locale, setLocale, t } = useTranslation();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);

  async function choose(code: string) {
    setLocale(code);
    const name = getLocale(code).endonym;
    // Announce in the *new* language, after the messages have had a tick to
    // swap in, so the confirmation itself is localised.
    setTimeout(() => announce(t("language.changed", { name })), 80);

    // Persist to the profile so the choice follows the user across devices.
    // Signed-out users still get the localStorage copy from setLocale.
    if (!user) return;
    setSaving(true);
    try {
      await setPreferredLanguage(user.id, code);
    } catch {
      // A failed save is not worth interrupting the user: the language has
      // already changed locally and will re-sync on the next successful write.
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Globe className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <label htmlFor="language-selector" className="sr-only">
        {t("language.select")}
      </label>
      <select
        id="language-selector"
        value={locale}
        disabled={saving}
        onChange={(e) => void choose(e.target.value)}
        className="bg-background border border-border rounded px-2 py-1.5 text-sm text-foreground disabled:opacity-60"
      >
        {LOCALES.map((l) => (
          // `lang` on each option so a screen reader pronounces each language
          // name in that language rather than mangling it in the current one.
          <option key={l.code} value={l.code} lang={l.code}>
            {l.endonym}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Compact list variant for settings pages, where the current choice should be
 * visible at a glance rather than hidden behind a collapsed control.
 */
export function LanguageList({ className }: { className?: string }) {
  const { locale, setLocale, t } = useTranslation();
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (pending && pending === locale) setPending(null);
  }, [pending, locale]);

  return (
    <div className={className}>
      <h3 className="text-sm font-bold mb-2">{t("language.select")}</h3>
      <ul className="grid grid-cols-2 gap-2" role="list">
        {LOCALES.map((l) => {
          const active = l.code === locale;
          return (
            <li key={l.code}>
              <button
                type="button"
                lang={l.code}
                aria-current={active ? "true" : undefined}
                onClick={() => {
                  setPending(l.code);
                  setLocale(l.code);
                }}
                className={cn(
                  "w-full flex items-center justify-between gap-2 px-3 py-2 rounded border text-sm transition-colors",
                  active
                    ? "border-primary/60 bg-primary/10 text-foreground"
                    : "border-border hover:bg-secondary/40",
                )}
              >
                <span>{l.endonym}</span>
                {/* Never signal the active language by colour alone. */}
                {active && <Check className="w-4 h-4 shrink-0" aria-hidden="true" />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
