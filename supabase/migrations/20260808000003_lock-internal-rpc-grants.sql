REVOKE ALL ON FUNCTION public.check_ai_rate_limit(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_email_preferences(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_digest_data(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_player_wl(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_bot(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.drift_bot_ratings(integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.check_ai_rate_limit(uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_email_preferences(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_digest_data(uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.recompute_player_wl(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_bot(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.drift_bot_ratings(integer) TO service_role;
