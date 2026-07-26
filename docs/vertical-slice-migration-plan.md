# Eclipta — AGENTS.md Foundation & Vertical-Slice Migration Plan

> **Project root:** `C:\Users\persw\Onedrive\desktop\eclipta\Eclipta`
> Every path below is relative to that directory.

This is the plan behind the work actually in progress day-to-day: the rules
in `AGENTS.md` and the domain-by-domain migration onto them. It did not exist
as a written file until 2026-07-26, even though the work itself started
earlier that day — it had only been tracked in conversation and in Claude's
memory. This document makes it real and checkable, the same way
`docs/cleanup-plan.md` already was for the separate Lovable-severance effort.

**Relationship to `docs/cleanup-plan.md`:** that plan is about removing the
Lovable platform dependency and bloat. This plan is about strict typing, TDD,
and the database-access architecture (`AGENTS.md`'s rules). They overlap at
the edges (both touch cast removal, both touch tests) — where they do,
`cleanup-plan.md` now points here and vice versa. Do not duplicate rules
between the two; `AGENTS.md` is the single source of truth for the rules
themselves, both plans just track applying them.

---

## Origin

The user's mandate, given 2026-07-26: strict typing everywhere, easy
fine-tuning (typed config _and_, later, a real ML/fine-tuning pipeline for
Luna), Extreme Programming / Clean Code / Code Complete / Pragmatic
Programmer discipline — TDD, ORMs for SQL, proven libraries over hand-rolled
ones, shadcn/Framer/TanStack Query, pnpm/uv/Turborepo, Husky gates, linters
for TypeScript and Python. All of it was written into `AGENTS.md` in
checkable, short rules. Four architecture decisions were settled explicitly
(recorded in memory as `eclipta-engineering-standards`):

1. Stay on TanStack Start (not Next.js).
2. "Fine-tuning" means both a typed config module for every game-balance
   knob, _and_ a real LLM fine-tuning pipeline for Luna, eventually.
3. Drizzle owns schema/types only; a repository layer runs the actual
   queries through the RLS-respecting Supabase client.
4. Foundation first, then one domain at a time, test-first, end-to-end
   ("vertical slices"). Battles first — it holds the worst file in the repo.

Also settled, deferred, unscoped: "optimize this to pick up on readings
better and faster" using real ML classification, confirmed to apply broadly
— Luna's learner model, content-moderation classification, matchmaking and
difficulty tuning, "anywhere it makes sense." This needs its own design
conversation (which model, which system first, where training data comes
from) before any implementation starts. Not part of this plan's checklist
below; flagged so it isn't forgotten.

---

## Foundation — done

- pnpm + Turborepo, ESLint (type-aware) + Prettier, Ruff staged for future
  Python, Vitest (unit + integration projects) + Playwright + Testing
  Library, Husky (`pre-commit` lint/format, `pre-push` typecheck + tests).
- Zod-validated env config: `src/config/env.ts` (client, lazy) and
  `src/config/env.server.ts` (server-only, throws if imported in the
  browser).
- Two-tier quality gates: hard gates (`typecheck`, `lint`, `test`) must
  always be zero; ratchets (`typecheck:ratchet` against
  `tsconfig.strict.json`, `lint:ratchet` against ESLint warnings) track debt
  in `typecheck-baseline.json` / `lint-baseline.json` and may only fall.
  `pnpm verify` runs everything the pre-push hook runs.
- `src/config/query-client.ts` + `__root.tsx` wire a real
  `QueryClientProvider` (factory per request, not a module singleton — this
  app renders on the server, so a shared client would leak one user's cache
  into another's response).

---

## Vertical slices — status by domain

Pattern for every domain, applied in order: Drizzle schema
(`src/db/schema/<domain>.ts`) → a typecheck-only verification harness
(`<domain>.verify.ts`, asserts every Drizzle table matches Supabase's
generated Row/Insert types) → a repository module
(`src/repositories/<domain>.ts`, the only code allowed to call
`supabase.from()`/`.rpc()` for that domain) written test-first → migrate
every consumer file onto it → TanStack Query for the hooks that read it.

### Battles — done

`src/db/schema/battles.ts` (8 tables: archetype_mastery, battle_sessions,
battle_question_records, player_ratings, pvp_queue, pvp_battles,
pvp_challenges, pvp_turn_actions) + `src/repositories/battles.ts` (9
functions: ratings, matchmaking, Ghost replay, plus
`insertBattleQuestionRecords` added for the courses domain's concept-mastery
writes). `use-player-rating.tsx` migrated to Query. No remaining raw
`supabase.from()`/`.rpc()` call for a battles table **outside**
`KnowledgeBattles.tsx` itself — see "Known gaps" below, that file is its own
task.

### Profile — done

`src/db/schema/profile.ts` (user_profiles, user_ecliptars,
user_chest_claims) + `src/repositories/profile.ts` (XP reads/writes, owned
Ecliptars, claimed chests, admin grant/set XP). `use-player-xp.tsx`
(`usePlayerXp`, `useOwnedEcliptars`) migrated to Query.

### Courses — schema, repository, and most consumers done (2026-07-26)

`src/db/schema/courses.ts` (8 tables: user_courses, course_modules,
course_blocks, course_proposals, enrollments, course_progress —
including its `GENERATED ALWAYS AS` `percent` column — concept_mastery,
daily_challenge_progress) + `src/repositories/courses.ts` (25 functions).
`battle_question_records` writes route through the _battles_ repository
instead, since that table is modelled there even though courses' concept
mastery pipeline is what aggregates it.

Migrated onto the repository:

- [x] `src/routes/courses.$slug.tsx` — course detail, modules, blocks,
      creator name, enrollment check, enroll action.
- [x] `src/routes/courses.tsx` — the library/hub listing, enrollment slugs,
      course-progress overlay (also removed a `catch {}` that was guarding
      against `course_progress` "not being migrated yet" — it has been for
      a while; see the note below on silently swallowed errors).
- [x] `src/routes/_authenticated.certified.$slug.tsx` — enrollment
      check + enroll action for individually-linked certified courses.
- [x] `src/routes/_authenticated.courses.$courseId.edit.tsx` — the course
      editor: course fields, modules (add/rename/delete), blocks
      (add/update/delete). Image upload stays on `supabase.storage`
      directly — that's a different client surface than `.from()`/`.rpc()`,
      not covered by the repository rule.
- [x] `src/components/CourseBuilder.tsx` — course-proposal submission.
- [x] `src/components/CertifiedCourses.tsx` — enrollment list + enroll
      action. **This component is dead code** — see "Known gaps."
- [x] `src/components/ProgressDashboard.tsx` — enrollment count/list only
      (the `user_profiles` stats call in the same `Promise.all` is
      profile-domain, left as-is).
- [x] `src/components/KnowledgeBattles.tsx` — just the
      `daily_challenge_progress` read for the Daily Challenge card. The
      rest of this file's Supabase calls are battles-domain and out of
      scope for this slice; see "Known gaps."
- [x] `src/lib/course-progress.ts` — `syncCourseProgress`.
- [x] `src/lib/concept-mastery.ts` — `recordOutcomes`, `getWeakConcepts`
      (the `battle_question_records` insert inside `recordOutcomes` calls
      the battles repository, not this one).

Not yet migrated — found during this pass, not in the original scope:

- [ ] `src/routes/_authenticated.profile.tsx` — has its own raw
      `enrollments`, `course_proposals`, and `user_courses` calls (likely a
      "my courses" / "my proposals" panel). Not migrated yet: this file is
      large and multi-domain (like `KnowledgeBattles.tsx`), so it needs its
      own careful pass rather than a quick add-on here.
- [ ] The `user_profiles.weak_areas`/`strong_areas` read in
      `src/routes/courses.tsx` and the `user_profiles` stats read in
      `src/components/ProgressDashboard.tsx` are profile-domain, not
      courses-domain — left raw, tracked as profile-domain debt, not a
      courses-domain gap.
- [ ] Two Deno edge functions (`supabase/functions/luna-chat`,
      `supabase/functions/review-course-proposal`) query courses tables
      directly. Edge functions are a separate runtime from
      `src/repositories/` — the repository rule is about this app's
      client/server TypeScript, not the Deno functions — so these are
      intentionally out of scope for this plan, not a missed spot.

### Not started

Forum, moderation, study rooms, Luna, notifications — no Drizzle schema, no
repository, no Query hooks for any of them yet. Pick the next one the same
way battles was picked first: whichever holds the worst raw-Supabase
exposure or the most user-facing risk.

---

## Known gaps and flagged bugs (not fixed, tracked here so they aren't lost)

- **`src/lib/archetype-mastery.ts`** still has a raw
  `supabase.rpc("record_battle_mastery", ...)` call touching the
  already-modelled `archetype_mastery` table (battles domain) — missed
  during the battles-domain completion pass. Small, isolated, easy pickup.
- **`KnowledgeBattles.tsx`** (4,062 lines) still calls Supabase directly for
  its own core battle tables despite a battles repository existing. Too
  large and central to bundle into any domain-completion pass — its own
  task, likely paired with the file-split work in `docs/cleanup-plan.md`
  Phase 6.
- **Suspected RLS regression, unconfirmed:** `getUsername()` in
  `src/repositories/profile.ts` queries `user_profiles` directly, but that
  table's SELECT policy is `USING (auth.uid() = user_id)` — own-row only.
  Its one real caller (`matchmaking.ts`'s opponent-username lookup) may be
  silently getting `null` for every opponent. Separately,
  `getCourseCreatorUsername()` in the new courses repository queries the
  `public_profiles` _view_ instead (ported unchanged from the
  pre-repository code), which was built with `security_invoker = false`
  (bypasses RLS, correct for this use) but was later recreated with
  `security_invoker = on` in a security-hardening migration — likely
  re-inheriting the same own-row restriction, probably as an unintended side
  effect. **Not fixed** — recommend the user empirically verify (view a
  community course, or another user's profile, while logged in as someone
  else; check whether the creator name shows correctly or falls back to
  "Anonymous") before anyone touches the RLS policy or the view.
- **Recurring migration mistake to watch for:** moving a raw
  `supabase.rpc()`/`.from()` call into a repository function is easy to get
  wrong by silently dropping the original `console.warn`/`console.error` at
  the old call site. Happened three times in the battles/profile slices,
  caught each time only by re-reading the diff before committing. Keep
  checking for this on every future domain.

---

## Domain tally (2026-07-26)

| Domain                                              | Schema   | Repository   | Consumers migrated                                   | Query hooks                                                 |
| --------------------------------------------------- | -------- | ------------ | ---------------------------------------------------- | ----------------------------------------------------------- |
| Battles                                             | 8 tables | 9 functions  | All except `KnowledgeBattles.tsx`'s own battle calls | `usePlayerRating`                                           |
| Profile                                             | 3 tables | 9 functions  | All                                                  | `usePlayerXp`, `useOwnedEcliptars`                          |
| Courses                                             | 8 tables | 24 functions | 9 of ~10 files (see list above)                      | none yet — reads here are still `useEffect`, not `useQuery` |
| Forum, moderation, study rooms, Luna, notifications | 0        | 0            | 0                                                    | 0                                                           |

19 tables modelled; dozens remain across the not-started domains. 137 tests
passing as of this date, all in the repository/hook layer built by this
effort. Strict-mode ratchet baseline: 283 (down from 286 at the start of the
courses slice). Lint-warning ratchet baseline: 545 (down from 576).

---

## Verification per slice

Every domain, before calling it done: `pnpm typecheck && pnpm lint && pnpm
test` all clean (hard gates), ratchet scripts run to confirm the count only
fell, a real-browser check via `claude-in-chrome` against the live Supabase
backend where practical, and a check for the three-times-repeated mistake
above (dropped error logging) by re-reading the diff.
