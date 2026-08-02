-- Lifecycle email platform.
--
-- Three tables, each solving a problem that bites the moment you send real mail:
--   email_preferences — per-category opt-out. Legally required for engagement
--                       mail (CAN-SPAM §316.5, GDPR Art. 21) and separately
--                       required by Google/Yahoo bulk-sender rules since Feb 2024.
--   email_log         — idempotency. A cron that retries, or two workers that
--                       overlap, must not send the same digest twice.
--   email_recipients  — consent-verified third parties (parent/teacher reports).
--                       Sending a learner's progress to an address nobody
--                       confirmed is a data leak, so delivery is gated on a
--                       verified double opt-in.

-- ── Categories ───────────────────────────────────────────────────────────────
-- Transactional mail (password reset, a direct reply to you) is deliberately
-- NOT a category here: it is not opt-outable, and mixing it into the same table
-- invites a bug where someone unsubscribes from being able to reset a password.

CREATE TYPE public.email_category AS ENUM (
  'daily_digest',
  'weekly_report',
  'streak_saver',
  'battle',
  'forum',
  'group',
  'ai_followup',
  'guardian_report'
);

CREATE TABLE IF NOT EXISTS public.email_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Categories the user has switched OFF. Storing opt-OUTs rather than opt-INs
  -- means a newly added category is on by default for existing users, which is
  -- what you want for a product feature — and a user who has opted out of
  -- everything is represented honestly rather than as an empty row.
  muted public.email_category[] NOT NULL DEFAULT '{}',
  -- Master switch, separate from the per-category list so "unsubscribe from
  -- everything" is one write and survives new categories being added.
  unsubscribed_all boolean NOT NULL DEFAULT false,
  -- Digest send hour in the user's own timezone. A digest that lands at 3am is
  -- worse than no digest.
  digest_hour smallint NOT NULL DEFAULT 8 CHECK (digest_hour BETWEEN 0 AND 23),
  timezone text NOT NULL DEFAULT 'UTC',
  -- Signed token for one-click unsubscribe from an email footer, where the
  -- recipient is not logged in and cannot be identified any other way.
  unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_prefs_token
  ON public.email_preferences (unsubscribe_token);

ALTER TABLE public.email_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own email preferences" ON public.email_preferences;
CREATE POLICY "own email preferences" ON public.email_preferences
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Send log / idempotency ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  category public.email_category NOT NULL,
  to_address text NOT NULL,
  subject text NOT NULL,
  -- Caller-supplied key that makes a send idempotent, e.g.
  -- "daily_digest:<user>:2026-08-01". A retry with the same key is a no-op.
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'failed', 'skipped')),
  -- Why a send was skipped (muted, unsubscribed, no address) or failed. Without
  -- this, "the email never arrived" is unanswerable.
  detail text,
  provider_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_email_log_user_recent
  ON public.email_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_category_recent
  ON public.email_log (category, created_at DESC);

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

-- Readable by the owner only; writes come from the service role in the edge
-- function, which bypasses RLS. No client-side INSERT policy on purpose —
-- nothing in the browser should be able to forge a send record.
DROP POLICY IF EXISTS "read own email log" ON public.email_log;
CREATE POLICY "read own email log" ON public.email_log
  FOR SELECT USING (auth.uid() = user_id);

-- ── Guardian / teacher recipients ────────────────────────────────────────────
-- A learner's progress is personal data. It is sent to a third party only after
-- that party confirms their own address, and only while the learner leaves the
-- link active — either side can end it.

CREATE TABLE IF NOT EXISTS public.email_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The learner whose progress is shared.
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  label text,
  relationship text NOT NULL DEFAULT 'guardian'
    CHECK (relationship IN ('guardian', 'teacher')),
  -- Double opt-in: nothing is sent until the recipient clicks the link in the
  -- invitation, which proves they control the address and consent to receive it.
  verified_at timestamptz,
  verify_token uuid NOT NULL DEFAULT gen_random_uuid(),
  -- The recipient's own unsubscribe path, independent of the learner's.
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_recipients_user_email_key UNIQUE (user_id, email)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_recipients_verify_token
  ON public.email_recipients (verify_token);

ALTER TABLE public.email_recipients ENABLE ROW LEVEL SECURITY;

-- The learner manages their own recipient list.
DROP POLICY IF EXISTS "own recipients" ON public.email_recipients;
CREATE POLICY "own recipients" ON public.email_recipients
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Helpers ──────────────────────────────────────────────────────────────────

-- Ensure a preferences row exists. Called before any send decision so the
-- absence of a row is never mistaken for "opted out".
CREATE OR REPLACE FUNCTION public.ensure_email_preferences(p_user uuid)
RETURNS public.email_preferences
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.email_preferences;
BEGIN
  INSERT INTO public.email_preferences (user_id)
  VALUES (p_user)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_row FROM public.email_preferences WHERE user_id = p_user;
  RETURN v_row;
END;
$$;

/**
 * One-click unsubscribe from an email footer.
 *
 * Token-authenticated because the recipient is not logged in — requiring a login
 * to unsubscribe is both hostile and non-compliant. Passing NULL for the
 * category unsubscribes from everything.
 */
CREATE OR REPLACE FUNCTION public.unsubscribe_by_token(
  p_token uuid,
  p_category public.email_category DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
BEGIN
  SELECT user_id INTO v_user FROM public.email_preferences WHERE unsubscribe_token = p_token;
  IF v_user IS NULL THEN RETURN false; END IF;

  IF p_category IS NULL THEN
    UPDATE public.email_preferences
       SET unsubscribed_all = true, updated_at = now()
     WHERE user_id = v_user;
  ELSE
    UPDATE public.email_preferences
       SET muted = (
             SELECT array_agg(DISTINCT c)
               FROM unnest(muted || ARRAY[p_category]) AS c
           ),
           updated_at = now()
     WHERE user_id = v_user;
  END IF;
  RETURN true;
END;
$$;

/** Verify a guardian/teacher address from the invitation link. */
CREATE OR REPLACE FUNCTION public.verify_email_recipient(p_token uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
    FROM public.email_recipients
   WHERE verify_token = p_token AND revoked_at IS NULL;
  IF v_id IS NULL THEN RETURN false; END IF;
  UPDATE public.email_recipients SET verified_at = now() WHERE id = v_id;
  RETURN true;
END;
$$;

/**
 * Everything a digest needs for one user, in one round trip.
 *
 * Assembled server-side because a digest worker iterating thousands of users
 * cannot afford six queries each — and because the numbers must be consistent
 * with one another (an XP total from one instant and a streak from another
 * produce a mail that contradicts itself).
 */
CREATE OR REPLACE FUNCTION public.get_digest_data(p_user uuid, p_since timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'xp_gained', coalesce((
      SELECT sum(amount) FROM public.xp_award_log
       WHERE user_id = p_user AND created_at >= p_since), 0),
    'xp_total', coalesce((SELECT xp FROM public.user_profiles WHERE user_id = p_user), 0),
    'daily_streak', coalesce((SELECT daily_streak FROM public.user_profiles WHERE user_id = p_user), 0),
    'best_streak', coalesce((SELECT best_streak FROM public.user_profiles WHERE user_id = p_user), 0),
    'battles', coalesce((
      SELECT jsonb_build_object(
               'played', count(*),
               'won', count(*) FILTER (WHERE won),
               'correct', coalesce(sum(correct_answers), 0),
               'questions', coalesce(sum(total_questions), 0),
               'best_streak', coalesce(max(best_streak), 0))
        FROM public.battle_sessions
       WHERE user_id = p_user AND created_at >= p_since), '{}'::jsonb),
    'lessons_completed', coalesce((
      SELECT count(*) FROM public.learning_history
       WHERE user_id = p_user AND created_at >= p_since AND session_type = 'lesson'), 0),
    -- Strongest and weakest by confidence, which is what a report should lead
    -- with: where you are winning, and where to spend the next hour.
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
        SELECT concept, subject, round(confidence::numeric, 2) AS confidence
          FROM public.concept_mastery
         WHERE user_id = p_user AND evidence_count >= 2
         ORDER BY confidence ASC
         LIMIT 3) x), '[]'::jsonb),
    -- Unread, actionable notifications become the "friend activity" and forum
    -- sections rather than being re-derived from the source tables.
    'unread_notifications', coalesce((
      SELECT count(*) FROM public.notifications
       WHERE user_id = p_user AND NOT read AND created_at >= p_since), 0),
    'notification_types', coalesce((
      SELECT jsonb_object_agg(type, n) FROM (
        SELECT type, count(*) AS n FROM public.notifications
         WHERE user_id = p_user AND NOT read AND created_at >= p_since
         GROUP BY type) y), '{}'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.get_digest_data(uuid, timestamptz) FROM public;
REVOKE ALL ON FUNCTION public.ensure_email_preferences(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.unsubscribe_by_token(uuid, public.email_category) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_email_recipient(uuid) TO anon, authenticated;
