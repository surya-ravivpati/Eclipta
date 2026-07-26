-- Carry progress from the old (Lovable) database into the new project, matched
-- by email — because the old rows were NOT physically imported (orphaned count
-- was 0), so the earlier "re-key orphaned rows" approach had nothing to act on.
--
-- Model: a snapshot table `old_profile_json` holds one row per old account
-- (email + the whole old user_profiles row as JSON, exported from Lovable).
-- apply_old_progress() writes the old (Lovable) fields onto a new login matched
-- by email — "old wins" — falling back to the current value only when the old
-- row lacks that field. This is deliberate: the new accounts had spurious high
-- XP, and the intent is to restore the real old progress. handle_new_user calls
-- it on signup so users who return LATER are restored automatically.
--
-- Reading fields out of JSON with (data->>'k') tolerates old/new schema drift:
-- a missing key is NULL -> coalesced to 0, so a column the old DB lacked simply
-- keeps the new value. Idempotent; safe to re-run.

-- 1. Snapshot table (populated from Lovable). RLS on, no policy => not readable
--    by app users (it holds emails + profile data); definer paths & service role
--    bypass RLS.
CREATE TABLE IF NOT EXISTS public.old_profile_json (
  email text PRIMARY KEY,
  data  jsonb NOT NULL
);
ALTER TABLE public.old_profile_json ENABLE ROW LEVEL SECURITY;

-- 2. Merge the old snapshot onto one new login (by email).
CREATE OR REPLACE FUNCTION public.apply_old_progress(p_new_uid uuid, p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE d jsonb;
BEGIN
  IF p_new_uid IS NULL OR p_email IS NULL THEN RETURN; END IF;

  SELECT data INTO d FROM public.old_profile_json WHERE email = lower(p_email);
  IF d IS NULL THEN RETURN; END IF;   -- no old account for this email

  UPDATE public.user_profiles np SET
    xp                   = coalesce((d->>'xp')::int,                   np.xp),
    current_streak       = coalesce((d->>'current_streak')::int,       np.current_streak),
    best_streak          = coalesce((d->>'best_streak')::int,          np.best_streak),
    daily_streak         = coalesce((d->>'daily_streak')::int,         np.daily_streak),
    longest_daily_streak = coalesce((d->>'longest_daily_streak')::int, np.longest_daily_streak),
    total_correct        = coalesce((d->>'total_correct')::int,        np.total_correct),
    total_questions      = coalesce((d->>'total_questions')::int,      np.total_questions),
    total_sessions       = coalesce((d->>'total_sessions')::int,       np.total_sessions),
    streak_freezes       = coalesce((d->>'streak_freezes')::int,       np.streak_freezes),
    equipped_ecliptar    = coalesce(nullif(d->>'equipped_ecliptar',''), np.equipped_ecliptar)
  WHERE np.user_id = p_new_uid;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_old_progress(uuid, text) FROM PUBLIC, anon, authenticated;

-- 3. On signup: starter grant, then restore any old progress for this email.
--    Both side effects are guarded so they can never block account creation.
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
    NULL;
  END;

  BEGIN
    PERFORM public.apply_old_progress(NEW.id, NEW.email);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';
