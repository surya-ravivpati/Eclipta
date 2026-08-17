-- Trophy Road grants a random Ecliptar from an archetype, not a fixed one.
--
-- Until now each node named the exact slugs it handed out, and claim_ecliptar
-- validated a slug only by its shape ('^[a-z]+-[a-d]$'). Rolling client-side
-- on top of that would not be a roll at all: refresh before claiming and you
-- get another one, and nothing stops a client asking for its favourite by
-- name. So the roll happens here, once, inside the same statement that
-- records it.
--
-- That needs the database to know the roster, which it never has. The catalog
-- below is the server's copy of src/lib/ecliptars.ts. The two are checked
-- against each other by src/lib/ecliptars.catalog.test.ts, so adding an
-- Ecliptar on one side and not the other fails the suite rather than quietly
-- making a creature unrollable.

-- 1. The roster ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ecliptar_catalog (
  slug      text PRIMARY KEY,
  archetype text NOT NULL,
  name      text NOT NULL,
  -- Newton and Ecliptadon are the two final bosses. They share the god
  -- archetype with Einsteinium and Temporubyss, but they are earned by
  -- reaching their own nodes at the end of the road - not by rolling the god
  -- pool partway up it, which would hand out the ending early.
  rollable  boolean NOT NULL DEFAULT true
);

ALTER TABLE public.ecliptar_catalog ENABLE ROW LEVEL SECURITY;

-- The roster is not a secret; it is on the Trophy Road for anyone to browse.
DROP POLICY IF EXISTS "Anyone can read the ecliptar catalog" ON public.ecliptar_catalog;
CREATE POLICY "Anyone can read the ecliptar catalog"
  ON public.ecliptar_catalog FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_ecliptar_catalog_archetype
  ON public.ecliptar_catalog(archetype);

INSERT INTO public.ecliptar_catalog (slug, archetype, name, rollable) VALUES
  ('speedster-a', 'speedster', 'Griffstrike', true),
  ('speedster-b', 'speedster', 'Spark', true),
  ('speedster-c', 'speedster', 'Correr', true),
  ('speedster-d', 'speedster', 'Zypheroo', true),
  ('tank-a', 'tank', 'Dingus', true),
  ('tank-b', 'tank', 'Syntium', true),
  ('tank-c', 'tank', 'Mammorock', true),
  ('tank-d', 'tank', 'Ironhide', true),
  ('chud-a', 'chud', 'Razorwing', true),
  ('chud-b', 'chud', 'Crownscar', true),
  ('chud-c', 'chud', 'Nighthorn', true),
  ('chud-d', 'chud', 'Nitpick', true),
  ('gambler-a', 'gambler', 'Mr. McHenry', true),
  ('gambler-b', 'gambler', 'Rattleslot', true),
  ('gambler-c', 'gambler', 'Snailouette', true),
  ('gambler-d', 'gambler', 'Fortunox', true),
  ('healer-a', 'healer', 'BrightEye', true),
  ('healer-b', 'healer', 'Chobroni', true),
  ('healer-c', 'healer', 'Bloomheart', true),
  ('healer-d', 'healer', 'Mossy Golem', true),
  ('fulcrum-a', 'fulcrum', 'Fuego', true),
  ('fulcrum-b', 'fulcrum', 'Petrona', true),
  ('fulcrum-c', 'fulcrum', 'Ticonder', true),
  ('fulcrum-d', 'fulcrum', 'Equinox', true),
  ('accelerator-a', 'accelerator', 'Venuck', true),
  ('accelerator-b', 'accelerator', 'Fueljaw', true),
  ('accelerator-c', 'accelerator', 'Adrenalynx', true),
  ('accelerator-d', 'accelerator', 'Chronovex', true),
  ('newton', 'god', 'Newton', false),
  ('ecliptadon', 'god', 'Ecliptadon', false),
  ('einsteinium', 'god', 'Einsteinium', true),
  ('temporobys', 'god', 'Temporubyss', true)
ON CONFLICT (slug) DO UPDATE
  SET archetype = EXCLUDED.archetype,
      name      = EXCLUDED.name,
      rollable  = EXCLUDED.rollable;

-- 2. The roll --------------------------------------------------------------
-- Picks one Ecliptar the caller does not already own, at random, from the
-- requested archetype. Returns which one, or says the pool is exhausted.
--
-- Idempotency is the caller's problem to *detect*, not to prevent: a second
-- call rolls again from a smaller pool. The Trophy Road only offers the button
-- while a node still has something to give, and node_id is recorded so a
-- future audit can see which node handed out what.
CREATE OR REPLACE FUNCTION public.claim_random_ecliptar(
  p_archetype text,
  p_node_id   integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_pick public.ecliptar_catalog%ROWTYPE;
  v_left integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_archetype IS NULL OR p_archetype !~ '^[a-z]{2,40}$' THEN
    RAISE EXCEPTION 'Invalid archetype';
  END IF;
  IF p_node_id IS NULL OR p_node_id < 0 OR p_node_id > 1000 THEN
    RAISE EXCEPTION 'Invalid node';
  END IF;

  SELECT c.* INTO v_pick
  FROM public.ecliptar_catalog c
  WHERE c.archetype = p_archetype
    AND c.rollable
    AND NOT EXISTS (
      SELECT 1 FROM public.user_ecliptars u
      WHERE u.user_id = v_uid AND u.ecliptar_slug = c.slug
    )
  ORDER BY random()
  LIMIT 1;

  IF NOT FOUND THEN
    -- Either the archetype has nothing left to give, or it does not exist.
    -- Both read the same to a player, and neither is an error.
    RETURN jsonb_build_object('granted', false, 'reason', 'none_left', 'remaining', 0);
  END IF;

  INSERT INTO public.user_ecliptars(user_id, archetype, ecliptar_slug, ecliptar_name, node_id)
  VALUES (v_uid, v_pick.archetype, v_pick.slug, v_pick.name, p_node_id)
  ON CONFLICT (user_id, ecliptar_slug) DO NOTHING;

  SELECT count(*) INTO v_left
  FROM public.ecliptar_catalog c
  WHERE c.archetype = p_archetype
    AND c.rollable
    AND NOT EXISTS (
      SELECT 1 FROM public.user_ecliptars u
      WHERE u.user_id = v_uid AND u.ecliptar_slug = c.slug
    );

  RETURN jsonb_build_object(
    'granted',   true,
    'slug',      v_pick.slug,
    'name',      v_pick.name,
    'archetype', v_pick.archetype,
    'remaining', v_left
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_random_ecliptar(text, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.claim_random_ecliptar(text, integer) TO authenticated;

-- 3. How many an archetype still owes the caller ---------------------------
-- The Trophy Road needs this to decide whether a node still has a roll left,
-- now that it cannot answer the question from a fixed slug list.
CREATE OR REPLACE FUNCTION public.count_unowned_ecliptars(p_archetype text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM public.ecliptar_catalog c
  WHERE c.archetype = p_archetype
    AND c.rollable
    AND NOT EXISTS (
      SELECT 1 FROM public.user_ecliptars u
      WHERE u.user_id = auth.uid() AND u.ecliptar_slug = c.slug
    );
$$;

REVOKE EXECUTE ON FUNCTION public.count_unowned_ecliptars(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.count_unowned_ecliptars(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
