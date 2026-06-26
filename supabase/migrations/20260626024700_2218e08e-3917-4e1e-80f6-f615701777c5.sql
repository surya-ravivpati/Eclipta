
DO $$
DECLARE
  fn record;
  keep_public text[] := ARRAY[
    'get_platform_stats','get_leaderboard','get_pvp_leaderboard',
    'get_forum_stats','get_public_profile','search_users'
  ];
  sig text;
BEGIN
  FOR fn IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
      AND NOT (p.proname = ANY(keep_public))
      AND has_function_privilege('anon', p.oid, 'execute')
  LOOP
    sig := format('public.%I(%s)', fn.proname, fn.args);
    EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || sig || ' FROM PUBLIC';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || sig || ' FROM anon';
  END LOOP;
END $$;
