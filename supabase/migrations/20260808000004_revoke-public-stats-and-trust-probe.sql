-- Keep aggregate statistics behind an authenticated session. The landing page
-- no longer consumes these RPCs anonymously, and retaining anon grants makes
-- a future expansion of either function publicly reachable by default.
REVOKE EXECUTE ON FUNCTION public.get_platform_stats() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_forum_stats() FROM anon;

-- This helper is invoked inside the moderation pipeline. It must not be a
-- client-callable oracle for another user's reporting history.
REVOKE ALL ON FUNCTION public.reporter_is_high_trust(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reporter_is_high_trust(uuid) TO service_role;
