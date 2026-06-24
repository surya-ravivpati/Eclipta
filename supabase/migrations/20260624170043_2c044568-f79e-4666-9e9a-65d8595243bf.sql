ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS last_practice_date   date,
  ADD COLUMN IF NOT EXISTS daily_streak         integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS longest_daily_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak_freezes       integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS practice_dates       date[]  NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.record_daily_practice()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid    := auth.uid();
  v_today     date    := (now() AT TIME ZONE 'utc')::date;
  v_last      date;
  v_streak    integer;
  v_longest   integer;
  v_freezes   integer;
  v_dates     date[];
  v_prev      integer;
  v_gap       integer;
  v_froze     boolean := false;
  v_milestone integer := NULL;
  v_reward    integer := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT last_practice_date,
         COALESCE(daily_streak, 0),
         COALESCE(longest_daily_streak, 0),
         COALESCE(streak_freezes, 2),
         COALESCE(practice_dates, '{}')
    INTO v_last, v_streak, v_longest, v_freezes, v_dates
    FROM public.user_profiles
   WHERE user_id = v_uid
   FOR UPDATE;

  v_prev := v_streak;

  IF v_last = v_today THEN
    RETURN jsonb_build_object(
      'daily_streak', v_streak, 'longest_daily_streak', v_longest,
      'streak_freezes', v_freezes, 'practice_dates', to_jsonb(v_dates),
      'froze', false, 'milestone', NULL, 'milestone_reward', 0, 'already', true);
  END IF;

  IF v_last IS NULL THEN
    v_streak := 1;
  ELSE
    v_gap := v_today - v_last;
    IF v_gap = 1 THEN
      v_streak := v_streak + 1;
    ELSIF v_gap = 2 AND v_freezes > 0 THEN
      v_freezes := v_freezes - 1;
      v_streak  := v_streak + 1;
      v_froze   := true;
    ELSE
      v_streak := 1;
    END IF;
  END IF;

  v_longest := GREATEST(v_longest, v_streak);

  IF v_streak % 7 = 0 THEN
    v_freezes := LEAST(5, v_freezes + 1);
  END IF;

  IF v_streak > v_prev AND v_streak IN (3, 7, 14, 30, 60, 100, 180, 365) THEN
    v_milestone := v_streak;
    v_reward := CASE v_streak
      WHEN 3   THEN 30
      WHEN 7   THEN 75
      WHEN 14  THEN 150
      WHEN 30  THEN 350
      WHEN 60  THEN 600
      WHEN 100 THEN 900
      WHEN 180 THEN 1000
      WHEN 365 THEN 1000
      ELSE 0 END;
  END IF;

  v_dates := (
    SELECT COALESCE(array_agg(d ORDER BY d), '{}')
    FROM (
      SELECT DISTINCT d FROM unnest(v_dates || v_today) AS d
      WHERE d > v_today - 90
      ORDER BY d DESC
      LIMIT 90
    ) s
  );

  UPDATE public.user_profiles SET
    last_practice_date   = v_today,
    daily_streak         = v_streak,
    longest_daily_streak = v_longest,
    streak_freezes       = v_freezes,
    practice_dates       = v_dates,
    xp                   = COALESCE(xp, 0) + v_reward
  WHERE user_id = v_uid;

  IF v_reward > 0 THEN
    BEGIN
      INSERT INTO public.xp_award_log(user_id, event, amount)
      VALUES (v_uid, 'streak_milestone_' || v_streak, v_reward);
    EXCEPTION WHEN undefined_table THEN NULL; END;
  END IF;

  RETURN jsonb_build_object(
    'daily_streak', v_streak, 'longest_daily_streak', v_longest,
    'streak_freezes', v_freezes, 'practice_dates', to_jsonb(v_dates),
    'froze', v_froze, 'milestone', v_milestone, 'milestone_reward', v_reward, 'already', false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_daily_practice() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.record_daily_practice() TO authenticated;

NOTIFY pgrst, 'reload schema';