-- Owned Ecliptars table: tracks which monsters a user has claimed from the trophy road
CREATE TABLE public.user_ecliptars (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  archetype TEXT NOT NULL,
  ecliptar_slug TEXT NOT NULL,
  ecliptar_name TEXT NOT NULL,
  node_id INTEGER NOT NULL,
  claimed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, ecliptar_slug)
);

ALTER TABLE public.user_ecliptars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own ecliptars"
  ON public.user_ecliptars FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can claim their own ecliptars"
  ON public.user_ecliptars FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_user_ecliptars_user_archetype ON public.user_ecliptars(user_id, archetype);