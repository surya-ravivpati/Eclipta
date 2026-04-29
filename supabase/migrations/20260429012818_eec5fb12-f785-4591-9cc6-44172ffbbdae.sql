-- Add review metadata to proposals
ALTER TABLE public.course_proposals
  ADD COLUMN IF NOT EXISTS denial_reason text,
  ADD COLUMN IF NOT EXISTS ai_score integer,
  ADD COLUMN IF NOT EXISTS ai_feedback text,
  ADD COLUMN IF NOT EXISTS course_id uuid;

-- Allow 'approved' / 'denied' / 'submitted' / 'reviewing'
-- (status is a free text column so no enum change needed)

-- =================================================================
-- user_courses: approved courses owned by a user
-- =================================================================
CREATE TABLE IF NOT EXISTS public.user_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  proposal_id uuid REFERENCES public.course_proposals(id) ON DELETE SET NULL,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  summary text,
  level text NOT NULL DEFAULT 'beginner',
  structure text NOT NULL DEFAULT 'linear',
  depth text NOT NULL DEFAULT 'standard',
  cover_image_url text,
  status text NOT NULL DEFAULT 'draft',  -- draft | published
  enrolled_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view published courses"
  ON public.user_courses FOR SELECT
  USING (status = 'published' OR auth.uid() = user_id);

CREATE POLICY "Creators insert own course"
  ON public.user_courses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Creators update own course"
  ON public.user_courses FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Creators delete own course"
  ON public.user_courses FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_courses_user ON public.user_courses(user_id);
CREATE INDEX IF NOT EXISTS idx_user_courses_status ON public.user_courses(status);

CREATE TRIGGER trg_user_courses_updated_at
  BEFORE UPDATE ON public.user_courses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =================================================================
-- course_modules: ordered modules per course
-- =================================================================
CREATE TABLE IF NOT EXISTS public.course_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.user_courses(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Untitled module',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.course_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View modules of viewable courses"
  ON public.course_modules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_courses c
      WHERE c.id = course_modules.course_id
        AND (c.status = 'published' OR c.user_id = auth.uid())
    )
  );

CREATE POLICY "Creators insert modules"
  ON public.course_modules FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_courses c WHERE c.id = course_id AND c.user_id = auth.uid())
  );

CREATE POLICY "Creators update modules"
  ON public.course_modules FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.user_courses c WHERE c.id = course_id AND c.user_id = auth.uid())
  );

CREATE POLICY "Creators delete modules"
  ON public.course_modules FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.user_courses c WHERE c.id = course_id AND c.user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_course_modules_course ON public.course_modules(course_id, position);

CREATE TRIGGER trg_course_modules_updated_at
  BEFORE UPDATE ON public.course_modules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =================================================================
-- course_blocks: rich content blocks per module
-- type: 'text' | 'youtube' | 'image' | 'quiz'
-- data: { text? | youtubeId? | imageUrl?, caption? | question?, options?, correctIndex? }
-- =================================================================
CREATE TABLE IF NOT EXISTS public.course_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.course_modules(id) ON DELETE CASCADE,
  type text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.course_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View blocks of viewable modules"
  ON public.course_blocks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.course_modules m
      JOIN public.user_courses c ON c.id = m.course_id
      WHERE m.id = course_blocks.module_id
        AND (c.status = 'published' OR c.user_id = auth.uid())
    )
  );

CREATE POLICY "Creators insert blocks"
  ON public.course_blocks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.course_modules m
      JOIN public.user_courses c ON c.id = m.course_id
      WHERE m.id = module_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Creators update blocks"
  ON public.course_blocks FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.course_modules m
      JOIN public.user_courses c ON c.id = m.course_id
      WHERE m.id = module_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Creators delete blocks"
  ON public.course_blocks FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.course_modules m
      JOIN public.user_courses c ON c.id = m.course_id
      WHERE m.id = module_id AND c.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_course_blocks_module ON public.course_blocks(module_id, position);

CREATE TRIGGER trg_course_blocks_updated_at
  BEFORE UPDATE ON public.course_blocks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =================================================================
-- Storage bucket for course images
-- =================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('course-images', 'course-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read course images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'course-images');

CREATE POLICY "Auth users upload course images to own folder"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'course-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Auth users update own course images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'course-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Auth users delete own course images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'course-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );