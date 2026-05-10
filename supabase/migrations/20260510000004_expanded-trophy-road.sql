
-- Expanded Trophy Road: support for new chest types added in nodes 26-45.
-- All existing chest labels (nodes 1-25) are preserved unchanged.

CREATE OR REPLACE FUNCTION public.claim_chest(p_node_id integer, p_chest_label text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_bonus integer; v_new integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_bonus := CASE p_chest_label
    -- Band 1: Training Grounds (original chests, unchanged)
    WHEN 'Bronze Chest'    THEN 50
    WHEN 'Silver Chest'    THEN 100
    WHEN 'Gold Chest'      THEN 200
    WHEN 'Diamond Chest'   THEN 350
    WHEN 'Platinum Chest'  THEN 500
    WHEN 'Champion Chest'  THEN 750
    WHEN 'Unreal Chest'    THEN 1000
    -- Band 3: Competitive Ascension
    WHEN 'God Cache'       THEN 1500
    WHEN 'God Vault'       THEN 2000
    WHEN 'Champion Cache'  THEN 900
    WHEN 'Champion Vault'  THEN 1100
    -- Band 4: Elite Mastery Path
    WHEN 'Unreal Cache'    THEN 1400
    WHEN 'Unreal Vault'    THEN 1800
    -- Band 5: Apex Prestige
    WHEN 'Apex Cache'      THEN 2500
    WHEN 'Apex Vault'      THEN 3500
    ELSE 0 END;
  IF v_bonus = 0 THEN RAISE EXCEPTION 'Unknown chest'; END IF;
  INSERT INTO public.user_chest_claims(user_id, node_id, chest_label, bonus_xp)
    VALUES (v_uid, p_node_id, p_chest_label, v_bonus);
  INSERT INTO public.xp_award_log(user_id, event, amount) VALUES (v_uid, 'chest:'||p_chest_label, v_bonus);
  UPDATE public.user_profiles SET xp = xp + v_bonus WHERE user_id = v_uid RETURNING xp INTO v_new;
  RETURN v_bonus;
END $$;

GRANT EXECUTE ON FUNCTION public.claim_chest(integer, text) TO authenticated;
