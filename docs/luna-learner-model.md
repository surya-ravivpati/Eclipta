# Luna — Learner Model, Memory & Calibration

**Audit of how Luna personalizes today, every flaw found, and a grounded
redesign: an evidence-based calibration test + a structured learner model that
teaches people _how to think_, not what the answer is.**

Status: audit + design. Companion to `docs/trophy-road-redesign.md`. File/line
references point at the code as it exists now.

---

## 0. TL;DR

Luna's "personalization" is mostly **theater built on broken plumbing**. The
richest signals are silently dropped by a database constraint bug, several
profile fields the prompt reads are never written, and the only live signal —
`weak_areas`/`strong_areas` — is an LLM _guessing_ from a single chat turn with
no evidence threshold, no decay, and a race condition. There is no measurement
of how a learner actually learns.

The fix is two-part:

1. **Make the data real** — fix the bugs so actual performance (correctness,
   time, confidence) is recorded, then compute the learner model from that data
   instead of guessing from chat text.
2. **Calibrate up front** — a short, adaptive diagnostic that measures the
   dimensions that genuinely predict good tutoring (prior knowledge, working-
   memory load tolerance, pace, struggle response, scaffolding response, and
   _metacognitive accuracy_), then drive Luna from a structured profile.

And a teaching doctrine threaded through all of it: **Luna leads with a thinking
frame, never the answer.**

---

## 1. Audit — every flaw

Severity: 🔴 breaks personalization · 🟠 degrades it · 🟡 risk/debt.

### 🔴 F1 — Silent history data loss (constraint mismatch)

`learning_history.session_type` is constrained to
`CHECK (session_type IN ('chat','battle','test','course'))`
(`supabase/migrations/20260416042235_…sql:39`, never altered). But the app
inserts values that violate it:

- `'luna-session'` — full Luna surface (`src/hooks/use-luna-conversation.tsx:200`, `sessionType`)
- `'adaptive_test'` — adaptive tests (`src/components/AdaptiveTests.tsx:191`)

Both inserts throw a constraint violation, which is swallowed by the
surrounding `try/catch`. **Result: full Luna sessions and all adaptive-test
activity are never recorded.** The two richest learning signals the product has
are dropped on the floor, and every downstream memory/personalization decision
runs on a biased, partial history (only battles and the mini-chat survive).

**Status (2026-08-06): fixed for `'luna-session'`, moot for `'adaptive_test'`.**
The constraint was widened (`20260614000000_luna-history-session-types.sql`)
and inserts now go through a `log_learning_history` RPC instead of a raw
insert — the real, live Luna chat path records correctly. The
`'adaptive_test'`/`AdaptiveTests.tsx` half of this defect no longer applies:
that component doesn't exist anywhere in the current codebase (confirmed via
a repo-wide search), so there is no insert to lose. The `AdaptiveTests.tsx:191`
citation two lines above is itself stale — the file it points at is gone.

### 🔴 F2 — Dead behavioral fields

`luna-chat` personalizes on `avg_completion_time`, `total_sessions`,
`total_questions`, `total_correct` (`luna-chat/index.ts`, profile block). **No
client code ever writes these** (grep: only `preferred_pace/style/luna_notes`
are written, from `/profile`). So:

- "avg time under 30s → raise difficulty; over 120s → slow down" never fires.
- Lifetime-accuracy framing never appears.

The prompt _claims_ adaptivity it structurally cannot perform.

**Status (2026-08-06): fixed.** `total_sessions`/`total_questions`/
`total_correct` are written by `BattleReport.tsx` on every battle.
`avg_completion_time` was the one field still genuinely dead — nothing wrote
it — and has now been fixed too: `BattleReport.tsx` computes a running,
question-count-weighted average from each battle's per-question timing and
writes it alongside the other stats. All four fields `luna-chat` reads are
now live.

### 🔴 F3 — No calibration; learning preferences are almost always blank

`preferred_pace` and `preferred_style` default to `'normal'`/`'mixed'` and are
only ever set if a user manually edits `/profile` (`_authenticated.profile.tsx:367`).
Approximately nobody does. So for nearly every user the pace/style adaptation is
a no-op. Luna has **no idea how any given person learns** and never asks.

**Status (2026-08-06): mostly fixed, via a different, better mechanism than
the legacy fields this section describes.** A real calibration engine
(`src/lib/luna-calibration.ts`) and diagnostic UI
(`_authenticated.calibration.tsx`) shipped, producing a structured
`learner_profile` (pace, chunk size, struggle tolerance, scaffold
preference, thinking lean, metacognition, ability, and a confidence score
for how much data backs it — see §3.3/§4). It's wired into `luna-chat`'s
context (the "LEARNER MODEL" block). The legacy `preferred_pace`/
`preferred_style` fields this section describes are still vestigial exactly
as written — but they're now superseded, not the only mechanism, so "Luna
has no idea how any given person learns" is no longer accurate for anyone
who's taken the calibration.

### 🟠 F4 — Memory inferred from a single turn, with no evidence model

`luna-memory` fires an LLM call **every turn** (`use-luna-conversation.tsx:206`)
and infers `weak_areas`/`strong_areas` from one user message + one reply. There
is no attempt count, no correctness evidence, no confidence, no threshold. One
curious question about topic X can stamp X as a "weak area." This is:

- **Noisy** — single-turn inference is low signal and easily wrong.
- **Expensive** — doubles the AI calls per message.
- **Thrash-prone** — areas flip in/out with no stability.

Worse, it infers knowledge state from _chat phrasing_ when the app already has
ground truth — actual answer correctness — sitting unused (and partly destroyed
by F1).

### 🟠 F5 — Race condition / lost updates on the arrays

`luna-memory` does a read-modify-write of `weak_areas`/`strong_areas` using
`currentWeak`/`currentStrong` **passed from the client** (`use-luna-conversation.tsx:216`).
The client value is a snapshot; two turns close together each read the old
arrays and write back, so the **second write clobbers the first** (lost update).
The server also trusts client-supplied state rather than reading its own row.

**Status (2026-08-06): fixed.** `supabase/functions/luna-memory/index.ts`
now reads the user's own current `weak_areas`/`strong_areas` server-side as
the authoritative merge base, falling back to the client-supplied values
only if that read fails — closing the race exactly as described here.

### 🟠 F6 — Preferences are an unstructured, self-contradicting text blob

`luna_notes` is free text, newest-on-top, capped at 12 lines
(`luna-preference-detector.ts:60`). Nothing resolves conflicts: say "shorter
responses" today and "more detailed" next week and **both persist**, so the
prompt receives contradictory standing orders. The regex detector also stores
raw fragments ("fewer words", `:19-20`) that read oddly as instructions.

**Status (2026-08-06): partial.** The specific contradiction bug is fixed —
`src/lib/luna-preference-detector.ts`'s `preferenceCategory`/`mergePreference`
and the server-side mirror in `luna-memory/index.ts` both now drop a
same-category older entry when a fresh one arrives, so "shorter" today and
"more detailed" next week no longer both persist. What's still true: storage
is still a free-text capped-12-lines blob, not the structured
`preferences: {verbosity, tone, ...}` envelope §3.1 proposes.

### 🟠 F7 — Preferences and knowledge state are conflated; no subject scoping

`luna_notes` mixes _how I want to be taught_ (style) with model-inferred _notes
about me_. `weak_areas` is one flat global list — "fractions" and "SQL joins"
share a 12-slot array with no subject scoping, no mastery level, no recency.

### 🟠 F8 — No metacognitive model and no confidence data anywhere

Nothing measures whether the learner _knows what they know_. There's no
confidence capture, so Luna can't detect or correct **overconfidence** — one of
the biggest drivers of repeated errors — or reassure the **underconfident**.
This is the single most important missing dimension for "teach them how to
think."

### 🟠 F9 — Knowledge state divorced from actual performance

The richest truth — per-question correctness + response time — lives in
`luna-context.ts` in-memory (session-only, lost on reload) and _partly_ in
`learning_history` (itself lossy via F1). Yet `weak_areas` is produced by an LLM
reading chat text rather than **computed from the answer data**. The system
guesses at something it could measure.

**Status (2026-08-06): partial — the infrastructure this section asks for
now exists, but isn't wired to Luna yet.** `concept_mastery`
(`src/lib/concept-mastery.ts`) is a real, evidence-count-gated,
performance-computed knowledge store fed by actual battle answers
(`recordOutcomes`, called from `BattleReport.tsx`/`KnowledgeBattles.tsx`) —
this is exactly the "computed from the answer data" mechanism this section
describes as missing, and it already powers `WeakSpotPractice.tsx` (see
`docs/battle-redesign.md`'s note on that). The remaining gap: `luna-chat`
still reads the old flat, LLM-guessed `weak_areas`/`strong_areas`, not
`concept_mastery`. Pointing Luna's context at the real store instead of the
guessed one is the one wiring step left to fully close this defect.

### 🟡 F10 — No decay / staleness

`weak_areas`/`strong_areas` never expire (cap-12 FIFO only). A topic mastered
weeks ago can stay flagged "weak" forever. No spacing, no recency weighting.

### 🟡 F11 — Pseudo-personalization compounds the accuracy complaints

Because most real signals are dead (F2/F3) or lossy (F1), what reaches the model
is thin and sometimes wrong (F4). The model fills the gap by **guessing**, which
feeds the "inaccurate / off-topic" behavior reported separately. Bad
personalization data actively makes the tutor worse, not neutral.

### 🟡 F12 — Weak provenance & user control

Model-inferred notes land in the same blob the user hand-edits, with no
provenance ("why does Luna think I'm weak at X?"), no per-item review, and no
easy correction. Trust erodes when the user can't see or fix what Luna "knows."

---

## 2. Design principles (grounded in learning science, not myth)

The redesign commits to what the evidence supports and explicitly rejects what
it doesn't.

**Rejected: the "learning styles" myth.** There is no credible evidence that
matching instruction to a "visual/auditory/kinesthetic" style improves learning
(Pashler et al., 2008). We will **not** build a VAK quiz. Calibration measures
things that _do_ predict learning, below.

**Adopted:**

- **Mastery + tutoring (Bloom's 2-sigma).** One-to-one tutoring with mastery
  pacing is the strongest lever we have. Luna should approximate it: advance
  only on demonstrated understanding.
- **Cognitive Load Theory.** Match chunk size to working-memory capacity; use
  worked examples for novices and _fade_ them as competence grows (the
  expertise-reversal effect — what helps novices hurts experts).
- **Productive struggle / desirable difficulties (Bjork).** Some struggle aids
  retention. Calibrate how much _this_ learner tolerates before it becomes
  unproductive frustration.
- **Retrieval practice & spacing.** Memory is strengthened by recall and by
  revisiting on a schedule, not by re-reading.
- **Self-explanation & metacognition (Chi; Dunning–Kruger).** Asking learners
  to explain _why_ improves transfer; measuring confidence-vs-correctness
  reveals mis-calibration we can correct.
- **Zone of proximal development.** Target difficulty just beyond current
  ability — adaptive placement, not fixed levels.

---

## 3. The Learner Model (structured, evidence-based)

Replace the flat `weak_areas`/`strong_areas`/`luna_notes` soup with three
**cleanly separated** stores.

### 3.1 Preferences — _how I want to be taught_ (explicit, user-owned)

Structured, conflict-resolved, never inferred silently:

```jsonc
"preferences": {
  "verbosity": "concise" | "standard" | "detailed",
  "language": "en",
  "analogies": "rare" | "ok" | "love",      // default rare (see §6)
  "tone": "neutral" | "warm" | "dry",
  "answer_policy": "socratic" | "direct_on_ask"  // default socratic
}
```

Setting a key **overwrites** the same key (no contradiction accumulation, fixes
F6). The user sees and edits this in `/profile`. The regex detector maps phrases
to _keys_, not free text.

### 3.2 Knowledge state — _what I've shown I know_ (computed, evidence-based)

Per **skill**, derived from real answer data (fixes F4/F9/F10), not chat guesses:

```jsonc
"skills": {
  "algebra.factoring": {
    "mastery": 0.42,          // 0–1, Bayesian estimate
    "attempts": 9,
    "last_seen": "2026-06-10",
    "trend": "up",
    "confidence_gap": +0.3    // claimed >> actual ⇒ overconfident (see §5)
  }
}
```

- **Mastery** updates from correctness with a simple Bayesian/Elo-style rule
  (right → up, wrong → down, weighted by item difficulty). Replaces LLM
  guessing.
- **Decay**: mastery drifts toward "needs review" as `last_seen` ages (spacing).
  Fixes F10.
- **Subject-scoped** keys fix F7. A topic is "weak" only with ≥ N attempts and
  mastery below threshold — fixes the single-question false positive.

### 3.3 Learning profile — _how I learn best_ (from calibration, §4)

```jsonc
"learning_profile": {
  "chunk_size": "small" | "medium" | "large",   // working-memory load
  "pace": "deliberate" | "standard" | "fast",     // from item timing
  "struggle_tolerance": "low" | "medium" | "high",
  "scaffold": "worked_example_first" | "socratic_first",
  "metacognition": "overconfident" | "calibrated" | "underconfident",
  "lean": "conceptual" | "procedural" | "balanced",
  "calibrated_at": "2026-06-14",
  "confidence": 0.7   // how much data backs this; low early, grows
}
```

Storage: one `learner_profile jsonb` column on `user_profiles` (plus a
`calibration_runs` table for history). One blob, one read, RLS-protected.

---

## 4. The Calibration Test

A short, adaptive **diagnostic** (8–12 items, ~5–7 min) that the learner takes
on first run (and can re-take). It is not graded and never blocks the app — it
_tunes_ Luna. It deliberately measures process, not just correctness.

### 4.1 What each item captures

Every item records: correctness, time-to-answer, a **pre-answer confidence
rating** (how sure are you, 1–4), and — for scaffolded items — _which_ support
the learner chose to use. From these we infer the §3.3 dimensions.

### 4.2 The dimensions and how each is measured

| Dimension                         | How calibration measures it                                                                                                                                                                                                                                     |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Prior ability** (per domain)    | Adaptive ladder: start mid-difficulty, step up on correct / down on wrong. Final level ⇒ starting difficulty + initial skill priors.                                                                                                                            |
| **Pace**                          | Median time-per-item on correctly-answered questions ⇒ deliberate / standard / fast.                                                                                                                                                                            |
| **Working-memory / chunk size**   | A multi-step item presented all-at-once vs in pieces; performance + a short "how many steps could you hold?" probe ⇒ chunk size.                                                                                                                                |
| **Struggle tolerance**            | On a deliberately hard item: do they persist, request a hint, guess fast, or quit? Behavior, not the answer, is the signal.                                                                                                                                     |
| **Scaffold response (mini A/B)**  | Two matched concepts: one taught worked-example-first, one Socratic-first, each followed by a transfer item. Whichever method yields better transfer ⇒ `scaffold`. _This is the closest thing to a real "how you learn best" measurement, and it's behavioral._ |
| **Metacognitive accuracy**        | Compare confidence ratings to correctness. High confidence + wrong ⇒ overconfident; low confidence + right ⇒ underconfident; aligned ⇒ calibrated.                                                                                                              |
| **Conceptual vs procedural lean** | Pair a "compute the answer" item with a "why does this work" item; relative performance ⇒ lean.                                                                                                                                                                 |

### 4.3 Item bank & scoring (engine spec)

A pure, framework-free module (`src/lib/luna-calibration.ts`) with:

- `CALIBRATION_ITEMS`: a small bank tagged with `{ skill, difficulty, kind:
'mcq'|'multi_step'|'transfer'|'why', scaffold?: 'worked'|'socratic' }`.
- `nextItem(state)`: adaptive selection (step difficulty by running correctness).
- `inferProfile(responses)`: pure function mapping the recorded responses to a
  `learning_profile` + initial `skills` priors, with a `confidence` that scales
  with sample size (so early estimates are held loosely).

Keeping it pure makes the logic unit-testable without a UI and lets the same
engine power both a dedicated calibration screen and inline re-calibration.

### 4.4 Re-calibration (never a one-shot)

The calibration sets _priors_. Every subsequent real answer (battles, tests,
chat-checks) updates the model (§3.2), and the `learning_profile.confidence`
grows. Luna re-prompts a 3-item micro-calibration if behavior drifts far from
the stored profile (e.g., suddenly answering far above level).

---

## 5. Teaching doctrine — _think, don't tell_

The headline requirement: Luna gives **a way to think about the problem, never
the answer**. Concretely, Luna's default move is a **thinking frame**, not a
solution:

1. **Restate the givens** — "What do you actually have here?"
2. **Name the goal** — "What are you trying to find?"
3. **Surface one relevant principle** — the smallest idea that applies.
4. **Propose the first move** — one step, then hand it back.
5. **Let the learner act**, then respond to _their_ step.

This rides on the existing hint ladder (`hintLevel 0/1/2`) but adds two
evidence-based moves, tuned by the calibrated profile:

- **Self-explanation prompts** ("why did that step work?") after a correct step
  — improves transfer (Chi). Heavier for `lean: procedural` learners who get
  answers but not the why.
- **Worked-example fading** for novices: full example → partial (blanks to fill)
  → independent, governed by `scaffold` and rising `mastery`. Stop scaffolding
  as competence grows (expertise-reversal).

**Metacognition control loop** (uses §4.2):

- `overconfident` → before confirming, Luna asks for a confidence rating and a
  one-line justification: "How sure are you, and why?" Catches the error the
  learner can't see.
- `underconfident` → Luna explicitly names the correct reasoning back to them:
  "That logic is right, and here's why it generalizes." Builds calibrated trust.
- `calibrated` → normal flow.

**Core mechanic — Luna never hands over the final answer.** No matter how many
times the learner asks, escalation increases _scaffolding_, never reveals the
solution to the problem they're on (`hintLevel`: guiding question → name the
step → next single sub-step / parallel example → full method as fill-in-the-
blanks). Luna may explain concepts and analogous examples freely, and may
confirm or correct an answer the learner proposes — but producing their answer
for them is off the table, and no saved preference can switch that off. The
last step is always theirs; that's where the learning is.

---

## 6. How it plugs into Luna (`luna-chat`)

Replace the current blunt profile dump with a compact, structured **Learner
Model** block, and let the model act on real fields:

```
LEARNER MODEL
- Pace: deliberate · Chunk: small · Scaffold: worked-example-first
- Metacognition: overconfident → require a confidence check before confirming
- Focus skills (low mastery, due for review): algebra.factoring, trig.identities
- Strong (fade scaffolding): arithmetic, linear equations
- Preferences: concise; analogies rare; Socratic
```

Rules already added to the rewritten prompt (accuracy-first, scope discipline,
hard analogy cap, hint ladder) stay. Calibration just makes the _inputs_ real
and adds the metacognition + fading moves. Because the block is short and
structured, a fast model follows it far better than today's sprawling profile.

**Analogy note (ties to the separate accuracy fix):** the default is `analogies:
rare`. Calibration can raise it only if a learner demonstrably benefits.

---

## 7. Privacy & user control

- The learner model is **visible and editable** in `/profile`: skills with
  "why" provenance ("3 of 4 wrong on factoring"), preferences as toggles, and a
  one-click "reset what Luna knows."
- Preferences are user-owned and explicit; knowledge state is computed and
  labeled as such (fixes F12).
- No PII in the model — only skills, metrics, and preference keys.

---

## 8. Implementation plan (phased, each shippable)

1. **Fix the data plumbing (do first — it's bugs).**
   - 🔴 Fix F1: widen the `session_type` CHECK to the values actually inserted
     (`luna-session`, `adaptive_test`) — **shipped with this doc** (migration).
   - 🔴 Fix F2: write `total_*` / `avg_completion_time` (or stop reading them).
2. **Compute knowledge state from real answers** (server RPC over
   `learning_history`), replacing per-turn LLM guessing. Retire or downscope
   `luna-memory` to preference extraction only (kills F4/F5 cost + race).
3. **Structured learner model**: add `learner_profile jsonb`; migrate
   `weak/strong/luna_notes` into the three-store model (§3); structured
   preference keys (fixes F6/F7).
4. **Calibration engine** (`src/lib/luna-calibration.ts`, pure) — item bank,
   adaptive selection, `inferProfile`.
5. **Calibration UI** — a short, skippable diagnostic on first run + a re-take
   entry in `/profile`; writes `learner_profile`.
6. **Wire into `luna-chat`** — the §6 Learner Model block + metacognition &
   fading moves. **Profile editor** for transparency/control (§7).

---

## 9. Final recommendation

Luna doesn't need a bigger model to feel personal — it needs to **stop guessing
and start measuring**. Fix the constraint bug so real performance is captured,
compute knowledge state from answers instead of chat vibes, calibrate the few
dimensions that genuinely predict good tutoring (ability, load, pace, struggle,
scaffold response, and metacognitive accuracy — _not_ learning styles), and let
every reply lead with a way to think rather than the answer. That is the
shortest path to a tutor that is accurate, on-topic, and actually adapts.
