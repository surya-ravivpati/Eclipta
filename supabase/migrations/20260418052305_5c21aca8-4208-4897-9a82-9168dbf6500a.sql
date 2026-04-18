-- ============ THREADS ============
CREATE TABLE public.forum_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  author_name text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  course text NOT NULL DEFAULT 'General',
  tags text[] NOT NULL DEFAULT '{}',
  solved boolean NOT NULL DEFAULT false,
  votes integer NOT NULL DEFAULT 0,
  answer_count integer NOT NULL DEFAULT 0,
  view_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_forum_threads_course ON public.forum_threads(course);
CREATE INDEX idx_forum_threads_created_at ON public.forum_threads(created_at DESC);
CREATE INDEX idx_forum_threads_votes ON public.forum_threads(votes DESC);
CREATE INDEX idx_forum_threads_user_id ON public.forum_threads(user_id);

ALTER TABLE public.forum_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view threads" ON public.forum_threads
  FOR SELECT USING (true);
CREATE POLICY "Auth users create threads" ON public.forum_threads
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own threads" ON public.forum_threads
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own threads" ON public.forum_threads
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_forum_threads_updated_at
  BEFORE UPDATE ON public.forum_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ ANSWERS ============
CREATE TABLE public.forum_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.forum_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  author_name text NOT NULL,
  body text NOT NULL,
  votes integer NOT NULL DEFAULT 0,
  accepted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_forum_answers_thread ON public.forum_answers(thread_id);
CREATE INDEX idx_forum_answers_user ON public.forum_answers(user_id);

ALTER TABLE public.forum_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view answers" ON public.forum_answers
  FOR SELECT USING (true);
CREATE POLICY "Auth users create answers" ON public.forum_answers
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own answers" ON public.forum_answers
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own answers" ON public.forum_answers
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_forum_answers_updated_at
  BEFORE UPDATE ON public.forum_answers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Maintain answer_count on threads
CREATE OR REPLACE FUNCTION public.forum_answers_count_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.forum_threads SET answer_count = answer_count + 1 WHERE id = NEW.thread_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.forum_threads SET answer_count = GREATEST(answer_count - 1, 0) WHERE id = OLD.thread_id;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER forum_answers_count
  AFTER INSERT OR DELETE ON public.forum_answers
  FOR EACH ROW EXECUTE FUNCTION public.forum_answers_count_trigger();

-- Mark thread solved when an answer is accepted; only thread author may accept
CREATE OR REPLACE FUNCTION public.forum_answers_accepted_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_thread_owner uuid;
BEGIN
  IF NEW.accepted IS DISTINCT FROM OLD.accepted AND NEW.accepted = true THEN
    SELECT user_id INTO v_thread_owner FROM public.forum_threads WHERE id = NEW.thread_id;
    IF v_thread_owner IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Only the thread author can accept an answer';
    END IF;
    UPDATE public.forum_threads SET solved = true WHERE id = NEW.thread_id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER forum_answers_accepted
  BEFORE UPDATE ON public.forum_answers
  FOR EACH ROW EXECUTE FUNCTION public.forum_answers_accepted_guard();

-- ============ VOTES ============
CREATE TABLE public.forum_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('thread', 'answer')),
  target_id uuid NOT NULL,
  value smallint NOT NULL CHECK (value IN (-1, 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, target_type, target_id)
);

CREATE INDEX idx_forum_votes_target ON public.forum_votes(target_type, target_id);

ALTER TABLE public.forum_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view votes" ON public.forum_votes
  FOR SELECT USING (true);
CREATE POLICY "Auth users insert own votes" ON public.forum_votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own votes" ON public.forum_votes
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own votes" ON public.forum_votes
  FOR DELETE USING (auth.uid() = user_id);

-- Recompute vote totals on the targeted thread/answer
CREATE OR REPLACE FUNCTION public.forum_votes_recount()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_target_type text;
  v_target_id uuid;
  v_total integer;
BEGIN
  v_target_type := COALESCE(NEW.target_type, OLD.target_type);
  v_target_id := COALESCE(NEW.target_id, OLD.target_id);

  SELECT COALESCE(SUM(value), 0) INTO v_total
  FROM public.forum_votes
  WHERE target_type = v_target_type AND target_id = v_target_id;

  IF v_target_type = 'thread' THEN
    UPDATE public.forum_threads SET votes = v_total WHERE id = v_target_id;
  ELSIF v_target_type = 'answer' THEN
    UPDATE public.forum_answers SET votes = v_total WHERE id = v_target_id;
  END IF;

  RETURN NULL;
END $$;

CREATE TRIGGER forum_votes_recount_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.forum_votes
  FOR EACH ROW EXECUTE FUNCTION public.forum_votes_recount();

-- ============ VIEWS (unique per user) ============
CREATE TABLE public.forum_thread_views (
  thread_id uuid NOT NULL REFERENCES public.forum_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);

ALTER TABLE public.forum_thread_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own views" ON public.forum_thread_views
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Anyone read view rows" ON public.forum_thread_views
  FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.forum_thread_view_inc()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.forum_threads SET view_count = view_count + 1 WHERE id = NEW.thread_id;
  RETURN NEW;
END $$;

CREATE TRIGGER forum_thread_view_inc_trg
  AFTER INSERT ON public.forum_thread_views
  FOR EACH ROW EXECUTE FUNCTION public.forum_thread_view_inc();

-- ============ Aggregate stats RPC ============
CREATE OR REPLACE FUNCTION public.get_forum_stats()
RETURNS TABLE(threads bigint, answers bigint, contributors bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT count(*) FROM public.forum_threads),
    (SELECT count(*) FROM public.forum_answers),
    (SELECT count(DISTINCT u) FROM (
      SELECT user_id AS u FROM public.forum_threads
      UNION
      SELECT user_id FROM public.forum_answers
    ) s);
$$;