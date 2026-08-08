CREATE TABLE public.trophy_road_chests (
  node_id integer PRIMARY KEY,
  reward_key text NOT NULL UNIQUE,
  required_xp integer NOT NULL CHECK (required_xp >= 0),
  bonus_xp integer NOT NULL CHECK (bonus_xp > 0)
);

INSERT INTO public.trophy_road_chests (node_id, reward_key, required_xp, bonus_xp)
VALUES
  (3, 'Bronze Chest', 900, 75),
  (5, 'Bronze Cache', 3000, 150),
  (10, 'Silver Chest', 10500, 200),
  (12, 'Silver Cache', 14500, 350),
  (17, 'Gold Chest', 24000, 450),
  (19, 'Gold Cache', 30000, 600),
  (24, 'Diamond Chest', 49500, 800),
  (26, 'Diamond Cache', 59000, 1000),
  (31, 'Platinum Chest', 90000, 1200),
  (33, 'Platinum Cache', 107000, 1500),
  (38, 'Champion Chest', 170000, 1800),
  (40, 'Champion Cache', 202000, 2200),
  (45, 'Unreal Chest', 308000, 2600),
  (47, 'Unreal Cache', 365000, 3000),
  (53, 'God Cache', 580000, 4000),
  (56, 'God Vault', 728000, 5500);

ALTER TABLE public.trophy_road_chests ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.claim_chest(p_node_id integer, p_chest_label text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_chest public.trophy_road_chests%ROWTYPE;
  v_current_xp integer;
  v_new_xp integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_chest
  FROM public.trophy_road_chests
  WHERE node_id = p_node_id;

  IF NOT FOUND OR v_chest.reward_key <> p_chest_label THEN
    RAISE EXCEPTION 'Unknown chest';
  END IF;

  SELECT xp INTO v_current_xp
  FROM public.user_profiles
  WHERE user_id = v_uid;

  IF COALESCE(v_current_xp, 0) < v_chest.required_xp THEN
    RAISE EXCEPTION 'Chest is not unlocked';
  END IF;

  INSERT INTO public.user_chest_claims(user_id, node_id, chest_label, bonus_xp)
  VALUES (v_uid, p_node_id, v_chest.reward_key, v_chest.bonus_xp);

  INSERT INTO public.xp_award_log(user_id, event, amount)
  VALUES (v_uid, 'chest:' || v_chest.reward_key, v_chest.bonus_xp);

  UPDATE public.user_profiles
  SET xp = xp + v_chest.bonus_xp
  WHERE user_id = v_uid
  RETURNING xp INTO v_new_xp;

  RETURN v_chest.bonus_xp;
END;
$$;

REVOKE ALL ON TABLE public.trophy_road_chests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_chest(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_chest(integer, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
