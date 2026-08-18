import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { readStoredLocale } from "@/i18n/core";
import { isSupportedLocale } from "@/i18n/locales";
import { getPreferredLanguage, setPreferredLanguage } from "@/repositories/profile";

/**
 * The signed-in user's saved interface language.
 *
 * `user_profiles.preferred_language` has been written on every language change
 * since the picker shipped and read by nobody, so the choice never survived a
 * new device: `I18nProvider` accepts a `userPreference` and was mounted without
 * one. This is the missing half.
 *
 * Returns null while the fetch is in flight and for signed-out users, which is
 * the same thing the provider already treats as "no answer yet" - the locally
 * stored choice or browser detection carries the first paint either way.
 */
export function usePreferredLanguage(): string | null {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [preference, setPreference] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setPreference(null);
      return;
    }
    let alive = true;
    void (async () => {
      let saved: string | null = null;
      try {
        saved = await getPreferredLanguage(userId);
      } catch {
        // A language is not worth an error message. Falling back to the local
        // copy is what an offline user gets anyway.
        return;
      }
      if (!alive) return;

      if (isSupportedLocale(saved)) {
        setPreference(saved);
        return;
      }

      // Nothing saved, but this device holds a choice made before signing in
      // or before this code existed. Send it up so the next device inherits
      // it. Only an explicitly stored choice, never browser detection - that
      // would record a preference the user never expressed.
      const local = readStoredLocale();
      if (!local) return;
      setPreference(local);
      try {
        await setPreferredLanguage(userId, local);
      } catch {
        // Next language change writes it again.
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  return preference;
}
