ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS onboarded_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS age integer,
  ADD COLUMN IF NOT EXISTS learning_goal text,
  ADD COLUMN IF NOT EXISTS weekly_hours integer;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_username_unique UNIQUE (username);