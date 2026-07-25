-- Give every account a playable start.
--
-- Problem: a fresh account had 200 XP (below the 400 needed to unlock the
-- Speedster archetype) and owned zero Ecliptars, so it could never enter a
-- battle — the class-select screen showed "No Ecliptars unlocked" with no way
-- forward except grinding a Trophy Road that also requires battling.
--
-- Fix: every account (new and existing) starts with enough XP to unlock the
-- Speedster archetype AND owns its two starter Ecliptars (speedster-a /
-- speedster-b, the same pair the Speedster monster node grants). Fully
-- idempotent — safe to re-run.

-- 1. New-account trigger: 500 XP (unlocks Speedster, which needs 400) plus the
--    two starter Speedster Ecliptars. The Ecliptar grant is wrapped so that a
--    failure here can never abort account creation.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.user_profiles (user_id, xp)
  VALUES (NEW.id, 500);

  BEGIN
    INSERT INTO public.user_ecliptars (user_id, archetype, ecliptar_slug, ecliptar_name, node_id)
    VALUES
      (NEW.id, 'speedster', 'speedster-a', 'Griffinink', 2),
      (NEW.id, 'speedster', 'speedster-b', 'Spark',      2)
    ON CONFLICT (user_id, ecliptar_slug) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    NULL;  -- never let a starter-grant error block signup
  END;

  RETURN NEW;
END;
$function$;

-- 2. Backfill XP: lift every existing account to at least 500 so the Speedster
--    archetype is unlocked. Never lowers anyone.
UPDATE public.user_profiles SET xp = 500 WHERE xp < 500;

-- 3. Backfill Ecliptars: grant the two starter Speedster Ecliptars to every
--    existing account that doesn't already own them.
INSERT INTO public.user_ecliptars (user_id, archetype, ecliptar_slug, ecliptar_name, node_id)
SELECT p.user_id, 'speedster', v.slug, v.name, 2
FROM public.user_profiles p
CROSS JOIN (VALUES
  ('speedster-a', 'Griffinink'),
  ('speedster-b', 'Spark')
) AS v(slug, name)
ON CONFLICT (user_id, ecliptar_slug) DO NOTHING;
