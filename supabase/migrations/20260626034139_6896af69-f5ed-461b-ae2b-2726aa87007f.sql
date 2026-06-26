
ALTER TABLE public.study_rooms
  ADD COLUMN IF NOT EXISTS goal_text text,
  ADD COLUMN IF NOT EXISTS resource_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS teach_back_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tb_queue uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS tb_position integer NOT NULL DEFAULT 0;

ALTER TABLE public.study_room_members
  ADD COLUMN IF NOT EXISTS tb_skip_used boolean NOT NULL DEFAULT false;

DROP FUNCTION IF EXISTS public.get_study_rooms();

CREATE OR REPLACE FUNCTION public.get_study_rooms()
RETURNS TABLE(
  id uuid, name text, topic text, is_public boolean, join_code text,
  owner_id uuid, created_at timestamptz, member_count bigint, is_member boolean,
  work_minutes integer, break_minutes integer, phase text,
  phase_started_at timestamptz, last_activity_at timestamptz, last_idle_nudge_at timestamptz,
  goal_text text, resource_links jsonb,
  teach_back_enabled boolean, tb_queue uuid[], tb_position integer
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    r.id, r.name, r.topic, r.is_public,
    CASE WHEN r.owner_id = auth.uid() THEN r.join_code ELSE NULL END,
    r.owner_id, r.created_at,
    (SELECT count(*) FROM public.study_room_members m WHERE m.room_id = r.id),
    EXISTS(SELECT 1 FROM public.study_room_members m WHERE m.room_id = r.id AND m.user_id = auth.uid()),
    r.work_minutes, r.break_minutes, r.phase, r.phase_started_at, r.last_activity_at, r.last_idle_nudge_at,
    r.goal_text, r.resource_links,
    r.teach_back_enabled, r.tb_queue, r.tb_position
  FROM public.study_rooms r
  WHERE r.is_public OR r.owner_id = auth.uid()
     OR EXISTS(SELECT 1 FROM public.study_room_members m WHERE m.room_id = r.id AND m.user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.set_room_goal(p_room uuid, p_goal text)
RETURNS public.study_rooms LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_room public.study_rooms; v_clean text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_study_member(p_room) THEN RAISE EXCEPTION 'Not a room member'; END IF;
  v_clean := NULLIF(left(regexp_replace(COALESCE(p_goal,''), E'[\r\n]+', ' ', 'g'), 200), '');
  UPDATE public.study_rooms SET goal_text = v_clean, last_activity_at = now()
   WHERE id = p_room RETURNING * INTO v_room;
  RETURN v_room;
END $$;

CREATE OR REPLACE FUNCTION public.set_room_links(p_room uuid, p_links jsonb)
RETURNS public.study_rooms LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_room public.study_rooms; v_clean jsonb := '[]'::jsonb;
  v_item jsonb; v_url text; v_label text; v_count int := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_study_member(p_room) THEN RAISE EXCEPTION 'Not a room member'; END IF;
  IF p_links IS NULL OR jsonb_typeof(p_links) <> 'array' THEN
    RAISE EXCEPTION 'links must be a JSON array'; END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_links) LOOP
    v_count := v_count + 1;
    IF v_count > 3 THEN RAISE EXCEPTION 'Maximum 3 links'; END IF;
    v_url := trim(COALESCE(v_item->>'url',''));
    IF v_url !~* '^https?://' THEN RAISE EXCEPTION 'Each link must be a valid http(s) URL'; END IF;
    v_label := NULLIF(left(trim(COALESCE(v_item->>'label','')), 60), '');
    v_clean := v_clean || jsonb_build_array(jsonb_build_object('url', left(v_url, 500), 'label', v_label));
  END LOOP;
  UPDATE public.study_rooms SET resource_links = v_clean, last_activity_at = now()
   WHERE id = p_room RETURNING * INTO v_room;
  RETURN v_room;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_study_rooms() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_room_goal(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_room_links(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_study_rooms() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_room_goal(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_room_links(uuid, jsonb) TO authenticated;
