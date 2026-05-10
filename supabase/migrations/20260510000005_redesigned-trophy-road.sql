
-- Trophy Road redesign: 58 nodes across 8 tiers (Bronze → God Tier III).
-- Two chests per tier (Chest + Cache), boss encounter per tier, God Cache/Vault at summit.
-- Replaces the expanded-trophy-road migration's claim_chest function.

CREATE OR REPLACE FUNCTION public.claim_chest(p_node_id integer, p_chest_label text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_bonus integer; v_new integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_bonus := CASE p_chest_label
    -- Bronze (nodes 3, 5)
    WHEN 'Bronze Chest'    THEN 75
    WHEN 'Bronze Cache'    THEN 150
    -- Silver (nodes 10, 12)
    WHEN 'Silver Chest'    THEN 200
    WHEN 'Silver Cache'    THEN 350
    -- Gold (nodes 17, 19)
    WHEN 'Gold Chest'      THEN 450
    WHEN 'Gold Cache'      THEN 600
    -- Diamond (nodes 24, 26)
    WHEN 'Diamond Chest'   THEN 800
    WHEN 'Diamond Cache'   THEN 1000
    -- Platinum (nodes 31, 33)
    WHEN 'Platinum Chest'  THEN 1200
    WHEN 'Platinum Cache'  THEN 1500
    -- Champion (nodes 38, 40)
    WHEN 'Champion Chest'  THEN 1800
    WHEN 'Champion Cache'  THEN 2200
    -- Unreal (nodes 45, 47)
    WHEN 'Unreal Chest'    THEN 2600
    WHEN 'Unreal Cache'    THEN 3000
    -- God Summit (nodes 53, 56)
    WHEN 'God Cache'       THEN 4000
    WHEN 'God Vault'       THEN 5500
    ELSE 0 END;
  IF v_bonus = 0 THEN RAISE EXCEPTION 'Unknown chest'; END IF;
  INSERT INTO public.user_chest_claims(user_id, node_id, chest_label, bonus_xp)
    VALUES (v_uid, p_node_id, p_chest_label, v_bonus);
  INSERT INTO public.xp_award_log(user_id, event, amount) VALUES (v_uid, 'chest:'||p_chest_label, v_bonus);
  UPDATE public.user_profiles SET xp = xp + v_bonus WHERE user_id = v_uid RETURNING xp INTO v_new;
  RETURN v_bonus;
END $$;

GRANT EXECUTE ON FUNCTION public.claim_chest(integer, text) TO authenticated;
