CREATE POLICY "Users can insert own ecliptars" ON public.user_ecliptars
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);