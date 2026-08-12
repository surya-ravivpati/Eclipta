-- Remove Ghost PvP.
--
-- Ghost PvP was matchmaking's middle tier: when no live opponent turned up
-- within 8 seconds, the client replayed a *different real player's* recorded
-- session — their per-question accuracy and timing — under a "— Ghost" label.
-- The cascade is now Live → Bot, and every trace of the replay path is gone
-- from the client.
--
-- ── What this migration drops, and what it deliberately keeps ───────────────
--
-- Dropped: the two RPCs that existed only to serve replays.
--
--   get_ghost_session(integer)          handed a stranger's session to a client
--   complete_ghost_battle(uuid,integer) applied a ghost match's ELO change
--
-- Kept, and this is the important half: `battle_sessions` and every one of its
-- columns. The table is NOT ghost infrastructure that happens to be reused —
-- it is the record of what each player did in each battle, and two live
-- features read it:
--
--   * get_weekly_report_data (20260810000000) builds the weekly email's
--     played / won / accuracy figures from it. Dropping the table would take
--     out the email that shipped two days ago.
--   * question_records holds the per-question action/correct/timeSpent trace,
--     which is the only existing source for a post-battle "practice what you
--     missed" flow.
--
-- So no user data is destroyed here. Dropping a column is irreversible and
-- would buy nothing but tidiness; leaving them costs nothing and keeps the
-- history intact. `record_battle_session` is likewise untouched — battles are
-- still recorded exactly as before, they are simply never replayed at anyone.
--
-- Removing the read path also closes a small privacy seam: get_ghost_session
-- returned another user's username together with their performance to any
-- authenticated caller who asked, and nothing rate-limited how often you could
-- ask. That is a fine trade for a feature that exists; it is pure cost for one
-- that does not.

-- Both are addressed by full signature: dropping by name alone fails if an old
-- overload from an earlier migration is still present on a given database.
DROP FUNCTION IF EXISTS public.get_ghost_session(integer);
DROP FUNCTION IF EXISTS public.complete_ghost_battle(uuid, integer);

-- `rating_applied` was set by complete_ghost_battle and by the bot-completion
-- path. It stays: it is the once-only guard the bot path still depends on, and
-- historical rows carry a true value that is a real fact about those matches.
COMMENT ON COLUMN public.battle_sessions.question_records IS
  'Per-question trace (action, correct, timeSpent) of a completed battle. No longer replayed as a ghost opponent — retained as the player''s own battle history and the source for post-battle review.';

NOTIFY pgrst, 'reload schema';
