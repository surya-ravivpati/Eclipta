-- Teach-Back Rotation for Study Rooms.
-- At each work→break transition, one rotating member is asked to explain a
-- concept in their own words. A predictable group ritual, not a pop quiz:
-- no countdown, no AI fallback, no scoring — purely social active recall.
--
-- Concept is chosen from STRUCTURED SOURCES ONLY, in priority order:
--   (1) most recent resolved Stuck card from the block that just ended,
--   (2) interval recap snippet  — see note in tb_open_round (currently inert),
--   (3) the room goal pin text,
-- else the round is skipped cleanly (never guesses from freeform chat).
--
-- The whole feature runs server-side here: clients race to call tb_open_round
-- on the clock flip and the server gates so exactly one round is created per
-- transition (UNIQUE(room_id, trigger_key)). No edge function / no AI is needed
-- for the core ritual to work.
--
-- Idempotent. Depends on the study-rooms + clock + goal-pin + luna-stuck
-- migrations having run first.

-- ── Room-level + per-member state ──────────────────────────────────────────
ALTER TABLE public.study_rooms
  ADD COLUMN IF NOT EXISTS teach_back_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tb_queue           uuid[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tb_position        integer NOT NULL DEFAULT 0;

ALTER TABLE public.study_room_members
  ADD COLUMN IF NOT EXISTS tb_skip_used boolean NOT NULL DEFAULT false;

-- ── Per-round record (the structured "teach-back outcome" Recap consumes) ───
CREATE TABLE IF NOT EXISTS public.teach_back_rounds (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id        uuid NOT NULL REFERENCES public.study_rooms(id) ON DELETE CASCADE,
  trigger_key    text NOT NULL,            -- gates one round per transition
  explainer_id   uuid,
  explainer_name text,
  concept_text   text,
  concept_source text,                     -- 'stuck' | 'recap' | 'goal'
  status         text NOT NULL DEFAULT 'pending',  -- claiming|pending|answered|expired|skipped
  up_count       integer NOT NULL DEFAULT 0,
  kinda_count    integer NOT NULL DEFAULT 0,
  lost_count     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  answered_at    timestamptz,
  ended_at       timestamptz,
  UNIQUE (room_id, trigger_key)
);
CREATE INDEX IF NOT EXISTS idx_tb_round_room ON public.teach_back_rounds(room_id, created_at);
ALTER TABLE public.teach_back_rounds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "view teach-back" ON public.teach_back_rounds;
CREATE POLICY "view teach-back" ON public.teach_back_rounds FOR SELECT TO authenticated
  USING (public.is_study_member(room_id));

-- ── One-tap reactions (informational only; never a per-user metric) ─────────
CREATE TABLE IF NOT EXISTS public.teach_back_reactions (
  round_id   uuid NOT NULL REFERENCES public.teach_back_rounds(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL,
  reaction   text NOT NULL,                -- 'up' | 'kinda' | 'lost'
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (round_id, user_id)
);
ALTER TABLE public.teach_back_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "view tb reactions" ON public.teach_back_reactions;
CREATE POLICY "view tb reactions" ON public.teach_back_reactions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.teach_back_rounds r
                 WHERE r.id = round_id AND public.is_study_member(r.room_id)));

-- ── Toggle (any member). Rebuilds the rotation + resets skips = new session ─
CREATE OR REPLACE FUNCTION public.set_teach_back(p_room uuid, p_on boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_q uuid[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_study_member(p_room) THEN RAISE EXCEPTION 'Not a room member'; END IF;
  IF p_on THEN
    SELECT array_agg(user_id ORDER BY joined_at) INTO v_q
      FROM public.study_room_members WHERE room_id = p_room;
    UPDATE public.study_rooms
       SET teach_back_enabled = true, tb_queue = coalesce(v_q, '{}'), tb_position = 0
     WHERE id = p_room;
    UPDATE public.study_room_members SET tb_skip_used = false WHERE room_id = p_room;
    INSERT INTO public.study_room_messages(room_id, user_id, author_name, body, kind)
      VALUES (p_room, v_uid, 'System',
              'Teach-back turned on — one person explains a concept at each break.', 'system');
  ELSE
    UPDATE public.study_rooms SET teach_back_enabled = false WHERE id = p_room;
    UPDATE public.teach_back_rounds SET status = 'expired', ended_at = now()
      WHERE room_id = p_room AND status IN ('claiming','pending','answered');
    INSERT INTO public.study_room_messages(room_id, user_id, author_name, body, kind)
      VALUES (p_room, v_uid, 'System', 'Teach-back turned off.', 'system');
  END IF;
END; $$;

-- ── Open a round on the work→break flip. Race-free: every client may call it,
--    the server gates on (room_id, trigger_key) so exactly one round is born. ─
CREATE OR REPLACE FUNCTION public.tb_open_round(p_room uuid, p_trigger_key text)
RETURNS TABLE(result text, round_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_enabled boolean; v_work integer; v_goal text; v_queue uuid[]; v_pos integer;
  v_members uuid[]; v_count integer; v_round uuid;
  v_i integer; v_len integer; v_idx integer; v_cand uuid; v_explainer uuid := NULL; v_nextpos integer;
  v_name text; v_concept text := NULL; v_source text;
  v_win_end timestamptz; v_win_start timestamptz; v_snote text; v_sname text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_study_member(p_room) THEN RAISE EXCEPTION 'Not a room member'; END IF;

  SELECT teach_back_enabled, work_minutes, goal_text, tb_queue, tb_position
    INTO v_enabled, v_work, v_goal, v_queue, v_pos
    FROM public.study_rooms WHERE id = p_room FOR UPDATE;

  IF NOT coalesce(v_enabled, false) THEN RETURN QUERY SELECT 'disabled'::text, NULL::uuid; RETURN; END IF;

  SELECT array_agg(user_id ORDER BY joined_at) INTO v_members
    FROM public.study_room_members WHERE room_id = p_room;
  v_count := coalesce(array_length(v_members, 1), 0);
  IF v_count < 2 THEN RETURN QUERY SELECT 'too-few'::text, NULL::uuid; RETURN; END IF;

  -- The previous interval's still-open round expires now (unanswered, no penalty).
  UPDATE public.teach_back_rounds SET status = 'expired', ended_at = now()
    WHERE room_id = p_room AND status IN ('pending','answered') AND trigger_key <> p_trigger_key;
  -- Clear any abandoned claim stubs (e.g. a client that crashed mid-open).
  DELETE FROM public.teach_back_rounds
    WHERE room_id = p_room AND status = 'claiming' AND created_at < now() - interval '2 minutes';

  -- Gate the transition: first writer wins this trigger_key, the rest bail.
  INSERT INTO public.teach_back_rounds(room_id, trigger_key, status)
    VALUES (p_room, p_trigger_key, 'claiming')
    ON CONFLICT (room_id, trigger_key) DO NOTHING
    RETURNING id INTO v_round;
  IF v_round IS NULL THEN RETURN QUERY SELECT 'lost'::text, NULL::uuid; RETURN; END IF;

  -- Normalise the queue: append mid-session joiners to the BACK, keep order.
  IF v_queue IS NULL THEN v_queue := '{}'; END IF;
  FOREACH v_cand IN ARRAY v_members LOOP
    IF NOT (v_cand = ANY(v_queue)) THEN v_queue := v_queue || v_cand; END IF;
  END LOOP;
  v_len := coalesce(array_length(v_queue, 1), 0);
  IF v_pos IS NULL OR v_pos >= v_len THEN v_pos := 0; END IF;

  -- Next person up = first queue member (from position) still in the room.
  FOR v_i IN 0..v_len - 1 LOOP
    v_idx  := (v_pos + v_i) % v_len;
    v_cand := v_queue[v_idx + 1];                 -- arrays are 1-based
    IF v_cand = ANY(v_members) THEN
      v_explainer := v_cand; v_nextpos := (v_idx + 1) % v_len; EXIT;
    END IF;
  END LOOP;

  IF v_explainer IS NULL THEN
    DELETE FROM public.teach_back_rounds WHERE id = v_round;
    UPDATE public.study_rooms SET tb_queue = v_queue WHERE id = p_room;
    RETURN QUERY SELECT 'no-one'::text, NULL::uuid; RETURN;
  END IF;

  SELECT display_name INTO v_name FROM public.study_room_members
    WHERE room_id = p_room AND user_id = v_explainer;

  -- ── Concept selection — STRUCTURED SOURCES ONLY, in priority order ──
  v_win_end   := p_trigger_key::timestamptz;
  v_win_start := v_win_end - make_interval(mins => coalesce(v_work, 25));

  -- (1) Most recent resolved Stuck card from the block that just ended.
  SELECT note, author_name INTO v_snote, v_sname
    FROM public.stuck_requests
    WHERE room_id = p_room AND status = 'resolved'
      AND created_at >= v_win_start AND created_at <= v_win_end + interval '90 seconds'
    ORDER BY coalesce(resolved_at, created_at) DESC
    LIMIT 1;
  IF FOUND THEN
    v_concept := coalesce(nullif(btrim(v_snote), ''),
                          'what ' || coalesce(v_sname, 'someone') || ' was stuck on earlier');
    v_source  := 'stuck';
  END IF;

  -- (2) Interval recap snippet (concept_source = 'recap'): intentionally NOT
  --     produced here. The reusable summarizer (generateRecap / luna-room
  --     'recap') only has structured events to draw from, and the only event
  --     type that currently exists is the resolved Stuck card — already taken
  --     by source (1). A recap snippet can only out-rank (1) once a non-Stuck
  --     structured event exists (e.g. break check-ins). Until then this slot
  --     would summarize an empty set, so we skip to (3) rather than fabricate
  --     events. When a new event type lands, call the existing generator here.

  -- (3) The room goal pin — most generic fallback.
  IF v_concept IS NULL AND nullif(btrim(coalesce(v_goal, '')), '') IS NOT NULL THEN
    v_concept := btrim(v_goal); v_source := 'goal';
  END IF;

  -- No structured source → skip the round cleanly. Keep this person's turn
  -- (position NOT advanced) and drop a single quiet system line.
  IF v_concept IS NULL THEN
    DELETE FROM public.teach_back_rounds WHERE id = v_round;
    UPDATE public.study_rooms SET tb_queue = v_queue WHERE id = p_room;
    INSERT INTO public.study_room_messages(room_id, user_id, author_name, body, kind)
      VALUES (p_room, v_uid, 'System', 'Nothing to teach back yet this round.', 'system');
    RETURN QUERY SELECT 'no-concept'::text, NULL::uuid; RETURN;
  END IF;

  -- Finalise the round and advance the rotation (turn consumed).
  UPDATE public.teach_back_rounds
     SET explainer_id = v_explainer, explainer_name = coalesce(v_name, 'A member'),
         concept_text = left(v_concept, 280), concept_source = v_source,
         status = 'pending', created_at = now()
   WHERE id = v_round;
  UPDATE public.study_rooms SET tb_queue = v_queue, tb_position = v_nextpos WHERE id = p_room;

  RETURN QUERY SELECT 'created'::text, v_round;
END; $$;

-- ── One-tap reaction. Informational tally only; one reaction per member,
--    changeable. First reaction flips the round pending → answered. ──────────
CREATE OR REPLACE FUNCTION public.react_teach_back(p_round uuid, p_reaction text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_room uuid; v_r text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_r := lower(btrim(p_reaction));
  IF v_r NOT IN ('up','kinda','lost') THEN RAISE EXCEPTION 'bad reaction'; END IF;
  SELECT room_id INTO v_room FROM public.teach_back_rounds WHERE id = p_round;
  IF v_room IS NULL OR NOT public.is_study_member(v_room) THEN RAISE EXCEPTION 'Not a room member'; END IF;

  INSERT INTO public.teach_back_reactions(round_id, user_id, reaction)
    VALUES (p_round, v_uid, v_r)
    ON CONFLICT (round_id, user_id) DO UPDATE SET reaction = excluded.reaction, created_at = now();

  UPDATE public.teach_back_rounds t SET
    up_count    = (SELECT count(*) FROM public.teach_back_reactions x WHERE x.round_id = p_round AND x.reaction = 'up'),
    kinda_count = (SELECT count(*) FROM public.teach_back_reactions x WHERE x.round_id = p_round AND x.reaction = 'kinda'),
    lost_count  = (SELECT count(*) FROM public.teach_back_reactions x WHERE x.round_id = p_round AND x.reaction = 'lost'),
    status      = CASE WHEN t.status = 'pending' THEN 'answered' ELSE t.status END,
    answered_at = coalesce(t.answered_at, now())
  WHERE t.id = p_round;
END; $$;

-- Internal: pass the SAME concept on to the next eligible member.
CREATE OR REPLACE FUNCTION public.tb_handoff(p_room uuid, p_from uuid, p_suffix text,
                                             p_concept text, p_source text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_members uuid[]; v_queue uuid[]; v_pos integer; v_len integer;
  v_i integer; v_idx integer; v_cand uuid; v_next uuid := NULL; v_nextpos integer; v_nm text; v_new uuid;
BEGIN
  SELECT array_agg(user_id ORDER BY joined_at) INTO v_members FROM public.study_room_members WHERE room_id = p_room;
  IF coalesce(array_length(v_members, 1), 0) < 2 THEN RETURN NULL; END IF;
  SELECT tb_queue, tb_position INTO v_queue, v_pos FROM public.study_rooms WHERE id = p_room FOR UPDATE;
  v_len := coalesce(array_length(v_queue, 1), 0);
  IF v_len = 0 THEN RETURN NULL; END IF;
  IF v_pos IS NULL OR v_pos >= v_len THEN v_pos := 0; END IF;
  FOR v_i IN 0..v_len - 1 LOOP
    v_idx := (v_pos + v_i) % v_len; v_cand := v_queue[v_idx + 1];
    IF v_cand = ANY(v_members) THEN v_next := v_cand; v_nextpos := (v_idx + 1) % v_len; EXIT; END IF;
  END LOOP;
  IF v_next IS NULL THEN RETURN NULL; END IF;
  SELECT display_name INTO v_nm FROM public.study_room_members WHERE room_id = p_room AND user_id = v_next;
  INSERT INTO public.teach_back_rounds(room_id, trigger_key, explainer_id, explainer_name,
                                       concept_text, concept_source, status, created_at)
    VALUES (p_room, p_from::text || p_suffix, v_next, coalesce(v_nm, 'A member'),
            p_concept, p_source, 'pending', now())
    ON CONFLICT (room_id, trigger_key) DO NOTHING
    RETURNING id INTO v_new;
  UPDATE public.study_rooms SET tb_position = v_nextpos WHERE id = p_room;
  RETURN v_new;
END; $$;

-- ── Skip: one free pass per member per session, then disabled. Hands the same
--    concept straight to the next person. ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.skip_teach_back(p_round uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_room uuid; v_explainer uuid; v_status text; v_concept text; v_source text; v_name text; v_used boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT room_id, explainer_id, status, concept_text, concept_source
    INTO v_room, v_explainer, v_status, v_concept, v_source
    FROM public.teach_back_rounds WHERE id = p_round FOR UPDATE;
  IF v_room IS NULL OR NOT public.is_study_member(v_room) THEN RAISE EXCEPTION 'Not a room member'; END IF;
  IF v_explainer <> v_uid THEN RAISE EXCEPTION 'Not your turn'; END IF;
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'Round already closed'; END IF;
  SELECT tb_skip_used INTO v_used FROM public.study_room_members WHERE room_id = v_room AND user_id = v_uid;
  IF coalesce(v_used, false) THEN RAISE EXCEPTION 'You have already used your skip this session'; END IF;

  UPDATE public.study_room_members SET tb_skip_used = true WHERE room_id = v_room AND user_id = v_uid;
  SELECT display_name INTO v_name FROM public.study_room_members WHERE room_id = v_room AND user_id = v_uid;
  UPDATE public.teach_back_rounds SET status = 'skipped', ended_at = now() WHERE id = p_round;
  INSERT INTO public.study_room_messages(room_id, user_id, author_name, body, kind)
    VALUES (v_room, v_uid, 'System', coalesce(v_name, 'A member') || ' passed their teach-back turn.', 'system');

  RETURN public.tb_handoff(v_room, p_round, ':skip', v_concept, v_source);
END; $$;

-- ── Leaver mid-turn: automatic pass to the next person (NOT a charged skip).
--    Safe for several clients to call — status guard + ON CONFLICT collapse. ─
CREATE OR REPLACE FUNCTION public.pass_teach_back(p_round uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_room uuid; v_explainer uuid; v_status text; v_concept text; v_source text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT room_id, explainer_id, status, concept_text, concept_source
    INTO v_room, v_explainer, v_status, v_concept, v_source
    FROM public.teach_back_rounds WHERE id = p_round FOR UPDATE;
  IF v_room IS NULL OR NOT public.is_study_member(v_room) THEN RETURN false; END IF;
  IF v_status <> 'pending' THEN RETURN false; END IF;
  -- Only act once the explainer has genuinely left the room.
  IF EXISTS (SELECT 1 FROM public.study_room_members WHERE room_id = v_room AND user_id = v_explainer) THEN
    RETURN false;
  END IF;
  UPDATE public.teach_back_rounds SET status = 'expired', ended_at = now() WHERE id = p_round AND status = 'pending';
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM public.tb_handoff(v_room, p_round, ':pass', v_concept, v_source);
  RETURN true;
END; $$;

GRANT EXECUTE ON FUNCTION public.set_teach_back(uuid, boolean)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.tb_open_round(uuid, text)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.react_teach_back(uuid, text)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.skip_teach_back(uuid)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.pass_teach_back(uuid)                    TO authenticated;
-- tb_handoff is internal (called only by the SECURITY DEFINER functions above).
REVOKE ALL ON FUNCTION public.tb_handoff(uuid, uuid, text, text, text) FROM public;

-- ── Re-expose get_study_rooms with the teach-back columns ───────────────────
DROP FUNCTION IF EXISTS public.get_study_rooms();
CREATE OR REPLACE FUNCTION public.get_study_rooms()
RETURNS TABLE(
  id uuid, name text, topic text, is_public boolean, owner_id uuid,
  created_at timestamptz, member_count bigint, am_member boolean, join_code text,
  work_minutes integer, break_minutes integer, phase text,
  phase_started_at timestamptz, last_activity_at timestamptz,
  goal_text text, resource_links jsonb,
  teach_back_enabled boolean, tb_queue uuid[], tb_position integer
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
    r.goal_text, COALESCE(r.resource_links, '[]'::jsonb),
    r.teach_back_enabled, COALESCE(r.tb_queue, '{}'), r.tb_position
  FROM public.study_rooms r
  WHERE r.is_public
     OR r.owner_id = auth.uid()
     OR EXISTS(SELECT 1 FROM public.study_room_members m
               WHERE m.room_id = r.id AND m.user_id = auth.uid())
  ORDER BY member_count DESC, r.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_study_rooms() TO authenticated;

-- ── Realtime: round changes (incl. denormalised tallies) stream to clients ──
ALTER TABLE public.teach_back_rounds REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.teach_back_rounds; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

NOTIFY pgrst, 'reload schema';
