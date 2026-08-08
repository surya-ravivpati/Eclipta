-- Browser-provided battle and Pressure summaries are presentation data, not
-- authority for XP, ratings, or leaderboard scores. The replacement PvP path
-- writes server-verified turn data; non-PvP XP is derived from one-time
-- battle_question_challenges in award_verified_battle_xp.

REVOKE ALL ON FUNCTION public.award_battle_xp(integer, integer, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_battle_session(
  text, boolean, integer, integer, integer, integer, jsonb, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_ghost_battle(uuid, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_bot_battle(uuid)
  FROM PUBLIC, anon, authenticated;

-- Pressure Mode has no server-issued item/answer protocol yet. Leaving this
-- RPC callable would let any browser submit a forged perfect score and alter
-- ratings. Keep the historical data readable, but make score finalization
-- service-only until the server verifier is introduced.
REVOKE ALL ON FUNCTION public.complete_pressure_session(
  uuid, smallint, jsonb, jsonb, jsonb, jsonb, boolean
) FROM PUBLIC, anon, authenticated;
