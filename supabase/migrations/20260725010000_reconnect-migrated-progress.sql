-- Reconnect migrated ("old project") progress to new logins, matched by email.
--
-- Background: the data migration copied only the `public` schema, not
-- `auth.users`, and ran with session_replication_role=replica (FK checks off),
-- so every migrated row landed keyed to an OLD auth id that has no login in the
-- new project — orphaned progress. When a user re-registers with the same email
-- they get a fresh NEW id and see none of it.
--
-- This migration installs the machinery to bridge the two by email:
--   * old_auth            — a mapping table (old_uid -> email) exported from the
--                           OLD project and loaded here.
--   * reconnect_migrated_progress(new_uid, email)
--                         — re-keys an orphaned old account's rows onto a new
--                           login. "Prefer old account": the new account's rows
--                           are cleared first, then the old rows are moved over.
--   * handle_new_user     — now calls the reconnect (guarded) on every signup, so
--                           users who return LATER are reconnected automatically.
-- Idempotent; safe to re-run.

-- 1. Email mapping table (populated from the OLD project's auth.users).
--    RLS on with no policy => unreadable by app users (it's PII); the
--    SECURITY DEFINER paths below and the service role bypass RLS.
CREATE TABLE IF NOT EXISTS public.old_auth (
  old_uid uuid PRIMARY KEY,
  email   text UNIQUE NOT NULL
);
ALTER TABLE public.old_auth ENABLE ROW LEVEL SECURITY;

-- 2. Re-key one orphaned old account onto a new login. Returns true if it moved
--    anything. Guards ensure we only ever touch orphaned (login-less) migrated
--    data, never a real account's rows.
CREATE OR REPLACE FUNCTION public.reconnect_migrated_progress(p_new_uid uuid, p_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old uuid;
  r record;
BEGIN
  IF p_new_uid IS NULL OR p_email IS NULL THEN RETURN false; END IF;

  SELECT old_uid INTO v_old FROM public.old_auth WHERE email = lower(p_email) LIMIT 1;

  IF v_old IS NULL          THEN RETURN false; END IF;   -- no old account for this email
  IF v_old = p_new_uid      THEN RETURN false; END IF;
  -- Only move orphaned (login-less) migrated data.
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = v_old) THEN RETURN false; END IF;
  -- Must actually have migrated data to move.
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = v_old) THEN RETURN false; END IF;

  -- For every public column that references auth.users(id): clear the new
  -- account's rows (prefer old account), then move the old rows onto the new id.
  FOR r IN
    SELECT tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND ccu.table_schema = 'auth' AND ccu.table_name = 'users' AND ccu.column_name = 'id'
  LOOP
    EXECUTE format('DELETE FROM public.%I WHERE %I = $1', r.table_name, r.column_name) USING p_new_uid;
    EXECUTE format('UPDATE public.%I SET %I = $1 WHERE %I = $2', r.table_name, r.column_name, r.column_name)
      USING p_new_uid, v_old;
  END LOOP;

  RETURN true;
END;
$$;

-- Not callable by app users — only the signup trigger (as owner) and the
-- service-role backfill invoke it. This prevents email-based data hijacking.
REVOKE EXECUTE ON FUNCTION public.reconnect_migrated_progress(uuid, text) FROM PUBLIC, anon, authenticated;

-- 3. New-account trigger: starter grant, then auto-reconnect any old progress
--    for this email. Both side effects are guarded so they can never block
--    account creation.
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
    PERFORM public.reconnect_migrated_progress(NEW.id, NEW.email);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';
