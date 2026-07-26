-- Extend the by-email restore to cover owned Ecliptars and the old username.
--
-- old_ecliptars: one row per (email, ecliptar_slug) exported from the old
-- Lovable user_ecliptars table. handle_new_user grants these on signup and
-- restores the old username when it's valid + free, so returning users get
-- their collection and handle back automatically. Guarded so nothing here can
-- block account creation. Idempotent.

-- 1. Snapshot of old owned Ecliptars (populated from Lovable). RLS on, no policy.
CREATE TABLE IF NOT EXISTS public.old_ecliptars (
  email         text NOT NULL,
  archetype     text NOT NULL,
  ecliptar_slug text NOT NULL,
  ecliptar_name text NOT NULL,
  node_id       integer NOT NULL DEFAULT 0,
  PRIMARY KEY (email, ecliptar_slug)
);
ALTER TABLE public.old_ecliptars ENABLE ROW LEVEL SECURITY;

-- 2. Signup: profile (old values inserted directly), old username if free,
--    starter + old owned Ecliptars. Every restore step is individually guarded.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE d jsonb; v_uname text;
BEGIN
  SELECT data INTO d FROM public.old_profile_json WHERE email = lower(NEW.email);

  IF d IS NULL THEN
    INSERT INTO public.user_profiles (user_id, xp) VALUES (NEW.id, 500);
  ELSE
    INSERT INTO public.user_profiles (
      user_id, xp, current_streak, best_streak, daily_streak, longest_daily_streak,
      total_correct, total_questions, total_sessions, streak_freezes, equipped_ecliptar
    ) VALUES (
      NEW.id,
      coalesce((d->>'xp')::int, 500),
      coalesce((d->>'current_streak')::int, 0),
      coalesce((d->>'best_streak')::int, 0),
      coalesce((d->>'daily_streak')::int, 0),
      coalesce((d->>'longest_daily_streak')::int, 0),
      coalesce((d->>'total_correct')::int, 0),
      coalesce((d->>'total_questions')::int, 0),
      coalesce((d->>'total_sessions')::int, 0),
      coalesce((d->>'streak_freezes')::int, 0),
      nullif(d->>'equipped_ecliptar', '')
    );

    -- Old username, only if it's valid and not already taken by someone else.
    BEGIN
      v_uname := d->>'username';
      IF v_uname ~ '^[a-zA-Z0-9_]{3,20}$'
         AND NOT EXISTS (SELECT 1 FROM public.user_profiles x
                         WHERE x.username = v_uname AND x.user_id <> NEW.id) THEN
        UPDATE public.user_profiles SET username = v_uname WHERE user_id = NEW.id;
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  -- Starter Ecliptars (new users); no-op for anyone who already owns them.
  BEGIN
    INSERT INTO public.user_ecliptars (user_id, archetype, ecliptar_slug, ecliptar_name, node_id)
    VALUES
      (NEW.id, 'speedster', 'speedster-a', 'Griffinink', 2),
      (NEW.id, 'speedster', 'speedster-b', 'Spark',      2)
    ON CONFLICT (user_id, ecliptar_slug) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Old owned Ecliptars for this email, if we have a snapshot.
  BEGIN
    INSERT INTO public.user_ecliptars (user_id, archetype, ecliptar_slug, ecliptar_name, node_id)
    SELECT NEW.id, oe.archetype, oe.ecliptar_slug, oe.ecliptar_name, oe.node_id
    FROM public.old_ecliptars oe
    WHERE oe.email = lower(NEW.email)
    ON CONFLICT (user_id, ecliptar_slug) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';
