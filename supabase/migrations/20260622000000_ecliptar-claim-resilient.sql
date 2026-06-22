-- Make Ecliptar claiming work on a database that is missing the schema.
--
-- Symptom history: claims failed with "Unknown ecliptar slug", then with
-- relation "public.user_ecliptars" does not exist — i.e. the ownership table
-- was never created on this project. This script is fully self-contained and
-- idempotent: it creates the table, RLS, policies and the claim function, so
-- claiming works whether the DB is fresh or partially migrated. Safe to re-run.

-- 1. Ownership table (UNIQUE prevents double-claims).
CREATE TABLE IF NOT EXISTS public.user_ecliptars (
  id            uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid NOT NULL,
  archetype     text NOT NULL,
  ecliptar_slug text NOT NULL,
  ecliptar_name text NOT NULL,
  node_id       integer NOT NULL,
  claimed_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ecliptar_slug)
);

ALTER TABLE public.user_ecliptars ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_user_ecliptars_user_archetype
  ON public.user_ecliptars(user_id, archetype);

-- 2. Read: public read so profile pages can show owned Ecliptars.
DROP POLICY IF EXISTS "Users can view their own ecliptars" ON public.user_ecliptars;
DROP POLICY IF EXISTS "Anyone can view ecliptars"          ON public.user_ecliptars;
CREATE POLICY "Anyone can view ecliptars"
  ON public.user_ecliptars FOR SELECT USING (true);

-- 3. Insert: the user may insert their own rows (slug shape is enforced by the
--    claim function below; keeping the policy simple avoids false RLS denials
--    on the fallback insert path).
DROP POLICY IF EXISTS "Users can claim their own ecliptars" ON public.user_ecliptars;
CREATE POLICY "Users can claim their own ecliptars"
  ON public.user_ecliptars FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 4. Claim function: SECURITY DEFINER, slug validated by SHAPE so the full
--    4-per-archetype roster (and God creatures) works with no further migrations.
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

-- 5. Tell PostgREST to reload its schema cache so the new function is exposed
--    to the app's RPC call immediately (otherwise it can take a moment).
NOTIFY pgrst, 'reload schema';
