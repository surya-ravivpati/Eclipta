ALTER TABLE public.user_profiles
  ADD COLUMN username text UNIQUE;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_username_format
  CHECK (username IS NULL OR username ~ '^[a-zA-Z0-9_]{3,20}$');

-- Allow public reads of username (and basic display fields) so authors are publicly visible
CREATE POLICY "Anyone can view public profile fields"
  ON public.user_profiles
  FOR SELECT
  USING (true);

-- Drop the old restrictive SELECT policy now that public reads are allowed
DROP POLICY IF EXISTS "Users can view their own profile" ON public.user_profiles;