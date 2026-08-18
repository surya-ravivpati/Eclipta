-- A queue a moderator can actually see.
--
-- `public.reports` has collected every report since 20260626180713 - forum
-- posts, usernames, and study-room chat - and nothing has ever read it.
-- `/admin/forum` reads the older `forum_reports` table, so a study-room report
-- reaches the database and stops there. Somebody reports a message, gets
-- "thanks, this has been sent for review", and no human is ever shown it.
--
-- The pipeline around it is sound: the report Edge Function looks the content
-- up server-side, derives the author itself rather than trusting the client,
-- and re-scans through the moderation layers. What was missing is the last
-- step - a person.
--
-- What this adds:
--   * get_report_queue    - what a moderator needs to judge one report, in one
--                           call: the report, who filed it, how reliable their
--                           past reports were, and what the scanner concluded.
--   * resolve_report      - the moderator's verdict, recorded against every
--                           open report on the same target rather than one at
--                           a time.
--   * set_chat_message_status - set_moderation_status only understands forum
--                           types, so chat had no moderator action at all.

-- 1. Reading the queue -------------------------------------------------------
/**
 * Open reports, newest first, with the context needed to judge them.
 *
 * Grouped per target rather than per row: five people reporting one message is
 * one decision, not five, and showing it five times invites a moderator to
 * action it five times.
 *
 * reporter_confirmed / reporter_resolved come from the existing reporter_trust
 * view. They are shown, not acted on - a moderator weighing a report is doing
 * their job; the system silently discounting it is the system deciding.
 */
CREATE OR REPLACE FUNCTION public.get_report_queue(
  p_status text DEFAULT 'pending',
  p_limit  integer DEFAULT 100
)
RETURNS TABLE (
  target_type        text,
  target_id          uuid,
  target_author      uuid,
  author_name        text,
  report_count       integer,
  first_reported_at  timestamptz,
  last_reported_at   timestamptz,
  categories         text[],
  notes              text[],
  status             text,
  reporter_confirmed integer,
  reporter_resolved  integer,
  scanner_decision   text,
  scanner_category   text,
  scanner_confidence integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(v_uid, 'moderator') OR public.has_role(v_uid, 'admin')) THEN
    RAISE EXCEPTION 'Moderator role required';
  END IF;
  IF p_status NOT IN ('pending','scanning','escalated','action_taken','no_violation','all') THEN
    RAISE EXCEPTION 'Invalid status filter';
  END IF;

  RETURN QUERY
  WITH grouped AS (
    SELECT r.target_type AS t_type,
           r.target_id   AS t_id,
           max(r.target_author) AS t_author,
           count(*)::integer    AS n_reports,
           min(r.created_at)    AS first_at,
           max(r.created_at)    AS last_at,
           array_remove(array_agg(DISTINCT r.category), NULL) AS cats,
           array_remove(array_agg(r.note ORDER BY r.created_at), NULL) AS note_list,
           min(CASE r.status
                 WHEN 'pending'   THEN 1
                 WHEN 'scanning'  THEN 2
                 WHEN 'escalated' THEN 3
                 ELSE 4
               END) AS open_rank,
           (array_agg(r.status ORDER BY r.created_at DESC))[1] AS latest_status,
           (array_agg(r.reporter_id ORDER BY r.created_at DESC))[1] AS latest_reporter
      FROM public.reports r
     WHERE p_status = 'all' OR r.status = p_status
     GROUP BY r.target_type, r.target_id
  )
  SELECT g.t_type,
         g.t_id,
         g.t_author,
         up.username,
         g.n_reports,
         g.first_at,
         g.last_at,
         g.cats,
         g.note_list,
         CASE g.open_rank
           WHEN 1 THEN 'pending'
           WHEN 2 THEN 'scanning'
           WHEN 3 THEN 'escalated'
           ELSE g.latest_status
         END,
         coalesce(rt.confirmed, 0)::integer,
         coalesce(rt.resolved, 0)::integer,
         md.decision,
         md.category,
         md.confidence
    FROM grouped g
    LEFT JOIN public.user_profiles up ON up.user_id = g.t_author
    LEFT JOIN public.reporter_trust rt ON rt.reporter_id = g.latest_reporter
    LEFT JOIN LATERAL (
      SELECT d.decision, d.category, d.confidence
        FROM public.moderation_decisions d
       WHERE d.target_type = g.t_type
         AND d.content_ref IS NOT DISTINCT FROM g.t_id
       ORDER BY d.created_at DESC
       LIMIT 1
    ) md ON true
   ORDER BY g.open_rank, g.last_at DESC
   LIMIT LEAST(GREATEST(coalesce(p_limit, 100), 1), 500);
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_report_queue(text, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_report_queue(text, integer) TO authenticated;

-- 2. Hiding a chat message ---------------------------------------------------
/**
 * The moderator action study-room chat never had.
 *
 * set_moderation_status covers threads, answers and comments and rejects
 * anything else, so a reported message could be looked at and not acted on.
 */
CREATE OR REPLACE FUNCTION public.set_chat_message_status(
  p_message_id uuid,
  p_status     text,
  p_reason     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(v_uid, 'moderator') OR public.has_role(v_uid, 'admin')) THEN
    RAISE EXCEPTION 'Moderator role required';
  END IF;
  IF p_status NOT IN ('visible','hidden','removed') THEN RAISE EXCEPTION 'Invalid status'; END IF;

  UPDATE public.study_room_messages
     SET moderation_status = p_status
   WHERE id = p_message_id;

  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;

  INSERT INTO public.moderation_actions(target_type, target_id, actor_id, action, source, reason)
  VALUES (
    'chat_message', p_message_id, v_uid,
    CASE p_status WHEN 'visible' THEN 'restore' WHEN 'hidden' THEN 'hide' ELSE 'remove' END,
    'moderator', p_reason
  );

  RETURN jsonb_build_object('ok', true, 'status', p_status);
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_chat_message_status(uuid, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_chat_message_status(uuid, text, text) TO authenticated;

-- 3. Recording the verdict ---------------------------------------------------
/**
 * Close every open report on one target with a moderator's decision.
 *
 * All of them, not one: reports are shown grouped, so resolving the group is
 * what the moderator actually did. Leaving siblings open would put the same
 * target back in the queue the moment the page refreshed.
 *
 * confirmed feeds reporter_trust, which is why "no violation" is recorded as an
 * outcome rather than a deletion - a reporter who is repeatedly wrong is a
 * signal, and so is one who is repeatedly right.
 */
CREATE OR REPLACE FUNCTION public.resolve_report(
  p_target_type text,
  p_target_id   uuid,
  p_outcome     text,
  p_reason      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid   uuid := auth.uid();
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(v_uid, 'moderator') OR public.has_role(v_uid, 'admin')) THEN
    RAISE EXCEPTION 'Moderator role required';
  END IF;
  IF p_outcome NOT IN ('action_taken','no_violation','escalated') THEN
    RAISE EXCEPTION 'Invalid outcome';
  END IF;

  UPDATE public.reports
     SET status       = p_outcome,
         processed_at = now(),
         confirmed    = CASE p_outcome
                          WHEN 'action_taken' THEN true
                          WHEN 'no_violation' THEN false
                          ELSE confirmed
                        END
   WHERE target_type = p_target_type
     AND target_id IS NOT DISTINCT FROM p_target_id
     AND status IN ('pending','scanning','escalated');

  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.moderation_actions(target_type, target_id, actor_id, action, source, reason)
  VALUES (p_target_type, p_target_id, v_uid, p_outcome, 'moderator', p_reason);

  RETURN jsonb_build_object('ok', true, 'resolved', v_count);
END;
$fn$;

REVOKE ALL ON FUNCTION public.resolve_report(text, uuid, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.resolve_report(text, uuid, text, text) TO authenticated;

-- 4. Stop AI-content reports vanishing ---------------------------------------
-- A report whose target_id is null - what RoomSafety sends for Luna's replies -
-- hits `if (!targetId) return null` in the report function and is closed as
-- target_gone. Right for a deleted row, wrong for one that never existed:
-- nobody deleted it, and a complaint about what the AI said is exactly the kind
-- a human should see.
UPDATE public.reports
   SET status = 'pending', processed_at = NULL
 WHERE target_id IS NULL
   AND status = 'target_gone';

CREATE OR REPLACE FUNCTION public.mark_report_target_gone(p_target_type text, p_target_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- Without a target id there is no row to have gone missing, so there is
  -- nothing to close. Leave it for a person.
  IF p_target_id IS NULL THEN RETURN; END IF;

  UPDATE public.reports
     SET status = 'target_gone', processed_at = now()
   WHERE target_type = p_target_type
     AND target_id = p_target_id
     AND status IN ('pending','scanning');
END;
$fn$;

REVOKE ALL ON FUNCTION public.mark_report_target_gone(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.mark_report_target_gone(text, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
