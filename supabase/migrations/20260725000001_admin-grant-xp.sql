-- ================================================================
-- Admin grant XP function for granting XP to any user by ID
-- ================================================================

CREATE OR REPLACE FUNCTION public.admin_grant_xp(p_user_id uuid, p_amount integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_xp integer;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID cannot be null';
  END IF;
  IF p_amount <= 0 THEN
    SELECT xp INTO v_new_xp FROM public.user_profiles WHERE user_id = p_user_id;
    RETURN COALESCE(v_new_xp, 0);
  END IF;
  -- Mark trusted so the guard allows increments larger than 1100
  PERFORM set_config('app.xp_trusted', '1', true);
  UPDATE public.user_profiles
    SET xp = xp + p_amount
    WHERE user_id = p_user_id
    RETURNING xp INTO v_new_xp;
  PERFORM set_config('app.xp_trusted', '0', true);
  RETURN COALESCE(v_new_xp, 0);
END;
$$;

-- Admin function to set XP to a specific value (useful for max XP grants)
CREATE OR REPLACE FUNCTION public.admin_set_xp(p_user_id uuid, p_xp integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_xp integer;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID cannot be null';
  END IF;
  IF p_xp < 0 THEN
    RAISE EXCEPTION 'XP cannot be negative';
  END IF;
  -- Mark trusted context
  PERFORM set_config('app.xp_trusted', '1', true);
  UPDATE public.user_profiles
    SET xp = p_xp
    WHERE user_id = p_user_id
    RETURNING xp INTO v_new_xp;
  PERFORM set_config('app.xp_trusted', '0', true);
  RETURN COALESCE(v_new_xp, 0);
END;
$$;

-- Restrict to authenticated users only (you should add additional admin checks if needed)
REVOKE EXECUTE ON FUNCTION public.admin_grant_xp(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_grant_xp(uuid, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_set_xp(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_xp(uuid, integer) TO authenticated;
