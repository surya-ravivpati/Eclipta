-- The original dashboard function accepts a user ID for no product use case.
-- Keep its query intact behind a private implementation and put the caller
-- identity check at the SECURITY DEFINER boundary.
ALTER FUNCTION public.get_dashboard(uuid) RENAME TO get_dashboard_unchecked;

CREATE FUNCTION public.get_dashboard(p_user uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_user IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN public.get_dashboard_unchecked(p_user);
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_unchecked(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_dashboard(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dashboard(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
