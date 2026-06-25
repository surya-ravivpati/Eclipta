
-- ── Schema additions ──────────────────────────────────────────────────────
ALTER TABLE public.study_rooms
  ADD COLUMN IF NOT EXISTS work_minutes        integer     NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS break_minutes       integer     NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS phase               text        NOT NULL DEFAULT 'work',
  ADD COLUMN IF NOT EXISTS phase_started_at    timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_activity_at    timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_idle_nudge_at  timestamptz;

DO $$ BEGIN
  ALTER TABLE public.study_rooms
    ADD CONSTRAINT study_rooms_phase_chk CHECK (phase IN ('work','break'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.study_room_messages
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'chat';

DO $$ BEGIN
  ALTER TABLE public.study_room_messages
    ADD CONSTRAINT study_room_messages_kind_chk CHECK (kind IN ('chat','system'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Activity trigger: any chat message resets the idle clock ───────────────
CREATE OR REPLACE FUNCTION public.touch_room_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.kind = 'chat' THEN
    UPDATE public.study_rooms SET last_activity_at = now() WHERE id = NEW.room_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_touch_room_activity ON public.study_room_messages;
CREATE TRIGGER trg_touch_room_activity
  AFTER INSERT ON public.study_room_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_room_activity();

-- ── Set / change the work-break pattern ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_room_pattern(
  p_room uuid, p_work integer, p_break integer
) RETURNS public.study_rooms
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_name text; v_room public.study_rooms;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_study_member(p_room) THEN RAISE EXCEPTION 'Not a room member'; END IF;
  IF p_work  IS NULL OR p_work  < 1 OR p_work  > 180 THEN RAISE EXCEPTION 'work_minutes out of range';  END IF;
  IF p_break IS NULL OR p_break < 1 OR p_break > 60  THEN RAISE EXCEPTION 'break_minutes out of range'; END IF;

  UPDATE public.study_rooms
     SET work_minutes      = p_work,
         break_minutes     = p_break,
         phase_started_at  = now(),
         last_activity_at  = now(),
         last_idle_nudge_at = NULL
   WHERE id = p_room
   RETURNING * INTO v_room;

  SELECT COALESCE(display_name, 'Someone') INTO v_name
    FROM public.study_room_members WHERE room_id = p_room AND user_id = v_uid;

  INSERT INTO public.study_room_messages(room_id, user_id, author_name, kind, body)
  VALUES (p_room, v_uid, v_name, 'system',
          v_name || ' switched to ' || p_work || '/' || p_break || '.');

  RETURN v_room;
END $$;

-- ── Idempotent phase advance ───────────────────────────────────────────────
-- Clients race to call this when the countdown hits 0; the expected-phase /
-- expected-started-at gate makes the second caller a no-op.
CREATE OR REPLACE FUNCTION public.advance_room_phase(
  p_room uuid, p_from_phase text, p_from_started_at timestamptz
) RETURNS public.study_rooms
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_room public.study_rooms; v_next text; v_next_start timestamptz; v_dur integer;
BEGIN
  IF NOT public.is_study_member(p_room) THEN RAISE EXCEPTION 'Not a room member'; END IF;
  SELECT * INTO v_room FROM public.study_rooms WHERE id = p_room FOR UPDATE;
  IF v_room.id IS NULL THEN RAISE EXCEPTION 'Room not found'; END IF;

  -- Stale request — another client already advanced.
  IF v_room.phase <> p_from_phase
     OR abs(extract(epoch FROM (v_room.phase_started_at - p_from_started_at))) > 1 THEN
    RETURN v_room;
  END IF;

  v_next := CASE WHEN v_room.phase = 'work' THEN 'break' ELSE 'work' END;
  v_dur  := CASE WHEN v_room.phase = 'work'
                 THEN v_room.work_minutes ELSE v_room.break_minutes END;
  -- Anchor next phase to the boundary, not now(), to avoid drift across clients.
  v_next_start := v_room.phase_started_at + make_interval(mins => v_dur);

  UPDATE public.study_rooms
     SET phase = v_next,
         phase_started_at = v_next_start,
         last_idle_nudge_at = NULL
   WHERE id = p_room
   RETURNING * INTO v_room;

  RETURN v_room;
END $$;

-- ── Idle nudge ─────────────────────────────────────────────────────────────
-- Members call this from the client; the server gates "only during work" and
-- "only once per idle stretch" so we never spam.
CREATE OR REPLACE FUNCTION public.post_idle_nudge(p_room uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_room public.study_rooms;
BEGIN
  IF NOT public.is_study_member(p_room) THEN RAISE EXCEPTION 'Not a room member'; END IF;
  SELECT * INTO v_room FROM public.study_rooms WHERE id = p_room FOR UPDATE;
  IF v_room.phase <> 'work' THEN RETURN false; END IF;
  IF now() - v_room.last_activity_at < interval '10 minutes' THEN RETURN false; END IF;
  IF v_room.last_idle_nudge_at IS NOT NULL
     AND v_room.last_idle_nudge_at >= v_room.last_activity_at THEN
    RETURN false;
  END IF;

  UPDATE public.study_rooms SET last_idle_nudge_at = now() WHERE id = p_room;
  INSERT INTO public.study_room_messages(room_id, user_id, author_name, kind, body)
  VALUES (p_room, '00000000-0000-0000-0000-000000000000'::uuid, NULL, 'system',
          'It''s been quiet for a bit — still working?');
  RETURN true;
END $$;

-- Allow the system-message insert above (the user_id is the zero uuid, so the
-- normal "post messages" policy that requires user_id = auth.uid() doesn't
-- cover it). The function is SECURITY DEFINER, but RLS still applies to its
-- INSERTs unless we add a policy.
DROP POLICY IF EXISTS "system messages" ON public.study_room_messages;
CREATE POLICY "system messages" ON public.study_room_messages FOR INSERT TO authenticated
  WITH CHECK (kind = 'system' AND public.is_study_member(room_id));

-- ── Lobby feed: now returns clock state too ────────────────────────────────
DROP FUNCTION IF EXISTS public.get_study_rooms();
CREATE OR REPLACE FUNCTION public.get_study_rooms()
RETURNS TABLE(
  id uuid, name text, topic text, is_public boolean, owner_id uuid,
  created_at timestamptz, member_count bigint, am_member boolean, join_code text,
  work_minutes integer, break_minutes integer, phase text,
  phase_started_at timestamptz, last_activity_at timestamptz
) LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT r.id, r.name, r.topic, r.is_public, r.owner_id, r.created_at,
    (SELECT count(*) FROM public.study_room_members m WHERE m.room_id = r.id) AS member_count,
    EXISTS(SELECT 1 FROM public.study_room_members m
           WHERE m.room_id = r.id AND m.user_id = auth.uid()) AS am_member,
    CASE WHEN r.owner_id = auth.uid()
              OR EXISTS(SELECT 1 FROM public.study_room_members m
                        WHERE m.room_id = r.id AND m.user_id = auth.uid())
         THEN r.join_code ELSE NULL END AS join_code,
    r.work_minutes, r.break_minutes, r.phase, r.phase_started_at, r.last_activity_at
  FROM public.study_rooms r
  WHERE r.is_public
     OR r.owner_id = auth.uid()
     OR EXISTS(SELECT 1 FROM public.study_room_members m
               WHERE m.room_id = r.id AND m.user_id = auth.uid())
  ORDER BY member_count DESC, r.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.set_room_pattern(uuid,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_room_phase(uuid,text,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_idle_nudge(uuid)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_study_rooms()                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.touch_room_activity()                    TO authenticated;

-- ── Realtime on the room row itself ────────────────────────────────────────
ALTER TABLE public.study_rooms REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.study_rooms;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
