-- Per-user language preference.
--
-- The client resolves a language from three sources, in order: this column, the
-- browser's Accept-Language ranking, then English. Storing it server-side is
-- what makes the choice follow a user across devices — localStorage alone would
-- reset every time they sign in somewhere new.
--
-- Deliberately `text` and nullable rather than an enum:
--   - NULL means "no explicit choice", which is distinct from "chose English"
--     and lets browser detection keep working until the user actually picks.
--   - A Postgres enum would need a migration for every new language, which
--     defeats the goal that adding a locale is a file drop. The client
--     validates against its own locale registry and ignores anything unknown,
--     so an unrecognised value degrades to detection instead of breaking.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS preferred_language text;

COMMENT ON COLUMN public.user_profiles.preferred_language IS
  'BCP 47 tag chosen by the user (e.g. es, ja, zh-Hans). NULL = auto-detect from browser. Validated client-side against src/i18n/locales.ts.';
