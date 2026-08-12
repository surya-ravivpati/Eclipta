-- Scheduled lifecycle emails: streak saver, weekly report, re-engagement.
--
-- The email platform (20260801030000) could already send. What it had no way to
-- do was decide *when*, for *whom*, without a human pressing a button — so it
-- has never sent anything. This adds the missing half:
--
--   get_lifecycle_email_candidates  the facts a decision needs, one row per user
--   get_weekly_report_data          the week's figures, assembled server-side
--   run_lifecycle_email_sweep       what pg_cron calls every hour
--
-- Deliberately *not* here: the decision itself. Which of the three emails a user
-- should get lives in supabase/functions/_shared/email/schedule.ts, where it can
-- be tested exhaustively without a database. Postgres supplies facts; TypeScript
-- decides; send-lifecycle-email stays the only thing that sends.
--
-- ── Activating this (Supabase dashboard, no CLI needed) ──────────────────────
--   1. Database → Extensions: enable `pg_cron` and `pg_net` if the notices
--      below say they could not be enabled automatically.
--   2. Edge Functions → deploy `run-lifecycle-emails`.
--   3. SQL Editor, once — this stores the two secrets the sweep needs. They are
--      held in Supabase Vault, encrypted, and never appear in this repo:
--        SELECT vault.create_secret(
--          'https://<project-ref>.supabase.co/functions/v1/run-lifecycle-emails',
--          'lifecycle_email_endpoint');
--        SELECT vault.create_secret('<service-role-key>', 'lifecycle_email_service_key');
--   4. Until both secrets exist the hourly job runs and does nothing, which is
--      the safe direction to fail in.

-- ── Category ─────────────────────────────────────────────────────────────────
-- Nothing below may reference this value as a literal: Postgres forbids using a
-- new enum value in the transaction that added it. Category comparisons in this
-- file cast to text for exactly that reason.
ALTER TYPE public.email_category ADD VALUE IF NOT EXISTS 're_engagement';

-- ── The facts a send decision needs ──────────────────────────────────────────

/**
 * One row per user who could conceivably receive lifecycle mail.
 *
 * Returns facts only — no thresholds, no "should we send" — so that the rules
 * live in exactly one place and cannot drift between SQL and TypeScript.
 *
 * Keyset-paginated on user_id so a sweep over a large user base is a series of
 * bounded queries rather than one unbounded result set.
 */
CREATE OR REPLACE FUNCTION public.get_lifecycle_email_candidates(
  p_now   timestamptz DEFAULT now(),
  p_limit integer     DEFAULT 500,
  p_after uuid        DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
)
RETURNS TABLE (
  user_id            uuid,
  daily_streak       integer,
  last_practice_date date,
  last_activity_at   timestamptz,
  local_hour         smallint,
  local_weekday      smallint,
  digest_hour        smallint,
  muted              text[],
  last_sent          jsonb,
  last_topic         text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  -- email_preferences.timezone is user-writable text. Joining it against the
  -- real zone list means one person typing nonsense into their settings cannot
  -- abort the sweep for everybody with "time zone not recognized".
  WITH zone AS (SELECT name FROM pg_timezone_names)
  SELECT
    p.user_id,
    coalesce(p.daily_streak, 0)::integer,
    p.last_practice_date,
    -- Account creation is the floor, so a signup who never did anything still
    -- looks "away" after a week rather than away forever.
    greatest(u.created_at, act.last_seen),
    extract(hour FROM (p_now AT TIME ZONE coalesce(z.name, 'UTC')))::smallint,
    -- isodow is 1 = Monday; the decision module counts from 0.
    (extract(isodow FROM (p_now AT TIME ZONE coalesce(z.name, 'UTC')))::integer - 1)::smallint,
    coalesce(pref.digest_hour, 8)::smallint,
    coalesce(pref.muted::text[], ARRAY[]::text[]),
    coalesce(sent.by_category, '{}'::jsonb),
    act.topic
  FROM public.user_profiles p
  JOIN auth.users u ON u.id = p.user_id
  LEFT JOIN public.email_preferences pref ON pref.user_id = p.user_id
  LEFT JOIN zone z ON z.name = pref.timezone
  LEFT JOIN LATERAL (
    SELECT max(h.created_at) AS last_seen,
           (SELECT h2.topic
              FROM public.learning_history h2
             WHERE h2.user_id = p.user_id AND h2.topic IS NOT NULL
             ORDER BY h2.created_at DESC
             LIMIT 1) AS topic
      FROM public.learning_history h
     WHERE h.user_id = p.user_id
  ) act ON true
  LEFT JOIN LATERAL (
    -- 'queued' counts as sent. A queued row means send-lifecycle-email already
    -- claimed the idempotency key; treating it as "never sent" would invite the
    -- next sweep to try again for a message that is in flight.
    SELECT jsonb_object_agg(t.category, t.sent_at) AS by_category
      FROM (
        SELECT e.category::text AS category, max(e.created_at) AS sent_at
          FROM public.email_log e
         WHERE e.user_id = p.user_id
           AND e.status <> 'failed'
           AND e.created_at >= p_now - interval '60 days'
         GROUP BY e.category::text
      ) t
  ) sent ON true
  WHERE coalesce(pref.unsubscribed_all, false) = false
    -- Never mail an address nobody confirmed. An unconfirmed address is as
    -- likely to belong to a stranger as to the person who typed it.
    AND u.email_confirmed_at IS NOT NULL
    AND p.user_id > p_after
  ORDER BY p.user_id
  LIMIT p_limit;
$fn$;

-- ── The week's figures ───────────────────────────────────────────────────────

/**
 * Everything the weekly report template needs, in one round trip.
 *
 * Same shape of assembly as get_digest_data and get_dashboard: one consistent
 * snapshot rather than six queries whose numbers disagree with each other.
 *
 * Two figures the template asks for are reported honestly rather than invented:
 * study minutes come from question response times (the only duration Eclipta
 * records, so it is a floor, not a total), and mastery growth is left to the
 * caller because no historical snapshot exists to diff against.
 */
CREATE OR REPLACE FUNCTION public.get_weekly_report_data(p_user uuid, p_since timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT jsonb_build_object(
    'xp_gained', coalesce((
      SELECT sum(amount) FROM public.xp_award_log
       WHERE user_id = p_user AND awarded_at >= p_since), 0),

    -- Monday-first, one entry per weekday, so the bar chart always has 7 bars.
    'study_minutes', coalesce((
      SELECT jsonb_agg(coalesce(m.mins, 0) ORDER BY d.dow)
        FROM generate_series(1, 7) AS d(dow)
        LEFT JOIN (
          SELECT extract(isodow FROM created_at)::integer AS dow,
                 round(sum(coalesce(response_time_ms, 0)) / 60000.0)::integer AS mins
            FROM public.learning_history
           WHERE user_id = p_user AND created_at >= p_since
           GROUP BY 1
        ) m ON m.dow = d.dow), '[0,0,0,0,0,0,0]'::jsonb),

    'battles', (
      SELECT jsonb_build_object(
               'played', count(*),
               'won', count(*) FILTER (WHERE won),
               'accuracy', CASE
                             WHEN coalesce(sum(total_questions), 0) > 0
                             THEN round(100.0 * sum(correct_answers) / sum(total_questions))::integer
                             ELSE 0
                           END)
        FROM public.battle_sessions
       WHERE user_id = p_user AND created_at >= p_since),

    'strongest', coalesce((
      SELECT jsonb_agg(x) FROM (
        SELECT subject, round(avg(confidence)::numeric, 2) AS confidence
          FROM public.concept_mastery
         WHERE user_id = p_user
         GROUP BY subject
        HAVING count(*) >= 2
         ORDER BY avg(confidence) DESC
         LIMIT 3) x), '[]'::jsonb),

    'weakest', coalesce((
      SELECT jsonb_agg(x) FROM (
        SELECT concept, subject
          FROM public.concept_mastery
         WHERE user_id = p_user AND evidence_count >= 2
         ORDER BY confidence ASC
         LIMIT 3) x), '[]'::jsonb)
  );
$fn$;

-- ── The hourly trigger ───────────────────────────────────────────────────────

/**
 * Ask the edge function to run a sweep.
 *
 * The endpoint and the service-role key come from Supabase Vault, never from
 * this file: a migration is committed to a public repository, and a service-role
 * key in one is a full database compromise. Missing secrets make this a no-op
 * with a notice, because an hourly job that raises is an hourly page.
 */
CREATE OR REPLACE FUNCTION public.run_lifecycle_email_sweep()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_url text;
  v_key text;
BEGIN
  IF to_regnamespace('vault') IS NULL OR to_regnamespace('net') IS NULL THEN
    RAISE NOTICE 'lifecycle email sweep skipped: Vault or pg_net is unavailable.';
    RETURN;
  END IF;

  -- Dynamic so this function can be created on a database where the vault
  -- schema does not exist yet, instead of failing the whole migration.
  EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1'
     INTO v_url USING 'lifecycle_email_endpoint';
  EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1'
     INTO v_key USING 'lifecycle_email_service_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'lifecycle email sweep skipped: set the lifecycle_email_endpoint and lifecycle_email_service_key Vault secrets.';
    RETURN;
  END IF;

  EXECUTE
    'SELECT net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := $4)'
    USING v_url,
          '{}'::jsonb,
          jsonb_build_object('Content-Type', 'application/json',
                             'Authorization', 'Bearer ' || v_key),
          55000;
END;
$fn$;

-- ── Scheduling ───────────────────────────────────────────────────────────────

DO $do$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_net could not be enabled automatically (%). Enable it under Database -> Extensions.', SQLERRM;
END
$do$;

DO $do$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron could not be enabled automatically (%). Enable it under Database -> Extensions.', SQLERRM;
END
$do$;

DO $do$
BEGIN
  IF to_regnamespace('cron') IS NULL THEN
    RAISE NOTICE 'pg_cron is not installed, so the sweep is not scheduled. After enabling it run: SELECT cron.schedule(''lifecycle-email-sweep'', ''7 * * * *'', ''SELECT public.run_lifecycle_email_sweep()'');';
    RETURN;
  END IF;

  -- Re-running this migration must not stack duplicate jobs, which would double
  -- every sweep's load (the idempotency key would still stop double sends).
  EXECUTE $q$ SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'lifecycle-email-sweep' $q$;

  -- Hourly, because the send windows are per-user local hours. Offset off the
  -- top of the hour to stay out of the way of everything else that runs at :00.
  EXECUTE $q$ SELECT cron.schedule('lifecycle-email-sweep', '7 * * * *',
                                   'SELECT public.run_lifecycle_email_sweep()') $q$;
END
$do$;

-- ── Grants ───────────────────────────────────────────────────────────────────
-- These read every user's rows, so they are service-role only. Revoking from
-- PUBLIC is what removes them from `anon` and `authenticated`; the explicit
-- grant is what puts them back for the edge functions.

REVOKE ALL ON FUNCTION public.get_lifecycle_email_candidates(timestamptz, integer, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_lifecycle_email_candidates(timestamptz, integer, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_weekly_report_data(uuid, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.get_weekly_report_data(uuid, timestamptz) TO service_role;

-- Nobody calls this over the API; pg_cron runs it as its own owner.
REVOKE ALL ON FUNCTION public.run_lifecycle_email_sweep() FROM public;

-- Pre-existing bug, fixed here because this feature depends on it: the email
-- platform revoked these from PUBLIC without granting them back to service_role,
-- so send-lifecycle-email's preference check has been failing silently — and a
-- failed preference lookup meant mail with no unsubscribe link and no respect
-- for a user's opt-out. Nothing has shipped yet, so no mail went out wrong.
GRANT EXECUTE ON FUNCTION public.ensure_email_preferences(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_digest_data(uuid, timestamptz) TO service_role;

NOTIFY pgrst, 'reload schema';
