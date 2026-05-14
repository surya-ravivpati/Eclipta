-- Replace the permissive realtime SELECT policy with a topic-scoped one.
DROP POLICY IF EXISTS "Authenticated only realtime select" ON realtime.messages;

CREATE POLICY "Realtime topic-scoped select"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- Postgres-changes subscriptions: underlying table RLS enforces per-row access.
  realtime.topic() NOT LIKE 'pvp-battle:%'
  OR EXISTS (
    SELECT 1 FROM public.pvp_battles b
    WHERE b.id::text = split_part(realtime.topic(), ':', 2)
      AND (b.challenger_id = auth.uid() OR b.opponent_id = auth.uid())
  )
);