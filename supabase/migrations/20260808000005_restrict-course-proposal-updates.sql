DROP POLICY IF EXISTS "Users update own proposals" ON public.course_proposals;

CREATE POLICY "Users update own proposals"
ON public.course_proposals
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND status IN ('submitted', 'reviewing')
);
