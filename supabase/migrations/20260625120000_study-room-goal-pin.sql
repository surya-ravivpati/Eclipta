-- Goal/Resource Pin for Study Rooms — minimal shared room state at the top of
-- the room: one goal line + up to 3 resource links. Room-level, edited by any
-- member, synced to all via the existing study_rooms realtime channel.
-- Idempotent. Assumes the study-rooms + clock migrations ran first.

ALTER TABLE public.study_rooms
  ADD COLUMN IF NOT EXISTS goal_text      text,
  ADD COLUMN IF NOT EXISTS resource_links jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Set the single goal line (any member). Newlines collapsed to spaces; capped.
CREATE OR REPLACE FUNCTION public.set_room_goal(p_room uuid, p_goal text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_goal text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_study_member(p_room) THEN RAISE EXCEPTION 'Not a room member'; END IF;
  v_goal := nullif(btrim(left(regexp_replace(coalesce(p_goal, ''), '[\r\n]+', ' ', 'g'), 200)), '');
  UPDATE public.study_rooms SET goal_text = v_goal WHERE id = p_room;
END; $$;

-- Replace the room's resource links (any member). Validates: array, <= 3 items,
-- each { url: text(http/https), label?: text }. The whole list is sent at once
-- (add/remove are computed client-side) — last write wins.
CREATE OR REPLACE FUNCTION public.set_room_links(p_room uuid, p_links jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_out jsonb := '[]'::jsonb;
  v_item jsonb; v_url text; v_label text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_study_member(p_room) THEN RAISE EXCEPTION 'Not a room member'; END IF;
  IF p_links IS NULL OR jsonb_typeof(p_links) <> 'array' THEN RAISE EXCEPTION 'links must be an array'; END IF;
  IF jsonb_array_length(p_links) > 3 THEN RAISE EXCEPTION 'A room can pin at most 3 links'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_links) LOOP
    v_url := btrim(coalesce(v_item->>'url', ''));
    IF v_url !~* '^https?://[^\s.]+\.[^\s]+' THEN RAISE EXCEPTION 'Invalid link URL: %', v_url; END IF;
    v_label := nullif(btrim(left(coalesce(v_item->>'label', ''), 60)), '');
    v_out := v_out || jsonb_build_object('url', left(v_url, 500), 'label', v_label);
  END LOOP;

  UPDATE public.study_rooms SET resource_links = v_out WHERE id = p_room;
END; $$;

-- Re-expose get_study_rooms with the pin columns.
DROP FUNCTION IF EXISTS public.get_study_rooms();
CREATE OR REPLACE FUNCTION public.get_study_rooms()
RETURNS TABLE(
  id uuid, name text, topic text, is_public boolean, owner_id uuid,
  created_at timestamptz, member_count bigint, am_member boolean, join_code text,
  work_minutes integer, break_minutes integer, phase text,
  phase_started_at timestamptz, last_activity_at timestamptz,
  goal_text text, resource_links jsonb
) LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT r.id, r.name, r.topic, r.is_public, r.owner_id, r.created_at,
    (SELECT count(*) FROM public.study_room_members m WHERE m.room_id = r.id) AS member_count,
    EXISTS(SELECT 1 FROM public.study_room_members m
           WHERE m.room_id = r.id AND m.user_id = auth.uid()) AS am_member,
    CASE WHEN r.owner_id = auth.uid()
              OR EXISTS(SELECT 1 FROM public.study_room_members m
                        WHERE m.room_id = r.id AND m.user_id = auth.uid())
         THEN r.join_code ELSE NULL END AS join_code,
    r.work_minutes, r.break_minutes, r.phase, r.phase_started_at, r.last_activity_at,
    r.goal_text, COALESCE(r.resource_links, '[]'::jsonb)
  FROM public.study_rooms r
  WHERE r.is_public
     OR r.owner_id = auth.uid()
     OR EXISTS(SELECT 1 FROM public.study_room_members m
               WHERE m.room_id = r.id AND m.user_id = auth.uid())
  ORDER BY member_count DESC, r.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.set_room_goal(uuid, text)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_room_links(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_study_rooms()           TO authenticated;

NOTIFY pgrst, 'reload schema';
