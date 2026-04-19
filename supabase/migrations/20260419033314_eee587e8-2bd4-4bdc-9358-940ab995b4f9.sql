-- 1) Roles enum + table + has_role helper
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

DROP POLICY IF EXISTS "Anyone can view roles" ON public.user_roles;
CREATE POLICY "Anyone can view roles" ON public.user_roles
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2) Forum reports
CREATE TABLE IF NOT EXISTS public.forum_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('thread','answer','comment')),
  target_id UUID NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed','dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

ALTER TABLE public.forum_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth users create reports" ON public.forum_reports;
CREATE POLICY "Auth users create reports" ON public.forum_reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Reporters or mods view reports" ON public.forum_reports;
CREATE POLICY "Reporters or mods view reports" ON public.forum_reports
  FOR SELECT USING (
    auth.uid() = reporter_id
    OR public.has_role(auth.uid(), 'moderator')
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Mods update reports" ON public.forum_reports;
CREATE POLICY "Mods update reports" ON public.forum_reports
  FOR UPDATE USING (
    public.has_role(auth.uid(), 'moderator')
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Mods delete reports" ON public.forum_reports;
CREATE POLICY "Mods delete reports" ON public.forum_reports
  FOR DELETE USING (
    public.has_role(auth.uid(), 'moderator')
    OR public.has_role(auth.uid(), 'admin')
  );

-- Allow mods/admins to delete forum content
DROP POLICY IF EXISTS "Mods delete any thread" ON public.forum_threads;
CREATE POLICY "Mods delete any thread" ON public.forum_threads
  FOR DELETE USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'moderator')
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Mods delete any answer" ON public.forum_answers;
CREATE POLICY "Mods delete any answer" ON public.forum_answers
  FOR DELETE USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'moderator')
    OR public.has_role(auth.uid(), 'admin')
  );

-- 3) Forum comments (replies to answers)
CREATE TABLE IF NOT EXISTS public.forum_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_id UUID NOT NULL REFERENCES public.forum_answers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forum_comments_answer ON public.forum_comments(answer_id);

ALTER TABLE public.forum_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone view comments" ON public.forum_comments;
CREATE POLICY "Anyone view comments" ON public.forum_comments
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Auth users create comments" ON public.forum_comments;
CREATE POLICY "Auth users create comments" ON public.forum_comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authors update comments" ON public.forum_comments;
CREATE POLICY "Authors update comments" ON public.forum_comments
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authors or mods delete comments" ON public.forum_comments;
CREATE POLICY "Authors or mods delete comments" ON public.forum_comments
  FOR DELETE USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'moderator')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE TRIGGER trg_forum_comments_updated
  BEFORE UPDATE ON public.forum_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Avatar column on user_profiles
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 5) Public avatars storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage policies: public read, owner-only write inside their own folder (folder name = uid)
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
CREATE POLICY "Avatar images are publicly accessible" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users upload own avatar" ON storage.objects;
CREATE POLICY "Users upload own avatar" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users update own avatar" ON storage.objects;
CREATE POLICY "Users update own avatar" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users delete own avatar" ON storage.objects;
CREATE POLICY "Users delete own avatar" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );