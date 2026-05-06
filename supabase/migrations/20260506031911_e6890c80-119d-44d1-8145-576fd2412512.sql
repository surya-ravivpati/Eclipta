-- Allow public read of user_ecliptars so other users' profile pages can show owned ecliptars.
CREATE POLICY "Anyone can view ecliptars"
ON public.user_ecliptars
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Users can view their own ecliptars" ON public.user_ecliptars;