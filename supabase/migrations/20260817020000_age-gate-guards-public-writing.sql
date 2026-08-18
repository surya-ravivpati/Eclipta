-- Actually use the predicate the age gate defined.
--
-- 20260817010000 added `can_post_publicly()` and described it as "the predicate
-- every public-writing policy should share" - and then no policy used it. That
-- is the same shape as the thing it was written to fix: machinery that looks
-- like protection and is not. This wires it in.
--
-- ── What this changes ───────────────────────────────────────────────────────
-- Four write policies gain the age check. Reading is untouched: someone who
-- cannot yet post can still browse, and taking that away would punish an
-- existing account for a column it never had the chance to fill in.
--
-- ── Who this stops, and why that is the point ───────────────────────────────
-- `meets_minimum_age` is false for an account with no birth date, which is
-- every account created before the gate. That is deliberate - treating unknown
-- as adult would exempt the entire existing user base forever - but it does
-- mean existing users must complete the birth-date step before posting again.
-- The onboarding gate already routes them there, since `onboarded_at` and the
-- birth date are set in the same step.
--
-- If that trade is wrong for a live user base, the honest lever is to backfill
-- consciously, not to soften the predicate: `is_age_verified` exists precisely
-- so "we have never asked" can be told apart from "they answered and are too
-- young".

-- Forum threads -------------------------------------------------------------
DROP POLICY IF EXISTS "Auth users create threads" ON public.forum_threads;
CREATE POLICY "Auth users create threads" ON public.forum_threads
  FOR INSERT WITH CHECK (auth.uid() = user_id AND public.can_post_publicly());

-- Forum answers -------------------------------------------------------------
DROP POLICY IF EXISTS "Auth users create answers" ON public.forum_answers;
CREATE POLICY "Auth users create answers" ON public.forum_answers
  FOR INSERT WITH CHECK (auth.uid() = user_id AND public.can_post_publicly());

-- Forum comments ------------------------------------------------------------
DROP POLICY IF EXISTS "Auth users create comments" ON public.forum_comments;
CREATE POLICY "Auth users create comments" ON public.forum_comments
  FOR INSERT WITH CHECK (auth.uid() = user_id AND public.can_post_publicly());

-- Study-room chat -----------------------------------------------------------
-- Room membership is still required; the age check is additional, not instead.
DROP POLICY IF EXISTS "post messages" ON public.study_room_messages;
CREATE POLICY "post messages" ON public.study_room_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_study_member(room_id)
    AND public.can_post_publicly()
  );

-- The system-message policy is deliberately left alone: those rows are written
-- on a member's behalf by server-side routines, carry no user text, and gating
-- them on the author's age would break room bookkeeping for everyone in it.

NOTIFY pgrst, 'reload schema';
