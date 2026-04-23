-- Add ON DELETE CASCADE to forum_answers.thread_id (drop existing FK if present, recreate)
ALTER TABLE public.forum_answers DROP CONSTRAINT IF EXISTS forum_answers_thread_id_fkey;
ALTER TABLE public.forum_answers
  ADD CONSTRAINT forum_answers_thread_id_fkey
  FOREIGN KEY (thread_id) REFERENCES public.forum_threads(id) ON DELETE CASCADE;

-- forum_comments.answer_id cascade
ALTER TABLE public.forum_comments DROP CONSTRAINT IF EXISTS forum_comments_answer_id_fkey;
ALTER TABLE public.forum_comments
  ADD CONSTRAINT forum_comments_answer_id_fkey
  FOREIGN KEY (answer_id) REFERENCES public.forum_answers(id) ON DELETE CASCADE;

-- forum_thread_views.thread_id cascade
ALTER TABLE public.forum_thread_views DROP CONSTRAINT IF EXISTS forum_thread_views_thread_id_fkey;
ALTER TABLE public.forum_thread_views
  ADD CONSTRAINT forum_thread_views_thread_id_fkey
  FOREIGN KEY (thread_id) REFERENCES public.forum_threads(id) ON DELETE CASCADE;

-- Trigger to clean up forum_votes and forum_reports when thread/answer/comment is deleted
CREATE OR REPLACE FUNCTION public.forum_cleanup_thread_refs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.forum_votes WHERE target_type = 'thread' AND target_id = OLD.id;
  DELETE FROM public.forum_reports WHERE target_type = 'thread' AND target_id = OLD.id;
  RETURN OLD;
END $$;

CREATE OR REPLACE FUNCTION public.forum_cleanup_answer_refs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.forum_votes WHERE target_type = 'answer' AND target_id = OLD.id;
  DELETE FROM public.forum_reports WHERE target_type = 'answer' AND target_id = OLD.id;
  RETURN OLD;
END $$;

CREATE OR REPLACE FUNCTION public.forum_cleanup_comment_refs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.forum_reports WHERE target_type = 'comment' AND target_id = OLD.id;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS forum_threads_cleanup ON public.forum_threads;
CREATE TRIGGER forum_threads_cleanup
  BEFORE DELETE ON public.forum_threads
  FOR EACH ROW EXECUTE FUNCTION public.forum_cleanup_thread_refs();

DROP TRIGGER IF EXISTS forum_answers_cleanup ON public.forum_answers;
CREATE TRIGGER forum_answers_cleanup
  BEFORE DELETE ON public.forum_answers
  FOR EACH ROW EXECUTE FUNCTION public.forum_cleanup_answer_refs();

DROP TRIGGER IF EXISTS forum_comments_cleanup ON public.forum_comments;
CREATE TRIGGER forum_comments_cleanup
  BEFORE DELETE ON public.forum_comments
  FOR EACH ROW EXECUTE FUNCTION public.forum_cleanup_comment_refs();