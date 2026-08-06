-- Fixes an RLS regression: user_profiles' SELECT policy is own-row-only
-- (20260510013726...sql), and public_profiles was later recreated as
-- SECURITY INVOKER (20260510014752...sql), so it inherited that same
-- own-row restriction it was created specifically to route around. Result:
-- getUsername() in src/repositories/profile.ts returned null for every
-- user except the caller themselves, and getCourseCreatorUsername() in
-- src/repositories/courses.ts returned null for every course the caller
-- didn't author. Both need only the one already-public username column,
-- so give them a security-definer RPC the same way get_public_profile()
-- already does for the username-keyed lookup.
CREATE OR REPLACE FUNCTION public.get_username_by_id(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT username
  FROM public.user_profiles
  WHERE user_id = p_user_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_username_by_id(uuid) TO anon, authenticated;
