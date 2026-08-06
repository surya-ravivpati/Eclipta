# Eclipta — Cleanup, De-Lovable, and Hardening Plan

> **Project root:** `C:\Users\persw\Onedrive\desktop\eclipta\Eclipta`
> Every path below is relative to that directory.

---

## Status update — 2026-07-26

This plan was written before a separate, now-primary effort landed: `AGENTS.md`
(binding engineering rules) plus a domain-by-domain migration to typed
Drizzle schemas + repository modules, tracked in
`docs/vertical-slice-migration-plan.md`. That work already re-decided or
completed several items below on its own timeline, sometimes differently than
this plan assumed. Corrections, verified against the repo on this date:

- **Package manager: settled as pnpm, not npm.** `AGENTS.md` mandates pnpm;
  `pnpm-lock.yaml` is the only lockfile on disk (`bun.lock`, `bun.lockb`,
  `bunfig.toml`, `package-lock.json` are all already gone) — **Phase 2c's
  lockfile cleanup is done**, just under a different final answer than "verify
  what Vercel uses." Read every `npm run` in this doc as `pnpm run`.
- **`@tanstack/react-query` is no longer unused** — Phase 4's dependency-bloat
  list is wrong on this one. `src/config/query-client.ts` + `__root.tsx` wire
  a real `QueryClientProvider`, and several hooks (`use-player-rating.tsx`,
  `use-player-xp.tsx`) use it for real. Do not remove it; re-verify the rest
  of that dependency list before acting on it, since it was written before
  this changed.
- **Phase 0 is done, differently than specified.** `pnpm install` works,
  `typecheck`/`test`/`test:watch` scripts exist (plus more: `lint:ratchet`,
  `typecheck:ratchet`, `verify`). No single frozen "baseline output" file was
  kept — the two-tier ratchet system (`typecheck-baseline.json`,
  `lint-baseline.json`, explained in `AGENTS.md`) replaces that idea with a
  live, auto-updating one.
- **Phase 3e is largely done, differently than specified.** ESLint now runs
  type-aware rules including `no-floating-promises`, `no-misused-promises`,
  and `no-unnecessary-type-assertion` (all confirmed live via a real `pnpm
lint` run). `@typescript-eslint/no-unused-vars` is back on (this doc's
  claim that it's off is stale). `tsconfig.json`'s `noUnusedLocals` /
  `noUnusedParameters` are still `false`, tracked instead as strict-mode
  ratchet debt rather than flipped on directly — same goal, different
  mechanism.
- **Phase 5's testing infrastructure is done** (Vitest + Playwright +
  Testing Library all installed and wired, `pnpm test` real and green with
  137 tests as of this date) **but its specific listed targets are not yet
  covered** — `stat-mechanics.ts`, `ai-brain.ts`, `questions.ts`,
  `trophy-road-data.ts`, `milestones.ts`, `profanity.ts` have no dedicated
  tests yet. The tests that do exist are for the new repository layer
  (`src/repositories/*.test.ts`) and a couple of Query hooks, not this list.
  **Update (2026-08-06): `stat-mechanics.ts` is covered now** — a 367-line
  test file landed for it since this note was written, testing all 13
  exports. Strike it from the Phase 5 checklist below; the other five items
  are still genuinely uncovered (plus three added the same date: see below).
- **Still verified NOT done, as of this date:** Phase 1 (no `.github/workflows`
  exists), Phase 2a (`supabase/functions/_shared/ai.ts:22,25` still falls
  back to `LOVABLE_API_KEY` / the Lovable gateway URL — verified by reading
  the file), Phase 2d's `.lovable/plan.md` deletion (file still present),
  Phase 3c (only `luna-chat` calls `check_ai_rate_limit`), Phase 3d (no
  `supabase/functions/_shared/auth.ts` exists), Phase 4's doc reconciliation
  (`PRODUCT_OVERVIEW.md` still describes the project as Lovable-managed —
  verified by reading it), Phase 6 (`KnowledgeBattles.tsx` is 4,062 lines,
  larger than the 3,091 this plan cites, not smaller).
- **`as any` / `as never` cast count is down but not zero**: ~84 combined
  across `src`/`supabase/functions` as of this date (was ~145 across 26
  files when this plan was written), from the independent cast-removal work
  the vertical-slice migration's foundation pass did. Phase 3a is partially
  done; re-run its own grep before resuming rather than trusting either
  number.
- **New, independently confirmed finding for Phase 4:** `src/components/
CertifiedCourses.tsx` really is dead code, and now doubly confirmed —
  `src/routes/_authenticated.certified.tsx` (the route that would list it)
  unconditionally redirects to `/courses` with a comment citing
  `docs/courses-redesign.md`: "the Certified/Community split was retired."
  Its data layer was migrated onto the new courses repository anyway (same
  rigor as every other file, dead or not), but the file itself is still a
  Phase-4 deletion candidate — flagged for the user to confirm before it's
  actually deleted, since removing a whole component is a bigger call than a
  stray unused variable.
- **Out of scope for this document, by explicit user instruction (2026-07-26):**
  the live-account/data question — Eclipta's user accounts and data
  currently split across an old Lovable-hosted Supabase project and a newer
  one from the Vercel migration. The user has said someone else is handling
  that migration. This plan's Phase 2 items about the Lovable _AI gateway
  fallback_ and _lockfiles_ are a different, code-level concern and remain
  in scope here.
- **Not re-verified this pass** (re-run this plan's own grep commands before
  trusting either the original numbers or this note): Phase 3b's specific
  swallowed-error call sites beyond `courses.tsx`'s (fixed as a side effect
  of the courses vertical slice — its `course_progress` "table not migrated
  yet" catch was removed since the table demonstrably exists), Phase 4's
  bloat inventory (dead shadcn primitives, unused deps, `Ecliptars/` size),
  Phase 7's specific component tests.

---

## Status update — 2026-08-05

Local `main` had drifted 21 commits behind `origin/main` (fast-forwarded this
date, no conflicts). A repo survey plus a targeted dead-code verification
pass resolved several items below and found new test-coverage debt from the
feature work that landed in that gap. As with the note above, this corrects
this plan's checklists in prose rather than flipping their checkboxes, except
where a bullet was executed exactly as specified.

- **Phase 2d's `.lovable/plan.md` deletion: done.** Deleted (commit
  `d85a1a5`) after re-confirming all three items it described
  (`UserSearchDialog.tsx`, `ChallengeInbox.tsx`, `create_pvp_challenge`) had
  already shipped.
- **Phase 4's zero-coupling deletions: `backup/battle-loading-original-2026-06-29/`
  done** (same commit) — its own `RESTORE.md` conceded `git revert` already
  covered it. The other two items in that same bullet,
  `public/placeholder.svg` and `public/fonts/MolganRegular.otf`, were **not**
  touched this pass — don't assume progress there.
- **Phase 4's orphan components: both done.** `CertifiedCourses.tsx` and
  `DailyStreakCard.tsx` re-confirmed zero-importer (fresh grep, not just
  trusting this doc) and deleted (commit `d85a1a5`). The three comments that
  pointed at the now-deleted `backup/RESTORE.md`
  (`src/components/battles/BattleIntro.tsx:19`, `BattleIntro.css:5`,
  `src/components/KnowledgeBattles.tsx:3473`) were updated to point at git
  history instead of a path that no longer exists.
- **Phase 3b's `archetype-mastery.ts:137` bullet: done.** Migrated onto
  `src/repositories/battles.ts` (commit `6e5b5f7`): `recordArchetypeMasteryRpc`,
  `getArchetypeMastery`, `getAllArchetypeMastery` now exist there using the
  file's two established error-handling shapes (throw on read failure,
  log-and-continue on the best-effort mastery write — the RPC was silently
  discarding its `error` entirely before, so a failed mastery write was
  indistinguishable from a successful one). `use-archetype-mastery.ts`'s
  `fetchAllMastery().then()` is also one of the ~9 unhandled promise chains
  Phase 3e already flags — it got the missing `.catch()` in the same commit,
  so `loading` no longer gets stuck forever if the fetch now throws.
- **New test-coverage debt, worth folding into Phase 5's target list:** a
  21-commit feature wave (dashboard, global search, lifecycle email,
  Pressure Mode, i18n, legal/consent, Ultimates) landed 2026-08-01 to
  2026-08-03, outside this plan's scope. Ultimates got full test-first
  treatment (582 lines of tests), but `src/lib/pressure/*` (747 lines of
  scoring/integrity/distraction logic), `src/lib/search/query.ts`, and
  `src/repositories/dashboard.ts` all shipped in the same window with **zero
  tests**. None of this is Lovable-severance or bloat-removal work, so it
  doesn't belong as a new phase here — just an addition to Phase 5's list.
- **Phase 4's dependency/shadcn-primitive pruning is untouched** — not
  attempted this pass, still fully open. Don't infer progress here from the
  other Phase 4 items above being done.

---

## Context

Eclipta is a React 19 + TanStack Start SPA on Supabase (Postgres + RLS, ~181 `SECURITY DEFINER` RPCs, 78 migrations, 9 Deno edge functions). It was built on the **Lovable** platform and largely migrated off it in commit `f2726f8` ("Decouple from Lovable: Vercel hosting, native Supabase OAuth, env-driven AI"). What remains is the tail of that migration plus the debt it left behind.

Six problems justify this work:

1. **The Lovable dependency is still live.** `supabase/functions/_shared/ai.ts:22,25` silently falls back to `LOVABLE_API_KEY` and `https://ai.gateway.lovable.dev/v1`. Every AI feature in production may currently be running through a platform you intend to leave, and nothing would tell you.
2. **Installs are not reproducible.** `bun.lock` pins hundreds of packages to Lovable's private Artifact Registry (`europe-west1-npm.pkg.dev/lovable-core-prod/...`). Three lockfiles are committed; two are months stale.
3. **Nothing is verified.** No tests, no CI, no `typecheck` script, and `node_modules/` isn't even installed — so `tsc --noEmit` and `eslint` have not been runnable in this checkout. `supabase/functions/**` is excluded from `tsconfig.json` and has no Deno config, so ~10 edge functions get zero static analysis.
4. **~145 type casts are stale.** `as any` / `as never` / `as unknown as` litter 26 files on the excuse that tables aren't in the generated types. That excuse is now false: `src/integrations/supabase/types.ts` has 51 tables and 73 RPCs, and only **4** names used with casts are genuinely missing. A comment at `src/lib/study-rooms.ts:1-7` still teaches contributors to add more.
5. **Only 1 of 8 AI-spending edge functions is rate-limited.** `check_ai_rate_limit` is a ready-made RPC that writes its own audit row — and only `luna-chat:127` calls it. `luna-tts` (expensive audio) and six others are uncapped per user.
6. **~12 MB of dead weight and 33 unused dependencies**, plus docs that actively contradict the code — `PRODUCT_OVERVIEW.md`, the file the README points new collaborators at, still describes the project as Lovable-managed.

**Intended outcome:** a repo that installs reproducibly from public registries, contains zero references to Lovable, fails loudly instead of falling back silently, is guarded by CI and tests, and is meaningfully smaller — with **no change to user-visible behaviour**.

---

## Decisions taken

| Question        | Decision                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------- |
| AI provider     | **Not chosen yet.** Make config strictly env-driven and fail-fast. Provider picked later. |
| Package manager | **Verify what Vercel actually uses before deleting any lockfile.**                        |
| Bloat scope     | Conservative deletions **+ split `KnowledgeBattles.tsx`**.                                |
| Tests / CI      | **Full**: unit + component + smoke tests, plus CI.                                        |

## Ground rules

- **One concern per commit.** Every phase below is independently revertable.
- **Green gate after every step:** `npm run typecheck && npm run lint && npm run build`. If a step can't go green, stop and reassess rather than stacking changes.
- **No behaviour changes** outside Phase 3 (where the changes are the point) and Phase 2 (where failing loudly replaces failing silently).
- Repo convention (`CLAUDE.md`): commit on a feature branch, then fast-forward `main` and push. No PR gate.

---

## Phase 0 — Make the repo verifiable ⬅ do this first

Nothing else can be trusted until the toolchain runs. `node_modules/` is absent; `bun` and the `supabase` CLI are not installed.

- [ ] `npm ci` (uses `package-lock.json`, the only in-sync lockfile — committed alongside `package.json` in the decouple commit).
- [ ] Add scripts to `package.json`:
  ```json
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest"
  ```
  The README already advertises `npx tsc --noEmit` at line 382 but no script exists.
- [ ] **Capture a baseline.** Run `npm run typecheck`, `npm run lint`, `npm run build` and save the raw output to a scratch file. This is the "before" picture — every later phase is measured against it.
- [ ] If the baseline is already red, fix those errors _first_ as their own commit, before touching anything else.

**Verify:** all three commands run to completion and you have a recorded baseline.

---

## Phase 1 — CI gate (early, so everything after is guarded)

Deliberately before the deletions and the refactor — CI is what makes the rest safe.

- [ ] Create `.github/workflows/ci.yml`: on push + PR, Node 22, `npm ci`, then `typecheck` → `lint` → `test` → `build`.
- [ ] Add `"engines": { "node": ">=22" }` and `"packageManager"` to `package.json` so local, CI, and Vercel agree.

**Verify:** push the branch, confirm the workflow goes green on GitHub.

---

## Phase 2 — Sever the Lovable dependency

### 2a. The runtime fallback (the only thing that actually matters)

- [ ] `supabase/functions/_shared/ai.ts` — delete the `LEGACY_KEY` const (`:22`) and the `?? "https://ai.gateway.lovable.dev/v1"` default (`:25`). Make `AI_GATEWAY_URL` and `AI_GATEWAY_API_KEY` **required**, throwing a clear config error when absent. Same for `AI_AUDIO_*`, which currently inherits from the gateway values and so falls back to Lovable too.
- [ ] Wire up `assertAiConfigured()` — it's exported at `:34-40` and **no function imports it**; all 7 hand-roll their own `if (!AI_GATEWAY_API_KEY) throw`. Call the shared helper instead.
- [ ] Rewrite the file header comment (`:8, :17-20`), which documents the fallback as intentional.

### 2b. Prepare the provider swap (do not pick a provider yet)

Model IDs are provider-specific and will break on cutover. Collect them in one place now so the future swap is a single-file edit:

- [ ] Add a `MODELS` map to `_shared/ai.ts`, each entry env-overridable with a sane default. Current values:

  | Function                                                     | Model ID                        | Endpoint                |
  | ------------------------------------------------------------ | ------------------------------- | ----------------------- |
  | `luna-chat:350`                                              | `google/gemini-3-flash-preview` | `/chat/completions`     |
  | `moderate-content:90`                                        | `google/gemini-3-flash-preview` | `/chat/completions`     |
  | `luna-quiz:48`, `luna-room:21`, `review-course-proposal:127` | `google/gemini-2.5-flash`       | `/chat/completions`     |
  | `luna-memory:53`                                             | `google/gemini-2.5-flash-lite`  | `/chat/completions`     |
  | `luna-tts:49`                                                | `openai/gpt-4o-mini-tts`        | `/audio/speech`         |
  | `luna-stt:52`                                                | `openai/gpt-4o-mini-transcribe` | `/audio/transcriptions` |

- [ ] Document in `.env.example` that the `openai/`-prefixed audio IDs must lose the prefix on OpenAI-direct, and that `luna-tts`'s `instructions` param (`:49`) is OpenAI-only.

### 2c. Lockfiles — **verify before deleting**

- [ ] **Check Vercel first.** Open the latest deployment's build log and find the install line — it prints which lockfile it detected (e.g. `Detected package-lock.json` / `Detected bun.lockb`). Confirm before removing anything; deleting the wrong one breaks deploys.
- [ ] Evidence strongly favours npm: `package-lock.json` was committed _with_ `package.json` in the decouple commit and is clean of Lovable; `bun.lock` is ~1 month stale and still declares `@lovable.dev/cloud-auth-js`, `@lovable.dev/vite-tanstack-config`, `@cloudflare/vite-plugin` and `lovable-tagger` that `package.json` no longer has; `bun.lockb` is ~2.5 months stale; `bun` isn't installed locally; every README instruction uses npm.
- [ ] Once confirmed: delete `bun.lock`, `bun.lockb`, `bunfig.toml`. Regenerate `package-lock.json` from scratch (`rm -rf node_modules package-lock.json && npm install`) to guarantee no `lovable-core-prod` registry URLs survive, then `grep -i lovable package-lock.json` to prove it.

### 2d. Remaining references

- [ ] `src/routes/__root.tsx:56-57` — `og:image` and `twitter:image` point at a **Lovable-owned R2 bucket**. Self-host: add the image to `public/` and reference it via an absolute site URL. (Link previews break the day that bucket goes away.)
- [ ] Delete `.lovable/plan.md` — a tracked scratchpad whose three work items all shipped (`UserSearchDialog.tsx`, `ChallengeInbox.tsx`, `create_pvp_challenge`).
- [ ] Comment-only cleanups: `src/hooks/use-luna-voice.tsx:12,15`, `src/lib/study-luna.ts:3`, `supabase/migrations/20260623000000_streak-system-v2.sql:8` (comment only — **do not edit the migration's SQL**), `vite.config.ts:8`.

**Verify:** `grep -ri lovable . --exclude-dir=node_modules --exclude-dir=.git` returns only intentional history references. Deploy the edge functions to a staging project with `AI_GATEWAY_*` **unset** and confirm they now fail with a clear config error instead of silently reaching Lovable.

---

## Phase 3 — Correctness

### 3a. Regenerate Supabase types, then delete ~145 casts

The single highest-leverage change in this plan. Only 4 names used with casts are actually missing from `types.ts`: `complete_bot_battle`, `submit_contact_message`, `admin_moderation_queue`, `calibration_runs`. The other ~47 are all present — the casts are pure dead weight hiding real type checking across 26 files.

- [ ] Regenerate: `npx supabase gen types typescript --project-id juwlcfrvsrgppxokngqh > src/integrations/supabase/types.ts` (needs the Supabase CLI + login; if unavailable, hand-add the 4 missing entries).
- [ ] Delete the misleading comments at `src/lib/study-rooms.ts:1-7` ("_New tables aren't in the generated Supabase types_" — false) and `src/routes/_authenticated.calibration.tsx:68`.
- [ ] Remove casts **file by file, one commit each**, highest-density first: `KnowledgeBattles.tsx` (26), `study-rooms.ts` (15), `matchmaking.ts` (12), `study-safety.ts` (10 × `as never`), `study-teachback.ts` (8), `xp-service.ts` (6). Also drop the ~25 accompanying `eslint-disable` comments.
- [ ] **Expect real errors.** Removing a cast can surface a genuine shape mismatch. Fix the code, don't re-add the cast. This is the point of the exercise.

### 3b. Stop swallowing failures

- [ ] `src/hooks/use-luna-conversation.tsx:187-229` — the post-turn persistence block (`log_learning_history` + `luna-memory`) is wrapped in a triple `try/catch {}` with `.catch(() => {})` at `:225`. **This is the exact mechanism that silently lost every Luna session for months** (defect F1 in `docs/luna-learner-model.md`). The DB constraint was fixed; the silencer wasn't. At minimum `console.warn`.
- [ ] Check `error` on the paths where silence corrupts state, not just the display:
  - `src/lib/xp-service.ts:56,65,80,84,115` — a failed `award_xp` looks identical to "no XP".
  - `src/components/KnowledgeBattles.tsx:1622,1643` — a failed `complete_pvp_battle` / `complete_bot_battle` means rating and XP never apply, and the UI proceeds as if they did.
  - `src/lib/matchmaking.ts:40,46,59` — a failed `find_pvp_match` is indistinguishable from "no match", causing an infinite queue spin.
  - `src/lib/archetype-mastery.ts:137` — `record_battle_mastery` is awaited with no result binding at all.
- [ ] `src/routes/courses.tsx:100-114` — remove the `catch {}` guarding against `course_progress` "not being migrated yet". It shipped (`20260628140000_course-progress.sql`); the branch now only hides real errors.

### 3c. Rate-limit the AI endpoints

Real cost-abuse exposure. `check_ai_rate_limit(p_user, p_max, p_window_secs)` (`supabase/migrations/20260626140000_study-room-safety.sql:205`) already handles pruning, counting, and logging to `ai_call_log`.

- [ ] Call it in `luna-quiz`, `luna-tts`, `luna-stt`, `luna-room`, `luna-memory`, `review-course-proposal`, `moderate-content` — matching `luna-chat:127`. Tune `p_max` per function (TTS is the most expensive; moderation should be generous since it's on the posting path).
- [ ] The RPC is a single global per-user counter, so all functions currently share one budget. If that's too blunt, add a `bucket text` column to `ai_call_log` in a new migration and key the count by it.

### 3d. Consolidate edge-function auth

Not a live hole — all 9 functions do check the token — but it's 9 hand-rolled copies, and each constructs a `SERVICE_ROLE` client _before_ validating. Six of them run with `verify_jwt = false` in `supabase/config.toml`, so the in-code check is the only gate.

- [ ] Extract `supabase/functions/_shared/auth.ts` with a `requireUser(req)` helper that validates _then_ returns the client, and use it everywhere.

### 3e. Tighten the compiler and linter

Do this **after** 3a, so the cast removal isn't fighting a moving target.

- [ ] `tsconfig.json` — set `noUnusedLocals: true` and `noUnusedParameters: true` (both explicitly `false` at `:19-20`). This makes dead code a build error and does most of Phase 4's detection work for you.
- [ ] `eslint.config.js` — re-enable `@typescript-eslint/no-unused-vars` (turned off at `:23`) and upgrade to `tseslint.configs.recommendedTypeChecked`. That gets `no-floating-promises` (there are ~9 unhandled promise chains, e.g. `ProgressDashboard.tsx:109`, `use-archetype-mastery.ts:35`), `no-misused-promises`, and `no-unnecessary-type-assertion` — which would have caught 3a automatically and will prevent regressions.
- [ ] Add `backup/`, `.vercel`, `.nitro`, `src/routeTree.gen.ts` to the eslint `ignores` (currently only `dist`, `.output`, `.vinxi` — so lint walks the 147 KB dead file in `backup/`).
- [ ] Bring `supabase/functions/**` under static analysis: add a `deno.json` and a `deno check`/`deno lint` step in CI. It's ~10 files with none today.
- [ ] Review the 4 suppressed `react-hooks/exhaustive-deps` in `KnowledgeBattles.tsx:1122,1237,1689,2046` — in a component this size with realtime subscriptions and ~40 mirrored refs, these are the most likely home for stale-closure bugs. Don't blanket-fix; assess each.

### 3f. Env hygiene

- [ ] Add `.env` to `.gitignore` and `git rm --cached .env`.
- [ ] **No history rewrite needed.** The tracked values are only the project ID, URL, and a `sb_publishable_` key — all of which ship in the client bundle by design. The fix is about the precedent (the next person adds a service-role key to a file git already tracks), not about a leak.

**Verify:** typecheck + lint green with the stricter settings; battle a bot end-to-end and confirm XP and rating still move; force an edge-function error and confirm it now surfaces.

---

## Phase 4 — Remove bloat

Ordered so the tree stays green at every step. Sizes are measured.

- [ ] **Zero-coupling deletions:** `backup/battle-loading-original-2026-06-29/` (176 KB — its own `RESTORE.md` concedes `git revert` already covers it, and it's currently being linted), `public/placeholder.svg` (29 KB, zero references), `public/fonts/MolganRegular.otf` (24 KB, no `@font-face`).
- [ ] **Orphan components:** `src/components/CertifiedCourses.tsx` (7.7 KB) and `src/components/battles/DailyStreakCard.tsx` (4.2 KB) — both have zero importers. Note `src/lib/certified-courses.ts` is live and stays; only the component is orphaned.
- [ ] **Dependencies with zero import sites anywhere:** `@tanstack/react-query` (never used — `PRODUCT_OVERVIEW.md:208` claims it's in the stack, which is false), `date-fns`, `@hookform/resolvers`, `@tanstack/router-plugin` (vendored by `@tanstack/react-start`).
- [ ] **The 40 dead shadcn primitives.** Only 6 of 46 files in `src/components/ui/` are reachable: `dialog`, `tabs`, `button`, `dropdown-menu`, `popover`, `sonner`. None of those 6 import any other `ui/` file, so the other 40 are fully unreachable (136 KB, `sidebar.tsx` alone is 24 KB). `src/hooks/use-mobile.tsx` dies with `sidebar.tsx` — its only importer.
  - _Judgement call:_ shadcn is conventionally kept as a vendored palette for future use. `npx shadcn add <name>` regenerates any file on demand, which is the argument for deleting now and re-adding on need. Delete the 40 files and `use-mobile.tsx` in **one commit** so it's trivially revertable.
- [ ] **Then the 29 deps those files were the sole consumers of:** `cmdk`, `vaul`, `recharts`, `embla-carousel-react`, `input-otp`, `react-day-picker`, `react-resizable-panels`, `react-hook-form`, and 21 of 26 `@radix-ui/*`. Keep exactly 5 radix packages: `react-dialog`, `react-dropdown-menu`, `react-popover`, `react-tabs`, `react-slot`.
  - Do **not** remove `nitro`, `zod`, `tw-animate-css`, `katex`, `sonner`, `framer-motion`, `lucide-react` — all verified in use.
- [ ] **Unused exports — un-export, don't delete.** ~27 symbols have no importers, but a naive sweep would break things: `joinQueue` is called internally at `matchmaking.ts:141`, and `trimMessagesForApi`, `deriveState`, `flameTier` are likewise used within their own modules. **Drop the `export` keyword, then let `noUnusedLocals` (Phase 3e) tell you which are genuinely dead.** Self-verifying, and it can't produce a false deletion.
  - Genuinely dead and safe to remove outright (definition is the only reference): `isCleanUsername`, `normalizeForModeration` (`profanity.ts`), `submitForumReport` (`moderation.ts`), `setRoomEcliptar` (`study-rooms.ts`), `formatRatingDelta` (`rating.ts`), `cleanupAbandonedRooms` (`study-safety.ts:84` — a duplicate; `study-rooms.ts:94` already calls the same RPC inline).
- [ ] **Reconcile the docs** — the highest-value correction, since `README.md:20` points new collaborators at `PRODUCT_OVERVIEW.md`:
  - `PRODUCT_OVERVIEW.md:11,88,122,141,142,151,167,208` — remove the Lovable-managed framing, the `@lovable.dev/*` deps (gone from `package.json`), and the TanStack Query claim.
  - `README.md:405-424` — the project-structure tree is wrong: `battles/`, `forum/`, `landing/`, `profile/`, `luna/` are under `src/components/`, not siblings of it; `src/styles/` is actually `src/styles.css`.
  - `README.md:292` — the "no migration directory" note; `README.md:170-182` — add TanStack Start, nitro, edge functions.
  - `docs/luna-learner-model.md:48` — cites `src/components/AdaptiveTests.tsx:191`, the only doc-referenced source path in the repo that doesn't resolve.

**Verify:** typecheck + lint + build green after each commit; `npm ci` from clean; click through every route (battles, forum, groups, certified, profile, progress, luna, collection, streak) to confirm no missing-import runtime errors.

---

## Phase 5 — Unit tests for pure logic (before the refactor)

Tests first, so the Phase 6 split has a safety net. These modules have **zero** imports of `supabase` and are directly testable:

- [x] `vitest.config.ts` + `vitest` devDependency — done, part of the foundation pass.
- [x] ~~`src/components/battles/stat-mechanics.ts`~~ — **done**: `stat-mechanics.test.ts` covers `getEffectiveDamage`, `getEffectiveMultiplierStep`, `streakToMultiplier`, `hpToSelfDmgMult`, `levelToCategory` boundaries, `getActionDifficultyLevel`, and 7 more exports.
- [x] ~~`src/components/battles/ai-brain.ts`~~ — **done (2026-08-06)**: `ai-brain.test.ts` covers `pickAiAction` per personality (with `Math.random` pinned via `vi.spyOn` to make branches deterministic) and `computeAiAccuracy`'s five stacking modifiers.
- [x] ~~`src/components/battles/questions.ts`~~ — **done (2026-08-06)**: `questions.test.ts`, 200-trial property checks per difficulty tier plus arithmetic re-derivation from the question text.
- [x] ~~`src/lib/trophy-road-data.ts`~~ — **done (2026-08-06)**: `trophy-road-data.test.ts`, including the `ecliptarSlugs` resolution check this line originally asked for.
- [x] ~~`src/lib/milestones.ts`~~, ~~`src/lib/profanity.ts`~~ — **done (2026-08-06)**: `milestones.integration.test.ts` (module-state isolated via `vi.resetModules()`), `profanity.test.ts`.
- [x] ~~**(Added 2026-08-05)** `src/lib/pressure/distraction.ts`, `integrity.ts`, `metrics.ts`~~ — **done (2026-08-06)**: `distraction.test.ts` (the pure `planInterruptions` function; the `DistractionEngine` class itself is real Web Audio side effects left to manual/e2e verification), `integrity.integration.test.ts` (jsdom — this module needs `document`/`Event`), `metrics.test.ts` (all 8 scoring functions).
- [x] ~~**(Added 2026-08-05)** `src/lib/search/query.ts`~~ — **done (2026-08-06)**: `query.test.ts` — also caught and fixed a wrong example in the file's own doc comment along the way.
- [x] ~~**(Added 2026-08-05)** `src/repositories/dashboard.ts`~~ — **done (2026-08-06)**: `dashboard.test.ts`, covering the happy path, the PGRST202-vs-generic-error distinction, and the fallback assembly.

**Note on scope:** ELO, XP, and mastery math live in SQL `SECURITY DEFINER` RPCs, not TypeScript — `src/lib/rating.ts` is a thin client wrapper. Testing that logic needs `supabase start` + pgTAP, which is a separate lift, and remains a known gap: **the "integration" test level (per `AGENTS.md`) doesn't yet do this** — the 3 files under Vitest's `integration` project all mock Supabase entirely, and none of this codebase's tests hit a real Postgres instance, so RLS/constraint/trigger behavior stays unverified by the suite. Flagging it as a known gap rather than pretending vitest covers it.

**Verify:** `npm test` green; tests fail if you deliberately perturb a constant in `archetypes.ts`.

---

## Phase 6 — Split `KnowledgeBattles.tsx`

3,091 lines holding the arena engine, a Web Audio synthesiser, the leaderboard, and the daily challenge. The `src/components/battles/` extraction pattern is already established and clean — this extends it.

**Stage A — mechanical moves, zero logic change.** These are already self-contained functions; move them and add imports. Line ranges in the current file:

- [ ] `battles/audio.ts` ← `:169-196` (the `playTone` / `sfx*` engine)
- [ ] `battles/HpBar.tsx` ← `:198-225`, `battles/FocusBar.tsx` ← `:226-287`, `battles/FighterCard.tsx` ← `:288-388`
- [ ] `battles/QuestionOverlay.tsx` ← `:389-472`, `battles/BattleLog.tsx` ← `:473-531`, `battles/WildEventOverlay.tsx` ← `:532-563`
- [ ] `battles/BattleChat.tsx` ← `:564-731`
- [ ] `battles/GamblerReveal.tsx` ← `:732-935`
- [ ] `battles/LeaderboardCard.tsx` ← `:2593-2830`, `battles/DailyChallengeCard.tsx` ← `:2831-2958`

That removes ~1,130 lines with no behavioural risk, leaving `KnowledgeBattles.tsx` at ~1,950.

**Stage B — hook extraction, only with tests behind it.** `BattleArena` (`:937-2592`) holds ~60 `useState`/`useRef` declarations, including ~15 refs that exist purely to mirror state for async callbacks. Real seams:

- [ ] `battles/use-battle-log.ts` — the ref-based log pipeline (`logCounterRef`, `pendingLogsRef`).
- [ ] `battles/use-live-pvp-channel.ts` — the Realtime subscription and turn resolution (the `live*Ref` cluster).

**Do not attempt** a `useReducer` rewrite of the state/mirrored-ref pattern in this pass. It's the right long-term fix and the wrong thing to bundle into a cleanup PR.

**Verify:** typecheck + build green; then play a full battle at each tier — bot, ghost, and live PvP (two browser sessions) — confirming damage numbers, combo multipliers, the Gambler reveal, chat, the battle report, and that XP/rating land in the DB.

---

## Phase 7 — Component and smoke tests

Deliberately after Phase 6: the extracted components are far easier to test than the monolith was.

- [ ] `@testing-library/react` + `jsdom`; component tests for the Stage A extractions — `HpBar`/`FocusBar` clamp at 0 and max, `QuestionOverlay` fires `onAnswer` and handles timeout, `BattleLog` renders in stable ID order, `GamblerReveal` maps scores to the right quality tier.
- [ ] Tests for the Phase 3b error paths — assert a failed RPC surfaces rather than silently no-ops.
- [ ] Smoke test for auth + battle: render the arena with a mocked Supabase client, select an archetype, answer a question, assert HP moves and a log entry appears.
- [ ] Add `test` to the CI workflow if not already wired in Phase 1.

---

## Deliberately out of scope

- **`Ecliptars/` (11.1 MB, zero references).** Ten PNGs at repo root, never bundled, never served — `src/lib/ecliptars.ts:7-8` renders Ecliptars with lucide icons, so the art was never wired up. You chose not to delete raw art. Recommendation: move it to external storage or git-lfs rather than carrying it in every clone. `sprite-Photoroom.png` is a duplicate of Mammorock's sprite if you want one free deletion.
- **`public/lofi.mp3` (5.9 MB)** — genuinely in use (`LofiPlayer.tsx:40`), but a candidate for Supabase Storage later.
- **Renaming the `chud` archetype key.** Commit `3b08dfe` renamed it to "Apex" in the UI only; the identifier persists in 22 source locations, 3 migrations, and live user data (`user_ecliptars` slugs `chud-a`/`chud-b`, `archetype_mastery` rows). Needs a data migration with backfill — a separate, deliberate task.
- **The Luna learner-model defects.** `docs/luna-learner-model.md` catalogs 12; verification against current code found **3 fixed, 4 partial, 5 open**. The open ones are product work, not cleanup. Two cheap exceptions worth folding into Phase 3 if convenient: `luna-chat` never emits `learner_profile.confidence` despite emitting seven sibling fields (one line, `index.ts:216-231`), and `avg_completion_time` is read at `:186` but written nowhere — either populate it or delete the read.
- **`luna-memory` firing an LLM call every single turn** (`use-luna-conversation.tsx:216`) — roughly doubles AI spend per message. Real, but a product decision.

---

## Verification summary

| Level             | Command / action                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| Every commit      | `npm run typecheck && npm run lint && npm run build`                                                              |
| After Phase 5     | `npm test`                                                                                                        |
| Clean install     | `rm -rf node_modules && npm ci` succeeds; `grep -i lovable package-lock.json` returns nothing                     |
| Lovable severance | Deploy edge functions with `AI_GATEWAY_*` unset → clear config error, no silent fallback                          |
| Deletions         | Click through all 14 authenticated routes + 8 public routes for runtime import errors                             |
| Battle engine     | Full battle at each tier (bot / ghost / live PvP), verifying damage, combos, report, and DB-persisted XP + rating |
| Deploy            | Vercel preview builds green before fast-forwarding `main`                                                         |

**Rough sequencing:** Phases 0–2 are a day and unblock everything. Phase 3 is the largest and most valuable — budget several sessions for the cast removal alone. Phases 4–7 are steady, low-risk work.
