-- Luna in Study Rooms — the "Stuck" public escalation. Ask is ephemeral
-- (client-only) and Recap reads structured events, so neither needs a table.
-- stuck_requests is the room-shared, realtime structured record that Recap reads.
-- Idempotent. Assumes the study-rooms migrations ran first.

CREATE TABLE IF NOT EXISTS public.stuck_requests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id            uuid NOT NULL REFERENCES public.study_rooms(id) ON DELETE CASCADE,
  user_id            uuid NOT NULL,           -- the asker
  author_name        text,
  note               text,                    -- optional "what I'm stuck on"
  status             text NOT NULL DEFAULT 'open',   -- open | resolving | resolved
  resolved_by        text,                    -- null | 'ai' | '<user uuid>'
  resolver_name      text,
  resolution_summary text,
  ai_due_at          timestamptz NOT NULL,    -- when the AI fallback fires
  created_at         timestamptz NOT NULL DEFAULT now(),
  resolved_at        timestamptz
);
CREATE INDEX IF NOT EXISTS idx_stuck_room ON public.stuck_requests(room_id, created_at);
ALTER TABLE public.stuck_requests ENABLE ROW LEVEL SECURITY;

-- Members of the room can see its stuck cards.
DROP POLICY IF EXISTS "view stuck" ON public.stuck_requests;
CREATE POLICY "view stuck" ON public.stuck_requests FOR SELECT TO authenticated
  USING (public.is_study_member(room_id));

-- Post a Stuck card (any member). 60s human-first window before AI fallback.
CREATE OR REPLACE FUNCTION public.create_stuck_request(p_room uuid, p_note text)
RETURNS public.stuck_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_name text; v_row public.stuck_requests;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_study_member(p_room) THEN RAISE EXCEPTION 'Not a room member'; END IF;
  SELECT display_name INTO v_name FROM public.study_room_members WHERE room_id = p_room AND user_id = v_uid;
  INSERT INTO public.stuck_requests(room_id, user_id, author_name, note, ai_due_at)
  VALUES (p_room, v_uid, v_name, nullif(btrim(left(coalesce(p_note,''), 200)), ''), now() + interval '60 seconds')
  RETURNING * INTO v_row;
  RETURN v_row;
END; $$;

-- A human picks it up — first action wins, cancels the AI fallback.
CREATE OR REPLACE FUNCTION public.resolve_stuck_human(p_stuck uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_name text; v_room uuid; v_ok boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT room_id INTO v_room FROM public.stuck_requests WHERE id = p_stuck;
  IF v_room IS NULL OR NOT public.is_study_member(v_room) THEN RAISE EXCEPTION 'Not a room member'; END IF;
  SELECT display_name INTO v_name FROM public.study_room_members WHERE room_id = v_room AND user_id = v_uid;
  UPDATE public.stuck_requests
     SET status = 'resolved', resolved_by = v_uid::text, resolver_name = coalesce(v_name, 'A member'),
         resolution_summary = coalesce(v_name, 'A member') || ' is helping with this.', resolved_at = now()
   WHERE id = p_stuck AND status = 'open';
  GET DIAGNOSTICS v_ok = ROW_COUNT;
  RETURN v_ok > 0;
END; $$;

GRANT EXECUTE ON FUNCTION public.create_stuck_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_stuck_human(uuid)        TO authenticated;

ALTER TABLE public.stuck_requests REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.stuck_requests; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

NOTIFY pgrst, 'reload schema';
