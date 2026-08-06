# Eclipta

## One-Sentence Summary

Eclipta is a gamified, AI-assisted learning platform where answering academic questions powers real-time competitive "Knowledge Battles," long-term progression, and an AI tutor (Luna) that coaches _how to think_ rather than handing over answers.

## Elevator Pitch

Most learning apps follow the same loop: read something, answer a quiz, move on. Eclipta turns that loop into a game. Your subject knowledge _is_ the gameplay — in head-to-head battles, correct answers fuel attacks, momentum, and strategy, so getting better at math, science, or programming directly makes you stronger in the arena. Alongside the competitive layer, an AI tutor named Luna gives hints and explanations but deliberately never gives the final answer, study rooms let friends learn together in real time, and a community forum and course system round out the experience.

The whole thing is wrapped in a cosmic "eclipse" theme with collectible creatures (Ecliptars), a long progression journey, and a daily-streak habit loop — aiming to make studying feel interactive, skill-based, and rewarding instead of passive and repetitive. It appears to be an ambitious solo/small-team project (originally built on the Lovable platform, now repositioned as proprietary and mid-way through severing that dependency — see `docs/cleanup-plan.md`) that is well past prototype: dozens of database migrations, multiple AI backend functions, and many fully-wired features already exist.

## The Problem

Traditional educational platforms treat learning as a passive, repetitive chore — consume content, answer questions to advance, repeat — which struggles to hold attention and rarely teaches genuine problem-solving. Quizzes are bolted on as assessment rather than being intrinsically motivating. Meanwhile, generic AI "tutors" often just give answers, which short-circuits the actual learning. The README frames the core bet directly: _"what if learning felt closer to a competitive game?"_

## The Solution

Eclipta makes knowledge the gameplay itself. Its centerpiece, **Knowledge Battles**, is a real-time system where educational performance changes what a player can do in combat — answers drive attacks, combos, momentum, and strategic decisions. Around that core, Eclipta layers the motivational machinery of games (progression, ranks, collectibles, daily streaks, leaderboards) onto genuine academic practice, and pairs it with an AI tutor (Luna) explicitly designed to lead with a _thinking frame_ and withhold the final answer so the learner does the last step themselves.

## Target Users

Inferred from the README, landing copy, and feature set:

- **Students who enjoy competitive or game-like learning** (the primary audience).
- **Learners motivated by progression, ranking, and collection systems.**
- **Friends/classmates studying together** (the Study Rooms feature is built around small groups).
- **Classrooms or communities** experimenting with interactive learning.
- **Developers and educators** interested in educational-gaming systems.
- Subjects supported by the AI tutor span math (arithmetic through linear algebra/real analysis), physics, chemistry, biology, computer science/programming, economics, history, the humanities, and languages.

There is no age gate or explicit grade-level targeting in the code, though onboarding collects an age, and the moderation/safety investment suggests the team is conscious of younger users.

## Core User Journey

A typical first-time flow, traced through the routes and auth system:

1. **Land on the marketing site** (`/`, `/about`) — "The world's first adaptive learning arena."
2. **Sign up / log in** via Supabase Auth (`/signup`, `/login`, with `/forgot-password` and `/reset-password`).
3. **Onboard** (`/onboarding`) — pick a username (moderated), enter age/goals, and set learning preferences.
4. **(Optionally) take a calibration diagnostic** (`/calibration`) — a short adaptive test that tunes the AI tutor to how the user learns.
5. **Enter the arena** (`/battles`) — play Knowledge Battles against bots, "ghost" opponents, or real players, earning XP and rating.
6. **Progress and collect** — climb the Trophy Road (`/streak`, progression), claim Ecliptars into a Collection (`/collection`), and maintain a daily practice streak.
7. **Learn deeper** — take or build Certified Courses (`/certified`, `/build-course`), ask Luna for help (`/luna` or inline), and study with others in Study Rooms (`/groups`).
8. **Participate in the community** — post in the Forum (`/forum`), follow users, and view public profiles (`/u/$username`).
9. **Track everything** — Progress dashboard (`/progress`), Notifications (`/notifications`), and Profile settings (`/profile`).

## Key Features

### Competitive Learning (the core loop)

- **Knowledge Battles** — Real-time 1v1 academic combat where answering questions drives attacks, combos, momentum, and focus. _Why it matters:_ it is the product's central differentiator — learning _is_ the game mechanic, not a separate quiz.
- **PvP rating & matchmaking** — An ELO-style rating ladder (`player_ratings`) with matchmaking, plus battles against bots and asynchronous "ghost" opponents. _Why it matters:_ gives the competitive loop real stakes and fair pairing even without a live opponent.
- **Archetypes & mastery** — Combat "archetypes" (Speedster, Tank, Chud, Gambler, Healer, Fulcrum, Accelerator, God) with a mastery system. _Why it matters:_ adds strategic identity and a skill-expression layer on top of raw knowledge.
- **Battle replays** — Replay infrastructure (`battle-replay.ts`). _Why it matters:_ supports review and (potentially) spectating.

### Progression, Collection & Habit

- **Trophy Road** — A long progression spine spanning Bronze → God tiers across themed bands and dozens of nodes. _Why it matters:_ a persistent sense of journey and reward that never resets.
- **Ecliptars** — Collectible creatures tied to each archetype (two per archetype; the final "God" slots are the boss monsters **Newton** and **Ecliptadon**), claimable from progression nodes and equippable as a profile/room avatar. _Why it matters:_ collection psychology and identity, on-theme with the cosmic brand.
- **Daily Practice Streak** — A Duolingo-style daily habit loop (v2 streak system, daily challenge, milestones, celebrations). _Why it matters:_ drives retention and consistent practice cadence.

### AI Tutoring (Luna)

- **Luna AI tutor** — A conversational tutor available as a full session (`/luna`) and inline, with a strict "guide, never give the answer" hint ladder. _Why it matters:_ preserves the learning moment instead of short-circuiting it.
- **Calibration & learner model** — An adaptive diagnostic plus a structured per-user learner profile that tunes Luna's pace, scaffolding, and metacognitive prompts. _Why it matters:_ personalization grounded in measurement rather than guesswork (see Educational Philosophy).
- **Voice & multimodal** — Speech-to-text and text-to-speech, plus image/screen understanding. _Why it matters:_ lets learners talk to Luna or show it a problem.

### Courses & Content

- **Certified Courses** — A course catalog with a structured learning experience (`/certified`, `/certified/$slug/learn`) and per-course forums. _Why it matters:_ provides guided, long-form content alongside the battle loop.
- **Course Builder** — Users can author courses (`/build-course`, course editor), with an AI-assisted **course-proposal review** step. _Why it matters:_ turns the platform into a content ecosystem, not just consumption.

### Community & Collaboration

- **Forum** — Threads, answers, and comments with tags, an admin view, and full content moderation. _Why it matters:_ a knowledge-sharing community around the subjects being learned.
- **Study Rooms** — Real-time group study spaces with group chat, a lo-fi music radio, a shared Pomodoro-style **Session Clock**, a **Goal/Resource Pin**, an in-room Luna assistant (private "Ask," public "Stuck" help, and a "Recap"), and a **Teach-Back Rotation** ritual where members take turns explaining a concept. _Why it matters:_ makes studying social and structured, a major recent investment area.
- **Profiles, following & notifications** — Public profiles (`/u/$username`), a notifications center, and progress sharing. _Why it matters:_ social accountability and presence.

### Trust & Safety (a notably deep layer)

- **Unified moderation pipeline** — One shared, two-layer (deterministic dictionary/pattern + AI-classifier) moderation system enforced server-side across forum posts, usernames, and chat, with severity tiers (block/flag/allow), a self-harm support path, and a repeat-offender soft-pause signal. _Why it matters:_ keeps a learning community safe and is required for younger users.
- **Verified reporting system** — Reports trigger an independent moderation re-scan (never count-based removal), with an internal reporter-trust signal and brigading detection. _Why it matters:_ abuse-resistant moderation that doesn't let mass-reporting weaponize the tool.
- **Room safety & host powers** — Per-room host controls (regenerate code, remove member), account-level user blocking, and abandoned-room cleanup. _Why it matters:_ gives groups control and keeps spaces healthy.

## AI Capabilities

All AI runs server-side through Supabase Edge Functions that call an AI gateway (currently the Lovable AI gateway, using Google Gemini models such as `google/gemini-3-flash-preview` — this is a legacy fallback flagged for removal in `docs/cleanup-plan.md` Phase 2a, not a permanent architectural choice); no model keys are exposed to the browser. From a user's perspective:

- **Luna, the tutor (`luna-chat`)** — Ask a question and Luna responds with a hint, nudge, explanation, challenge, or "take a break" cue. It is deliberately scoped to study help, leads with a way to _think about_ the problem, and refuses to hand over the final answer no matter how many times it's asked. It personalizes using a structured learner model and can ground answers in course material (a retrieval/RAG step).
- **Quiz generation (`luna-quiz`)** — Generates practice questions on a topic.
- **Voice (`luna-stt`, `luna-tts`)** — Talk to Luna and hear replies (speech-to-text and text-to-speech).
- **Vision/multimodal** — Luna can take an image or a shared screen of a problem (`luna-image`, `luna-screen`).
- **In-room assistant (`luna-room`)** — In Study Rooms, Luna powers a private "Ask," a public "Stuck" fallback when no human answers in time, and a session "Recap" built only from structured events (not raw chat).
- **Learner-model inference (`luna-memory`, `luna-calibration`)** — Infers/updates a learner profile (pace, scaffolding needs, metacognition) from a calibration diagnostic and ongoing performance.
- **Content moderation (`moderate-content`)** — An _unbranded_ AI classifier (never presented as "Luna") judges harassment, hate, threats, sexual content, etc., as the contextual layer of the moderation pipeline.
- **Reporting re-scan (`report`)** — A user report triggers a fresh, higher-priority moderation pass on the reported content; the pipeline's own verdict — not the report — decides any action.
- **Course-proposal review (`review-course-proposal`)** — AI assists in vetting user-submitted courses.

## Educational Philosophy

Eclipta embeds a clear, research-referencing learning philosophy, most explicitly in `docs/luna-learner-model.md`. Key principles inferred from the code and docs:

- **Teach _how to think_, not the answer.** Luna's core doctrine is a "thinking frame": restate the givens, name the goal, surface one relevant principle, propose the first move, then hand it back. The "never reveal the final answer" rule is treated as non-negotiable and cannot be disabled by user preference.
- **Mastery learning + tutoring (Bloom's 2-sigma).** Advance on demonstrated understanding; approximate one-to-one tutoring.
- **Cognitive Load Theory & worked-example fading.** Match chunk size to working memory; scaffold novices, then fade support as competence grows (expertise-reversal effect).
- **Productive struggle / desirable difficulties (Bjork).** Some struggle aids retention; the system tries to calibrate how much each learner tolerates.
- **Retrieval practice & spacing.** Strengthen memory through recall and revisiting on a schedule.
- **Self-explanation & metacognition (Chi; Dunning–Kruger).** Prompt learners to explain _why_, and measure confidence-vs-correctness to detect over/under-confidence.
- **Zone of proximal development.** Target difficulty just beyond current ability via adaptive placement.
- **Explicit rejection of the "learning styles" (VAK) myth** — the docs deliberately refuse to build a visual/auditory/kinesthetic quiz, citing lack of evidence, and instead calibrate dimensions that actually predict learning.

Note: the learner-model document is partly an **audit + design** doc — it candidly catalogs bugs in the _current_ personalization plumbing and proposes the evidence-based redesign. So the philosophy is clearly intended and partially implemented (a calibration engine and `learner_profile` exist), but some of the measurement may still be maturing.

## Platform Architecture (High Level)

Eclipta is a **single-page web application** with a **serverless backend**:

- The **frontend** is a React app that runs in the browser and handles all the UI, animation, and game interactions.
- The **backend** is **Supabase** — a hosted platform providing the database (PostgreSQL), user authentication, file storage, and real-time updates (used for live battles and study-room chat). Most business rules live in the database itself as secure stored procedures (RPCs) and row-level security policies, rather than in a separate API server.
- **AI features** run in **Edge Functions** (small serverless functions) that securely call an external AI gateway, so AI logic and keys stay off the client.
- The project **originated on the Lovable platform** but has since moved to **Vercel hosting** with native Supabase OAuth and env-driven AI config (see commit `f2726f8`, "Decouple from Lovable"). A handful of Lovable-era references remain (the AI gateway fallback, an image asset bucket, some Luna-related code comments) and are tracked as open work in `docs/cleanup-plan.md` — the project is proprietary, not Lovable-managed, as of the 2026-08 repositioning.

There is **no standalone/custom API server**; the browser talks directly to Supabase.

## Tech Stack

**Frontend**

- TypeScript, React 19
- Vite (build/dev), with a TanStack Start / Nitro configuration
- TanStack Router (file-based routing) and TanStack React Query
- Tailwind CSS v4, Radix UI primitives, `class-variance-authority`, `tw-animate-css`
- Framer Motion (animation), Lucide (icons), Recharts (charts)
- KaTeX + remark/rehype math & GFM (math and markdown rendering for problems and forum posts)
- React Hook Form + Zod (forms/validation), Sonner (toasts)

**Backend & Services**

- Supabase: PostgreSQL, Auth, Storage, Realtime, Edge Functions (Deno)
- 88 SQL migrations under `supabase/migrations/`
- 10 Edge Functions (`luna-chat`, `luna-memory`, `luna-quiz`, `luna-room`, `luna-stt`, `luna-tts`, `moderate-content`, `report`, `review-course-proposal`, `send-lifecycle-email`)
- AI via the Lovable AI gateway (Google Gemini models) — a legacy fallback being severed, see `docs/cleanup-plan.md` Phase 2a
- A lifecycle email platform (transactional/marketing email templates, design system, and send pipeline) deployed to Vercel

**Tooling**

- ESLint (type-aware), Prettier, TypeScript compiler, Vitest + Playwright + Testing Library, Husky gates; **pnpm** (the only lockfile on disk — `npm`/`bun` lockfiles were removed)

**Environment variables (client):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (the anon/publishable key). AI/service keys live server-side in the Edge Functions.

## Current State of the Product

Categorization is inferred from the presence of DB migrations, edge functions, UI routes, and wiring. The project deploys to Vercel with Supabase-managed migrations; a handful of Lovable-era pieces (see Platform Architecture above) are still being severed but no longer control deployment.

### Production Ready (built end-to-end: DB + backend + UI)

- Authentication & onboarding (Supabase Auth; username moderation).
- Knowledge Battles with ELO rating, matchmaking, bots, and ghost opponents.
- Trophy Road progression (Bronze → God) and the Ecliptar collection.
- Daily practice streak system (v2), daily challenge, milestones.
- Forum (threads/answers/comments, tags, admin view) with server-side moderation.
- Certified Courses, the Course Builder, and AI course-proposal review.
- Luna AI tutor: chat, hint ladder, voice (STT/TTS), multimodal, in-room assistant.
- Study Rooms: chat, lo-fi radio, session clock, goal/resource pin, teach-back rotation, host powers, block/report.
- Unified moderation pipeline and the verified reporting system.
- Notifications, profiles, progress dashboard, contact form.
- **Mission Control dashboard** — a personalized authenticated homepage (replacing a generic landing view) that degrades to direct-read fallbacks rather than failing if its summary RPC isn't deployed yet.
- **Global search** (⌘K palette) over forum posts, courses, and users via Postgres trigram ranking.
- **A lifecycle email platform** — transactional/marketing templates, a design system, and a send pipeline, with a local preview renderer and a real-inbox test script.
- **Pressure Mode** — a scoring engine with integrity signals and a distraction layer for high-stakes practice sessions.
- **Internationalization** — 8 locales wired through the UI via a language selector in the navbar.
- **Legal policies and consent** — a cookie/consent banner and legal document routes, alongside the proprietary repositioning noted above.
- **Ultimates** — per-Ecliptar signature battle actions (replacing the earlier generic "Wild" action) with a full status-effect system, shipped with test-first coverage.

### Functional but Evolving

- **Luna's learner model / calibration** — the calibration engine and `learner_profile` exist, but `docs/luna-learner-model.md` documents known data-plumbing bugs and an in-progress evidence-based redesign; personalization depth is still maturing.
- **Study Rooms & moderation/reporting backends** — implemented and deployed via Supabase migrations (no longer Lovable-dependent), live status not independently re-verified in this pass.
- **Adaptive testing** — referenced in code/docs (e.g., an `AdaptiveTests` component is mentioned), but it _appears_ to have been reworked or partially removed; its current status is unclear.

### Planned / Future Direction (from design docs and TODOs)

- **Ranked Mode** — a separate, seasonal, real-opponents-only skill ladder (Initiate → … → Eclipse) cleanly split from XP progression, so rank means skill (`docs/ranked-and-expedition.md`). Currently the visible progression is the XP-based Trophy Road.
- **The Expedition** — re-theming the Trophy Road into a branching "celestial Atlas of Realms" with narrative, collection sets, and infinite expansion.
- **Seasons, prestige cosmetics, and a cosmetic economy.**
- **Replay/spectator systems and CI/CD** (called out as long-term improvements in the README — automated testing itself is _not_ still future work: Vitest + Playwright are live with hundreds of passing tests, only a CI workflow to run them automatically on push/PR is still missing, see `docs/cleanup-plan.md` Phase 1).
- No monetization (payments/subscriptions) or analytics/tracking integration is present in the codebase today.

## Competitive Positioning

Compared to traditional educational platforms (Khan Academy, Coursera, typical quiz/flashcard apps) and even gamified ones (Duolingo):

- **Learning is the game mechanic, not a wrapper.** Many "gamified" apps add points/streaks around the same read-then-quiz loop. Eclipta makes academic answers _directly drive_ competitive combat, momentum, and strategy — the gamification is intrinsic, not cosmetic.
- **Competitive PvP for academics.** Real-time, ELO-rated 1v1 knowledge battles are unusual in edtech, which is mostly solo or asynchronous.
- **A tutor that withholds answers by design.** Where generic AI help tends to just solve the problem, Luna is architected around a strict hint ladder and a measured learner model — closer to a Socratic human tutor than an answer engine.
- **Collaborative, structured study rooms** with rituals like teach-back, plus a creator ecosystem (course builder) and a community forum, make it broader than a single-purpose drill app.
- **Strong, abuse-resistant safety layer** (unified moderation + verified reporting) that's more developed than typical hobby edtech projects.

It still shares the daily-streak habit loop and progression psychology with Duolingo, but combines them with real competitive depth and a cosmic collection/RPG identity.

## Quick FAQ

**What is Eclipta?**
A gamified, AI-assisted learning platform where solving academic problems powers real-time competitive battles, long-term progression, and an AI tutor that coaches reasoning instead of giving answers.

**Who is it for?**
Students and self-learners who enjoy competitive, game-like studying; friend/classmate study groups; and communities or educators experimenting with interactive learning. It covers a broad range of academic subjects.

**How is it different from other learning platforms?**
Knowledge is the gameplay — answers drive combat in "Knowledge Battles" — rather than quizzes being a side activity. It adds an answer-withholding AI tutor, real-time collaborative study rooms, a creator/course ecosystem, and a deep trust-and-safety layer.

**What role does AI play?**
AI (Luna, via Google Gemini through serverless functions) is the tutor — hints, explanations, quizzes, voice, and image/screen understanding — plus the engine behind content moderation and report re-scanning. It's pervasive but always server-side, and moderation AI is deliberately never branded as Luna.

**Why was it built?**
To test whether learning can feel like a competitive game — interactive, skill-based, and rewarding — instead of passive content consumption, while keeping genuine educational value through a tutor that makes learners do the final reasoning step.

## TL;DR

Eclipta is a gamified, AI-assisted learning web app whose core idea is that _knowledge is the gameplay_: in real-time "Knowledge Battles," correct academic answers (math, science, CS, humanities, etc.) power attacks, combos, and strategy, backed by an ELO rating ladder, bots, and ghost opponents. Around this sit a long Bronze→God "Trophy Road" with collectible creatures (Ecliptars, including boss monsters Newton and Ecliptadon), a Duolingo-style daily streak, a community forum, a course catalog with a user course-builder, and real-time Study Rooms (group chat, lo-fi radio, shared Pomodoro clock, goal pin, and a teach-back rotation). The AI tutor, **Luna**, gives hints/explanations/voice/multimodal help but is architected to _never_ hand over the final answer, and is tuned by a calibration diagnostic and a structured learner model grounded in learning science (mastery learning, cognitive load, retrieval practice, metacognition; explicitly rejecting the learning-styles myth). A deep trust-and-safety layer adds a unified two-layer (deterministic + AI) moderation pipeline and a verified reporting system where reports trigger an independent moderation re-scan rather than count-based removal. Recent additions include a personalized Mission Control dashboard, global ⌘K search, a lifecycle email platform, a high-stakes "Pressure Mode," 8-language i18n, and per-Ecliptar Ultimates (replacing the earlier generic "Wild" action) with a full status-effect system. **Stack:** React 19 + TypeScript + Vite + TanStack Router/Query + Tailwind v4 + Framer Motion on the frontend; Supabase (Postgres, Auth, Storage, Realtime, Edge Functions) on the backend, with AI via the Lovable AI gateway (Gemini) as a legacy fallback being actively severed. It originated on Lovable, now deploys to Vercel as a proprietary product, has 88 DB migrations and 10 edge functions, and is well past prototype. **Planned but not yet shipped:** a separate seasonal "Ranked Mode," re-theming progression into a branching "Expedition" Atlas of Realms, cosmetic seasons, and replay/spectator systems + a CI workflow (automated tests themselves already exist and run locally/pre-push). There is currently **no payments/subscription or analytics** integration. Brand identity is cosmic/eclipse-themed (Luna = the moon; tiers culminate in an "Eclipse").
