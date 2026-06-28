-- Shared concept-mastery store — the substrate the Luna, Courses, and Battle
-- redesigns all converge on (docs/luna-redesign.md §6, docs/courses-redesign.md
-- §6, docs/battle-redesign.md §17).
--
-- One per-(user, concept) mastery record with a confidence score and evidence
-- count, plus a log of individual question outcomes that feed it. Battles are
-- the first WRITER (every answered question is an observation); Practice Weak
-- Spots is the first READER (it surfaces struggling concepts for coaching).
-- Courses' readiness engine and Luna's memory can read the same store.
--
-- All reads are best-effort in the app: if this migration hasn't run, those
-- features degrade gracefully rather than break.

-- ── Per-concept mastery ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.concept_mastery (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  concept         text NOT NULL,                       -- e.g. "Exponents"
  subject         text NOT NULL DEFAULT 'Mathematics',
  state           text NOT NULL DEFAULT 'developing',  -- struggling|developing|solid|mastered
  confidence      real NOT NULL DEFAULT 0.3,           -- 0..1
  evidence_count  integer NOT NULL DEFAULT 0,
  correct_count   integer NOT NULL DEFAULT 0,
  last_seen       timestamptz NOT NULL DEFAULT now(),
  next_review     timestamptz,
  UNIQUE (user_id, concept)
);

CREATE INDEX IF NOT EXISTS concept_mastery_user_idx
  ON public.concept_mastery (user_id, state, last_seen DESC);

ALTER TABLE public.concept_mastery ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own concept_mastery: select" ON public.concept_mastery;
CREATE POLICY "own concept_mastery: select" ON public.concept_mastery
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own concept_mastery: insert" ON public.concept_mastery;
CREATE POLICY "own concept_mastery: insert" ON public.concept_mastery
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "own concept_mastery: update" ON public.concept_mastery;
CREATE POLICY "own concept_mastery: update" ON public.concept_mastery
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "own concept_mastery: delete" ON public.concept_mastery;
CREATE POLICY "own concept_mastery: delete" ON public.concept_mastery
  FOR DELETE USING (auth.uid() = user_id);

-- ── Individual question outcomes (the evidence stream) ─────────────────────
CREATE TABLE IF NOT EXISTS public.battle_question_records (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  concept     text NOT NULL,
  subject     text NOT NULL DEFAULT 'Mathematics',
  difficulty  text NOT NULL,                            -- easy|medium|hard
  correct     boolean NOT NULL,
  time_spent  real,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS battle_question_records_user_idx
  ON public.battle_question_records (user_id, created_at DESC);

ALTER TABLE public.battle_question_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own battle_question_records: select" ON public.battle_question_records;
CREATE POLICY "own battle_question_records: select" ON public.battle_question_records
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own battle_question_records: insert" ON public.battle_question_records;
CREATE POLICY "own battle_question_records: insert" ON public.battle_question_records
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ── Abandonment counter (battle exit hardening, docs §10) ──────────────────
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS battles_abandoned integer NOT NULL DEFAULT 0;
