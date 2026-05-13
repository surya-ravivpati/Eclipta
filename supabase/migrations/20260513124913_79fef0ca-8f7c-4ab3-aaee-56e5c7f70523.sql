
-- 1. Search users RPC
CREATE OR REPLACE FUNCTION public.search_users(p_query text, p_limit integer DEFAULT 10)
RETURNS TABLE(user_id uuid, username text, xp integer, equipped_ecliptar text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT user_id, username, xp, equipped_ecliptar, avatar_url
    FROM public.user_profiles
   WHERE username IS NOT NULL
     AND length(coalesce(p_query,'')) >= 2
     AND username ILIKE (p_query || '%')
   ORDER BY xp DESC
   LIMIT LEAST(coalesce(p_limit, 10), 20);
$$;
GRANT EXECUTE ON FUNCTION public.search_users(text, integer) TO anon, authenticated;

-- 2. Direct challenges table
CREATE TABLE IF NOT EXISTS public.pvp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_id uuid NOT NULL,
  challenged_id uuid NOT NULL,
  challenger_archetype text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  battle_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  CHECK (challenger_id <> challenged_id),
  CHECK (status IN ('pending','accepted','rejected','expired','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_pvp_challenges_challenged ON public.pvp_challenges(challenged_id, status);
CREATE INDEX IF NOT EXISTS idx_pvp_challenges_challenger ON public.pvp_challenges(challenger_id, status);

ALTER TABLE public.pvp_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants view challenges" ON public.pvp_challenges
  FOR SELECT USING (auth.uid() = challenger_id OR auth.uid() = challenged_id);

CREATE POLICY "Challenger creates challenges" ON public.pvp_challenges
  FOR INSERT WITH CHECK (auth.uid() = challenger_id);

CREATE POLICY "Participants update challenges" ON public.pvp_challenges
  FOR UPDATE USING (auth.uid() = challenger_id OR auth.uid() = challenged_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.pvp_challenges;
ALTER TABLE public.pvp_challenges REPLICA IDENTITY FULL;

-- 3. Create challenge RPC
CREATE OR REPLACE FUNCTION public.create_pvp_challenge(p_challenged_id uuid, p_archetype text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_my_username text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_uid = p_challenged_id THEN RAISE EXCEPTION 'Cannot challenge yourself'; END IF;

  -- Cancel any prior pending challenge from me to this user
  UPDATE public.pvp_challenges
     SET status = 'cancelled'
   WHERE challenger_id = v_uid AND challenged_id = p_challenged_id AND status = 'pending';

  INSERT INTO public.pvp_challenges(challenger_id, challenged_id, challenger_archetype)
       VALUES (v_uid, p_challenged_id, p_archetype)
    RETURNING id INTO v_id;

  SELECT username INTO v_my_username FROM public.user_profiles WHERE user_id = v_uid;

  INSERT INTO public.notifications(user_id, actor_id, type, link, meta)
  VALUES (
    p_challenged_id, v_uid, 'challenge', '/battles?challenge=' || v_id::text,
    jsonb_build_object('challenger_username', v_my_username, 'archetype', p_archetype, 'challenge_id', v_id)
  );

  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_pvp_challenge(uuid, text) TO authenticated;

-- 4. Respond to a challenge
CREATE OR REPLACE FUNCTION public.respond_pvp_challenge(p_challenge_id uuid, p_accept boolean, p_archetype text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ch record;
  v_battle_id uuid;
  v_my_username text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_ch FROM public.pvp_challenges WHERE id = p_challenge_id FOR UPDATE;
  IF v_ch.id IS NULL THEN RAISE EXCEPTION 'Challenge not found'; END IF;
  IF v_ch.challenged_id <> v_uid THEN RAISE EXCEPTION 'Not your challenge to respond to'; END IF;
  IF v_ch.status <> 'pending' THEN RAISE EXCEPTION 'Challenge no longer pending'; END IF;
  IF v_ch.expires_at < now() THEN
    UPDATE public.pvp_challenges SET status = 'expired' WHERE id = p_challenge_id;
    RAISE EXCEPTION 'Challenge expired';
  END IF;

  SELECT username INTO v_my_username FROM public.user_profiles WHERE user_id = v_uid;

  IF p_accept THEN
    v_battle_id := gen_random_uuid();
    INSERT INTO public.pvp_battles(id, challenger_id, opponent_id, challenger_archetype, opponent_archetype, status)
      VALUES (v_battle_id, v_ch.challenger_id, v_uid, v_ch.challenger_archetype, COALESCE(p_archetype, v_ch.challenger_archetype), 'active');
    UPDATE public.pvp_challenges SET status = 'accepted', battle_id = v_battle_id WHERE id = p_challenge_id;

    INSERT INTO public.notifications(user_id, actor_id, type, link, meta)
    VALUES (v_ch.challenger_id, v_uid, 'challenge_accepted', '/battles?battle=' || v_battle_id::text,
      jsonb_build_object('opponent_username', v_my_username, 'battle_id', v_battle_id, 'opponent_archetype', COALESCE(p_archetype, v_ch.challenger_archetype)));

    RETURN jsonb_build_object('accepted', true, 'battle_id', v_battle_id, 'challenger_archetype', v_ch.challenger_archetype, 'opponent_archetype', COALESCE(p_archetype, v_ch.challenger_archetype), 'challenger_id', v_ch.challenger_id);
  ELSE
    UPDATE public.pvp_challenges SET status = 'rejected' WHERE id = p_challenge_id;
    INSERT INTO public.notifications(user_id, actor_id, type, link, meta)
    VALUES (v_ch.challenger_id, v_uid, 'challenge_rejected', NULL,
      jsonb_build_object('opponent_username', v_my_username));
    RETURN jsonb_build_object('accepted', false);
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.respond_pvp_challenge(uuid, boolean, text) TO authenticated;
