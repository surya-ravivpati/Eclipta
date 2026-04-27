CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.user_profiles (user_id, xp)
  VALUES (NEW.id, 200);
  RETURN NEW;
END;
$function$;

-- Backfill existing users who are stuck below the first unlock threshold.
UPDATE public.user_profiles SET xp = 200 WHERE xp < 200;