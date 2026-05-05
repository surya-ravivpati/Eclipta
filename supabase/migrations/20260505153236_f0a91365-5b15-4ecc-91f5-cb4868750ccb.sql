CREATE TABLE public.user_chest_claims (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  node_id integer NOT NULL,
  chest_label text NOT NULL,
  bonus_xp integer NOT NULL DEFAULT 0,
  claimed_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, node_id)
);

ALTER TABLE public.user_chest_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own chest claims"
ON public.user_chest_claims FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own chest claims"
ON public.user_chest_claims FOR INSERT
WITH CHECK (auth.uid() = user_id);