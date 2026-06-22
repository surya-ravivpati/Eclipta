-- Make Ecliptar claiming resilient to migration drift.
--
-- Symptom: clicking "Claim" on the trophy road never granted the Ecliptar.
-- Cause: an earlier migration moved claiming to the claim_ecliptar RPC and
-- DROPPED the client INSERT policy. On a DB where the later shape-validation
-- migration wasn't applied, the RPC still used a hardcoded allowlist and
-- rejected the c/d slots ("Unknown ecliptar slug: chud-d"), and there was no
-- client INSERT path to fall back to.
--
-- This migration restores BOTH mechanisms so a claim works through either one:
--   1. claim_ecliptar — validated by SHAPE ("<archetype>-<a..d>" or a named God
--      creature), covering the full 4-per-archetype roster with no future
--      per-Ecliptar migrations.
--   2. A direct client INSERT policy with the SAME shape check in its WITH
--      CHECK, so the app can insert the user's own row if the RPC is stale.
-- Idempotent: safe to run repeatedly (e.g. pasted into the Supabase SQL editor).

-- 1. Recreate the RPC with shape validation.
CREATE OR REPLACE FUNCTION public.claim_ecliptar(
  p_slug text,
  p_archetype text,
  p_name text,
  p_node_id integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_exists boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF p_slug IS NULL OR NOT (
       p_slug ~ '^[a-z]+-[a-d]$'
       OR p_slug IN ('newton', 'ecliptadon', 'einsteinium', 'temporobys')
     ) THEN
    RAISE EXCEPTION 'Unknown ecliptar slug: %', p_slug;
  END IF;
  IF p_archetype IS NULL OR length(p_archetype) < 2 OR length(p_archetype) > 40 THEN
    RAISE EXCEPTION 'Invalid archetype';
  END IF;
  IF p_node_id IS NULL OR p_node_id < 0 OR p_node_id > 1000 THEN
    RAISE EXCEPTION 'Invalid node';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.user_ecliptars WHERE user_id = v_uid AND ecliptar_slug = p_slug
  ) INTO v_exists;
  IF v_exists THEN
    RETURN jsonb_build_object('already_claimed', true, 'slug', p_slug);
  END IF;

  INSERT INTO public.user_ecliptars(user_id, archetype, ecliptar_slug, ecliptar_name, node_id)
  VALUES (v_uid, p_archetype, p_slug, COALESCE(NULLIF(trim(p_name), ''), p_slug), p_node_id);

  RETURN jsonb_build_object('already_claimed', false, 'slug', p_slug);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_ecliptar(text, text, text, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.claim_ecliptar(text, text, text, integer) TO authenticated;

-- 2. Re-add a shape-checked client INSERT policy (fallback path). The WITH
--    CHECK enforces the same ownership + slug shape as the RPC, so this does
--    not let a user grant themselves an arbitrary/invalid Ecliptar.
DROP POLICY IF EXISTS "Users can claim their own ecliptars" ON public.user_ecliptars;
CREATE POLICY "Users can claim their own ecliptars"
  ON public.user_ecliptars FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      ecliptar_slug ~ '^[a-z]+-[a-d]$'
      OR ecliptar_slug IN ('newton', 'ecliptadon', 'einsteinium', 'temporobys')
    )
  );
