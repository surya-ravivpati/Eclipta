-- Daily-practice streak — a true "did I show up today" ritual streak, distinct
-- from user_profiles.current_streak (which is a consecutive-WIN streak set by
-- battle results). Server-authoritative so clients can't fake streaks.
--
-- Mechanics (see docs/daily-practice-streak.md):
--   * streak = consecutive UTC days with >=1 practice activity
--   * a single missed day is auto-bridged by a "freeze" if one is available
--     (forgiveness without erasing the accomplishment)
--   * a freeze is earned every 7 days of streak, capped at 5
--   * gaps > 1 day with no freeze reset the streak to 1 (today still counts)

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS last_practice_date    date,
  ADD COLUMN IF NOT EXISTS daily_streak          integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS longest_daily_streak  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak_freezes        integer NOT NULL DEFAULT 2;

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
  v_prev      integer;
  v_gap       integer;
  v_froze     boolean := false;
  v_milestone integer := NULL;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT last_practice_date,
         COALESCE(daily_streak, 0),
         COALESCE(longest_daily_streak, 0),
         COALESCE(streak_freezes, 2)
    INTO v_last, v_streak, v_longest, v_freezes
    FROM public.user_profiles
   WHERE user_id = v_uid
   FOR UPDATE;

  v_prev := v_streak;

  -- Already practiced today → nothing changes (idempotent across the day).
  IF v_last = v_today THEN
    RETURN jsonb_build_object(
      'daily_streak', v_streak, 'longest_daily_streak', v_longest,
      'streak_freezes', v_freezes, 'froze', false, 'milestone', NULL, 'already', true);
  END IF;

  IF v_last IS NULL THEN
    v_streak := 1;
  ELSE
    v_gap := v_today - v_last;
    IF v_gap = 1 THEN
      v_streak := v_streak + 1;                       -- consecutive day
    ELSIF v_gap = 2 AND v_freezes > 0 THEN
      v_freezes := v_freezes - 1;                     -- bridge one missed day
      v_streak  := v_streak + 1;
      v_froze   := true;
    ELSE
      v_streak := 1;                                  -- streak broke; today restarts it
    END IF;
  END IF;

  v_longest := GREATEST(v_longest, v_streak);

  -- Earn a freeze each full week of streak (capped), so the safety net scales
  -- with commitment instead of running out.
  IF v_streak % 7 = 0 THEN
    v_freezes := LEAST(5, v_freezes + 1);
  END IF;

  IF v_streak > v_prev AND v_streak IN (3, 7, 14, 30, 60, 100, 180, 365) THEN
    v_milestone := v_streak;
  END IF;

  UPDATE public.user_profiles SET
    last_practice_date   = v_today,
    daily_streak         = v_streak,
    longest_daily_streak = v_longest,
    streak_freezes       = v_freezes
  WHERE user_id = v_uid;

  RETURN jsonb_build_object(
    'daily_streak', v_streak, 'longest_daily_streak', v_longest,
    'streak_freezes', v_freezes, 'froze', v_froze, 'milestone', v_milestone, 'already', false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_daily_practice() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_daily_practice() TO authenticated;
