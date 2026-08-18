-- An age gate that is actually enforced, replacing one that never was.
--
-- Today `user_profiles.age` is written once during onboarding and read
-- nowhere: not a gate, not a display, not a condition. Meanwhile the privacy
-- policy (src/content/legal/documents.ts:83) states that "verifiable parental
-- consent is required before we may process their personal data" for users
-- under 13, and no such mechanism exists anywhere in the product. Onboarding
-- accepts `age >= 6`.
--
-- So the product asks a child their age, records it, ignores it, and promises
-- a protection it does not provide. Asking is what creates COPPA "actual
-- knowledge"; ignoring the answer is what forfeits the benefit of asking.
--
-- ── What changes ────────────────────────────────────────────────────────────
--   * Birth month and year replace free-text age. A stored age is wrong within
--     the year and cannot be re-derived; a birth date can. Month and year is
--     the least data that still answers the question - no day is collected,
--     because none is needed.
--   * Age is derived on read, never stored and never written by a client, so
--     it cannot go stale the morning after a birthday.
--   * The floor is enforced in a policy, not in the browser. The client talks
--     to PostgREST directly, so any check that lives only in TypeScript is one
--     devtools call away from being skipped.
--
-- ── What this is not ────────────────────────────────────────────────────────
-- This is a 13+ floor, not a restricted under-13 tier. Khan Academy runs one,
-- but it rests on teacher-as-consent-agent through schools, and Art of Problem
-- Solving's rests on a paid enrolment. Eclipta is free and consumer-facing and
-- has neither lever, so there is nothing here to hang verifiable consent on.
-- Building a restricted tier without it would be the same mistake again:
-- machinery that looks like protection and is not.

-- 1. Birth month and year ----------------------------------------------------
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS birth_year  smallint,
  ADD COLUMN IF NOT EXISTS birth_month smallint;

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_birth_month_valid;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_birth_month_valid
  CHECK (birth_month IS NULL OR birth_month BETWEEN 1 AND 12);

-- An upper bound that is generous rather than clever: the point is to reject
-- typos and obvious nonsense, not to adjudicate anyone's longevity.
ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_birth_year_valid;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_birth_year_valid
  CHECK (birth_year IS NULL OR birth_year BETWEEN 1900 AND extract(year FROM now())::smallint);

COMMENT ON COLUMN public.user_profiles.birth_year IS
  'Birth year. With birth_month, the least data needed to derive an age bracket. No day is collected.';

-- 2. The derivation ----------------------------------------------------------
/**
 * A user's age in whole years, or NULL when they have not told us.
 *
 * Computed on read rather than stored, so it cannot be stale the morning after
 * someone's birthday. Where the month is unknown the year alone is used, which
 * can only ever over-estimate age by under twelve months - and the gate below
 * is written so that the uncertain case does not silently let a younger user
 * through.
 */
CREATE OR REPLACE FUNCTION public.derived_age(p_year smallint, p_month smallint)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_year IS NULL THEN NULL
    ELSE date_part(
      'year',
      age(make_date(p_year::int, coalesce(p_month, 12)::int, 28))
    )::integer
  END;
$$;

/**
 * Whether this account has told us it is old enough to hold an account.
 *
 * NULL - no birth date recorded - is *not* treated as adult. Every account
 * created before this migration is in that state, so treating unknown as
 * permitted would exempt the entire existing user base from the gate forever.
 * They are prompted on next sign-in instead; see is_age_verified.
 */
CREATE OR REPLACE FUNCTION public.meets_minimum_age(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT public.derived_age(birth_year, birth_month) >= 13
       FROM public.user_profiles WHERE user_id = p_user),
    false
  );
$$;

/** True once an account has recorded a birth date at all. */
CREATE OR REPLACE FUNCTION public.is_age_verified(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT birth_year IS NOT NULL FROM public.user_profiles WHERE user_id = p_user),
    false
  );
$$;

/**
 * The predicate every public-writing policy should share.
 *
 * One function rather than the same condition copied into each policy: a rule
 * repeated across tables is a rule that will be updated in some of them.
 */
CREATE OR REPLACE FUNCTION public.can_post_publicly()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND public.meets_minimum_age(auth.uid());
$$;

REVOKE EXECUTE ON FUNCTION public.derived_age(smallint, smallint) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.derived_age(smallint, smallint) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.meets_minimum_age(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.is_age_verified(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.can_post_publicly() TO authenticated;

-- 3. Stop clients writing the columns directly -------------------------------
-- The own-row UPDATE policy on user_profiles would otherwise let a browser set
-- birth_year itself, which would make set_birth_date's write-once rule
-- decorative. A trigger is used rather than a column privilege because the
-- policy grants a whole-row update.
CREATE OR REPLACE FUNCTION public.guard_birth_date_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- SECURITY DEFINER calls run with the definer's rights; only set_birth_date
  -- legitimately changes these, and it sets this flag around its write.
  IF current_setting('eclipta.allow_birth_write', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.birth_year IS DISTINCT FROM OLD.birth_year
     OR NEW.birth_month IS DISTINCT FROM OLD.birth_month THEN
    RAISE EXCEPTION 'birth_year and birth_month may only be set through set_birth_date';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_profiles_guard_birth_date ON public.user_profiles;
CREATE TRIGGER user_profiles_guard_birth_date
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_birth_date_columns();


-- 4. Set the birth date once -------------------------------------------------
/**
 * Records a birth month and year, and refuses anyone under 13.
 *
 * Write-once by design. A gate a user can edit is not a gate: without this,
 * anyone refused at signup could set an acceptable year, get through, and then
 * change it back. Correcting a genuine mistake is a support request, which is
 * the right amount of friction for a field that decides eligibility.
 */
CREATE OR REPLACE FUNCTION public.set_birth_date(p_year smallint, p_month smallint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_existing smallint;
  v_age      integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_year IS NULL OR p_month IS NULL THEN
    RAISE EXCEPTION 'A birth month and year are required';
  END IF;
  IF p_month < 1 OR p_month > 12 THEN RAISE EXCEPTION 'Invalid month'; END IF;
  IF p_year < 1900 OR p_year > extract(year FROM now())::smallint THEN
    RAISE EXCEPTION 'Invalid year';
  END IF;

  SELECT birth_year INTO v_existing FROM public.user_profiles WHERE user_id = v_uid;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already_set', true,
      'meets_minimum', public.meets_minimum_age(v_uid)
    );
  END IF;

  v_age := public.derived_age(p_year, p_month);

  IF v_age < 13 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'below_minimum_age');
  END IF;

  PERFORM set_config('eclipta.allow_birth_write', 'on', true);
  UPDATE public.user_profiles
     SET birth_year = p_year, birth_month = p_month
   WHERE user_id = v_uid;
  PERFORM set_config('eclipta.allow_birth_write', 'off', true);

  RETURN jsonb_build_object('ok', true, 'already_set', false, 'meets_minimum', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_birth_date(smallint, smallint) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_birth_date(smallint, smallint) TO authenticated;

-- 5. Retire the column that was never read -----------------------------------
-- Kept, not dropped: it holds real answers from real people, and destroying
-- them to tidy a schema is not this migration's call to make. Renamed so no
-- new code reaches for it by accident and thinks it means something.
ALTER TABLE public.user_profiles RENAME COLUMN age TO legacy_self_reported_age;
COMMENT ON COLUMN public.user_profiles.legacy_self_reported_age IS
  'Free-text age from the old onboarding step. Never read by anything. Superseded by birth_year/birth_month; retained rather than dropped so existing answers are not destroyed. Do not use.';

NOTIFY pgrst, 'reload schema';
