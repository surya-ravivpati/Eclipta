DROP TRIGGER IF EXISTS forum_threads_cleanup ON public.forum_threads;
DROP TRIGGER IF EXISTS forum_answers_cleanup ON public.forum_answers;
DROP TRIGGER IF EXISTS forum_comments_cleanup ON public.forum_comments;

CREATE TRIGGER forum_threads_cleanup
  AFTER DELETE ON public.forum_threads
  FOR EACH ROW EXECUTE FUNCTION public.forum_cleanup_thread_refs();

CREATE TRIGGER forum_answers_cleanup
  AFTER DELETE ON public.forum_answers
  FOR EACH ROW EXECUTE FUNCTION public.forum_cleanup_answer_refs();

CREATE TRIGGER forum_comments_cleanup
  AFTER DELETE ON public.forum_comments
  FOR EACH ROW EXECUTE FUNCTION public.forum_cleanup_comment_refs();