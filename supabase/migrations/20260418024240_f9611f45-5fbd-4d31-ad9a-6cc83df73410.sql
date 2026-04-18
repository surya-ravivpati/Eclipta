
DROP VIEW IF EXISTS public.platform_stats;

CREATE OR REPLACE FUNCTION public.get_platform_stats()
RETURNS TABLE(learners bigint, battles bigint, ecliptars bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT count(*) FROM public.user_profiles) AS learners,
    (SELECT count(*) FROM public.learning_history WHERE session_type = 'battle') AS battles,
    (SELECT count(*) FROM public.user_ecliptars) AS ecliptars;
$$;

GRANT EXECUTE ON FUNCTION public.get_platform_stats() TO anon, authenticated;
