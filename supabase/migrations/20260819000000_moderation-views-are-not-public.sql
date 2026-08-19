-- Stop three moderation views answering to every signed-in account.
--
-- A Postgres view runs as its owner unless it is created WITH
-- (security_invoker = on). None of these three were, so Row Level Security on
-- the tables underneath them never applied - and all three were granted SELECT
-- to `authenticated`. The only thing standing between any account and their
-- contents was a `useModerator()` check in the browser, which is a UI decision,
-- not an authorization boundary. PostgREST exposes every view directly.
--
-- AGENTS.md: "Row Level Security is the authorization boundary. Never bypass it
-- with a privileged connection unless the equivalent checks are re-implemented
-- server-side first." These bypassed it and re-implemented nothing.
--
-- What was reachable:
--
--   admin_moderation_queue  the body of every hidden and removed forum thread,
--                           answer and comment, with its author id, moderation
--                           reason, score and category. This is the worst of
--                           the three: it is precisely the content moderation
--                           took down, served to anyone with an account.
--   reporter_trust          who has filed reports, how many were upheld, and
--                           when they last reported.
--   user_violation_counts   per-account violation tallies by category.
--
-- Found while reviewing the new report queue, which reads `reporter_trust`
-- through a SECURITY DEFINER routine and is unaffected. These are older.

-- 1. The moderation queue gates itself -----------------------------------
-- Filtered inside the view rather than by revoking the grant, because the
-- admin page selects from it directly. A non-moderator now gets zero rows
-- instead of an error, which is also what an empty queue looks like - there is
-- nothing here to tell an attacker whether the table exists.
CREATE OR REPLACE VIEW public.admin_moderation_queue AS
  WITH allowed AS (
    SELECT public.has_role(auth.uid(), 'moderator') OR public.has_role(auth.uid(), 'admin') AS ok
  )
  SELECT 'thread'::text AS target_type, t.id AS target_id, t.user_id AS author_id, t.author_name,
         t.title AS title, t.body AS body,
         t.moderation_status, t.moderation_reason, t.moderation_score, t.moderation_category,
         t.report_count, t.hidden_at, t.created_at, t.updated_at
    FROM public.forum_threads t, allowed
   WHERE allowed.ok AND (t.moderation_status <> 'visible' OR t.report_count > 0)
  UNION ALL
  SELECT 'answer', a.id, a.user_id, a.author_name,
         NULL::text, a.body,
         a.moderation_status, a.moderation_reason, a.moderation_score, a.moderation_category,
         a.report_count, a.hidden_at, a.created_at, a.updated_at
    FROM public.forum_answers a, allowed
   WHERE allowed.ok AND (a.moderation_status <> 'visible' OR a.report_count > 0)
  UNION ALL
  SELECT 'comment', c.id, c.user_id, c.author_name,
         NULL::text, c.body,
         c.moderation_status, c.moderation_reason, c.moderation_score, c.moderation_category,
         c.report_count, c.hidden_at, c.created_at, c.updated_at
    FROM public.forum_comments c, allowed
   WHERE allowed.ok AND (c.moderation_status <> 'visible' OR c.report_count > 0);

GRANT SELECT ON public.admin_moderation_queue TO authenticated;

-- 2. The two nobody queries directly -------------------------------------
-- Nothing in src/ or supabase/functions/ selects from either. Both are read by
-- SECURITY DEFINER routines - `reporter_is_high_trust`, `get_report_queue` -
-- which execute as the view owner and are unaffected by this grant. So the
-- grant buys nothing and costs the exposure above.
REVOKE SELECT ON public.reporter_trust FROM authenticated;
REVOKE SELECT ON public.user_violation_counts FROM authenticated;
REVOKE SELECT ON public.reporter_trust FROM anon;
REVOKE SELECT ON public.user_violation_counts FROM anon;

NOTIFY pgrst, 'reload schema';
