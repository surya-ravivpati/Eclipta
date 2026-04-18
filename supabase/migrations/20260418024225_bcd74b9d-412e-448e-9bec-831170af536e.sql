
-- 1. course_proposals
CREATE TABLE public.course_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  topic text NOT NULL,
  description text,
  level text NOT NULL,
  structure text NOT NULL,
  depth text NOT NULL,
  weekly_hours integer NOT NULL DEFAULT 5,
  prerequisites text,
  creator_reasoning text NOT NULL,
  status text NOT NULL DEFAULT 'submitted',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.course_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own proposals" ON public.course_proposals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own proposals" ON public.course_proposals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own proposals" ON public.course_proposals FOR UPDATE USING (auth.uid() = user_id);
CREATE TRIGGER course_proposals_set_updated_at
  BEFORE UPDATE ON public.course_proposals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. enrollments
CREATE TABLE public.enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  course_slug text NOT NULL,
  course_title text NOT NULL,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_slug)
);
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own enrollments" ON public.enrollments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own enrollments" ON public.enrollments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own enrollments" ON public.enrollments FOR DELETE USING (auth.uid() = user_id);

-- 3. daily_challenge_progress
CREATE TABLE public.daily_challenge_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  challenge_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  wins integer NOT NULL DEFAULT 0,
  bonus_claimed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, challenge_date)
);
ALTER TABLE public.daily_challenge_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own challenge" ON public.daily_challenge_progress FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own challenge" ON public.daily_challenge_progress FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own challenge" ON public.daily_challenge_progress FOR UPDATE USING (auth.uid() = user_id);
CREATE TRIGGER daily_challenge_set_updated_at
  BEFORE UPDATE ON public.daily_challenge_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. platform_stats public view (aggregates only, no PII)
CREATE OR REPLACE VIEW public.platform_stats
WITH (security_invoker = off) AS
  SELECT
    (SELECT count(*) FROM public.user_profiles) AS learners,
    (SELECT count(*) FROM public.learning_history WHERE session_type = 'battle') AS battles,
    (SELECT count(*) FROM public.user_ecliptars) AS ecliptars;

GRANT SELECT ON public.platform_stats TO anon, authenticated;
