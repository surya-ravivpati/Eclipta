# Eclipta

> **Proprietary and confidential.** Eclipta is proprietary software. This
> repository and its contents are not public, not open source, and not licensed
> for redistribution or reuse. Third-party components are listed at
> `/legal/notices` and remain under their own licences.

> Learn. Compete. Progress.

Eclipta is a competitive learning platform where solving problems directly affects gameplay, progression, and strategy.

---

## What is Eclipta?

Eclipta is a gamified, AI-assisted learning platform where answering academic
questions powers real-time competitive **Knowledge Battles**, long-term
progression (Trophy Road, Ecliptars, daily streaks), collaborative **Study
Rooms**, a community forum and course system, and **Luna** — an AI tutor that
coaches _how to think_ rather than handing over answers. It runs on React +
Supabase, with all AI behind serverless Edge Functions.

📄 **For a full, grounded product overview — vision, user journeys, features,
AI capabilities, educational philosophy, architecture, and current vs. planned
state — see [`PRODUCT_OVERVIEW.md`](./PRODUCT_OVERVIEW.md).** It's written to
onboard a new collaborator (or another LLM) on the project in a few minutes.

> Note: some sections further down in this README are older and may be out of
> date (for example, the repository now contains SQL migrations under
> `supabase/migrations/` and Supabase Edge Functions under
> `supabase/functions/`). `PRODUCT_OVERVIEW.md` reflects the current state.

---

# Overview

Eclipta is built around a simple idea:

> learning should feel interactive, skill-based, and rewarding.

Instead of treating quizzes as something separate from gameplay, Eclipta turns knowledge into the gameplay itself.

In battles, answers directly affect:

- attacks
- combos
- momentum
- progression
- strategy

The project combines:

- strategy-game mechanics
- adaptive learning
- AI-assisted guidance
- progression and ranking systems
- social/community features
- animated modern UI design

At the center of the platform is **Knowledge Battles** — a real-time system where educational performance changes what players can actually do during combat.

The current codebase already includes:

- real-time battle systems
- AI-assisted learning flows
- progression/ranking systems
- adaptive educational experiences
- user profiles and progression tracking
- forum/community systems
- courses and learning paths
- animated UI systems

---

# Why This Project Exists

Most educational platforms follow the same pattern:

1. read content
2. answer questions
3. move forward

Eclipta experiments with a different approach:

> what if learning felt closer to a competitive game?

The goal is to make learning:

- interactive instead of passive
- skill-based instead of repetitive
- competitive without losing educational value
- rewarding beyond grades or completion percentages

---

# Features

Eclipta is a competitive learning platform built around the idea that knowledge should directly affect gameplay.

Instead of answering questions just to move forward, your performance changes what you can actually do inside battles, progression systems, and ranked experiences.

The project mixes:

- strategy-game mechanics
- adaptive learning
- AI-assisted guidance
- progression systems
- social/community features
- modern animated UI design

At the center of the platform is **Knowledge Battles** — a real-time system where solving problems powers attacks, momentum, combos, and strategic decisions.

Current systems in the repository include:

- Competitive knowledge-based battle systems
- AI-assisted learning flows
- Adaptive educational experiences
- Trophy/progression systems
- Social and community features
- User profiles and progression tracking
- Course and learning-path infrastructure
- Animated modern UI/UX systems

## Who It's For

Eclipta is mainly designed for:

- students who enjoy competitive or game-like learning
- people who like progression/ranking systems
- classrooms or communities experimenting with interactive learning
- developers interested in educational gaming systems
- anyone exploring alternatives to traditional quiz-based learning

---

# Features

The project is still evolving, but a lot of the core systems are already functional.

## Core Gameplay & Learning

- Real-time knowledge battles
- Strategic combat mechanics powered by educational performance
- Combo, momentum, and focus systems
- AI-driven opponents and battle logic
- Adaptive learning experiences
- Trophy road and progression tracking
- Ranked and skill-based gameplay concepts

## Learning Systems

- Courses and learning paths
- AI-assisted educational guidance
- Knowledge collections and tracking
- Personalized progression systems
- Adaptive educational experiences

## Social & Community

- User profiles
- Community/forum systems
- Progress sharing
- Achievement-oriented progression

## User Experience

- Modern animated UI
- Responsive design
- Framer Motion powered transitions
- Component-driven architecture
- Real-time interactive feedback

---

# Tech Stack

## Frontend

| Technology      | Purpose                      |
| --------------- | ---------------------------- |
| TypeScript      | Primary language             |
| React 19        | UI framework                 |
| Vite            | Build tooling and dev server |
| TanStack Router | Client-side routing          |
| Tailwind CSS    | Styling system               |
| Framer Motion   | Animation and motion         |
| Lucide React    | Icon system                  |

## Backend & Services

| Technology                | Purpose              |
| ------------------------- | -------------------- |
| Supabase                  | Backend-as-a-service |
| PostgreSQL (via Supabase) | Database             |
| Supabase Auth             | Authentication       |
| Supabase Storage          | File/media storage   |

## Tooling

| Technology          | Purpose              |
| ------------------- | -------------------- |
| ESLint              | Linting              |
| TypeScript Compiler | Static type checking |
| pnpm                | Package management   |

---

# Requirements

Before running the project locally, ensure the following are installed:

| Requirement | Minimum Version |
| ----------- | --------------- |
| Node.js     | 22.13+          |
| pnpm        | 11+             |
| Git         | Latest          |

## External Services

The application expects:

- A configured Supabase project
- Supabase database access
- Supabase authentication configuration

## Supported Operating Systems

The project should work on:

- macOS
- Linux
- Windows (WSL recommended)

---

# Getting Started

## Quick Setup

```bash
# Obtain the source archive from the Eclipta engineering lead.
cd eclipta-your-smart-learning-journey
pnpm install
pnpm dev
```

Then open:

```txt
http://localhost:5173
```

---

# Installation

## 1. Clone the Repository

```bash
# Obtain the source archive from the Eclipta engineering lead.
cd eclipta-your-smart-learning-journey
```

## 2. Install Dependencies

```bash
pnpm install
```

## 3. Configure Environment Variables

Create a `.env` file in the project root.

Example:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

If the repository does not already contain one, create a `.env.example` file:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

## 4. Configure Database / Supabase

Create a Supabase project and configure:

- Authentication providers
- Database schema
- Storage buckets (if applicable)
- Row-level security policies

> Note: this section is one of the ones flagged as outdated at the top of this
> README. The repository has 88 SQL migrations under `supabase/migrations/`,
> applied via the Supabase CLI (`supabase db push`) — database setup is not
> ad hoc.

## 5. Start the Development Server

```bash
pnpm dev
```

Once the server starts, the app should usually be available at:

```txt
http://localhost:5173
```

---

# Environment Variables

**App (Vite / build-time, in `.env` and in the Vercel project):**

| Variable                        | Description                       | Required | Example                      |
| ------------------------------- | --------------------------------- | -------- | ---------------------------- |
| `VITE_SUPABASE_URL`             | Supabase project URL              | Yes      | `https://abcxyz.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable/anon API key | Yes      | `eyJhbGciOi...`              |

**Supabase Edge Function secrets** (set with `supabase secrets set …`, not in `.env`):

| Variable             | Description                                                  | Required |
| -------------------- | ------------------------------------------------------------ | -------- |
| `AI_GATEWAY_URL`     | OpenAI-compatible chat gateway base URL (e.g. OpenRouter)    | Yes\*    |
| `AI_GATEWAY_API_KEY` | API key for that gateway                                     | Yes      |
| `AI_AUDIO_URL`       | Base URL for TTS/STT (e.g. `https://api.openai.com/v1`)      | No       |
| `AI_AUDIO_API_KEY`   | API key for the audio provider (defaults to the gateway key) | No       |

> \*Until `AI_GATEWAY_URL` / `AI_GATEWAY_API_KEY` are set, the edge functions fall
> back to the legacy `LOVABLE_API_KEY` gateway so nothing breaks mid-migration.

---

# Deployment (Vercel)

The app builds to the Vercel Build Output API via nitro (no Lovable/Cloudflare
config). `pnpm build` produces `.vercel/output/`.

1. Import the repo into Vercel. Framework preset: **Other** (the build output is
   auto-detected); build command `pnpm build`.
2. Add the app env vars above to the Vercel project.
3. **Google sign-in** uses Supabase's native OAuth. In the Supabase dashboard →
   Authentication → Providers → Google, enable it and add your Google OAuth
   client ID/secret, then add your site + `…/auth/v1/callback` URLs to the
   allowed redirects (and to the Google Cloud console).
4. **Luna / moderation AI**: set the edge-function secrets above to your own
   provider, then redeploy the functions (`supabase functions deploy`). Some
   model ids may need adjusting per provider (e.g. OpenAI wants
   `gpt-4o-mini-tts`, not `openai/gpt-4o-mini-tts`).

---

# Usage

## Development

Start the local development server:

```bash
pnpm dev
```

## Production Build

Generate an optimized production build:

```bash
pnpm build
```

## Preview Production Build

```bash
pnpm preview
```

## Linting

Run ESLint:

```bash
pnpm lint
```

## Type Checking

```bash
pnpm typecheck
```

---

# Scripts

| Script         | Description                       |
| -------------- | --------------------------------- |
| `pnpm dev`     | Start Vite development server     |
| `pnpm build`   | Create production build           |
| `pnpm preview` | Preview production build locally  |
| `pnpm lint`    | Run ESLint                        |
| `pnpm test`    | Run the Vitest suite              |
| `pnpm verify`  | Everything the pre-push hook runs |

> Exact scripts may evolve over time as the platform grows.

---

# Project Structure

The codebase is mostly organized around feature systems.

Most application logic lives inside `src/`.

```txt
src/
├── components/        # Reusable UI components, including feature subfolders:
│   ├── battles/       #   Knowledge battle systems and gameplay
│   ├── forum/         #   Community/forum functionality
│   ├── landing/       #   Landing page and marketing pages
│   ├── profile/       #   User profile systems
│   └── luna/          #   AI assistant related systems
├── routes/            # Application routes (file-based, TanStack Router)
├── repositories/      # The only code allowed to call supabase.from()/.rpc()
├── db/schema/         # Drizzle schema (types only, no direct DB connection)
├── lib/               # Utilities and shared logic
├── hooks/             # Custom React hooks
├── i18n/              # Internationalization (8 locales)
├── integrations/      # Third-party service integrations
└── styles.css         # Global styles and Tailwind configuration (one file)
```

## Important Areas

### `KnowledgeBattles`

One of the core systems in the application.

Implements:

- Knowledge-driven combat
- Strategic gameplay mechanics
- Combo and momentum systems
- AI opponent logic
- Real-time progression interactions

### Routing

The application uses TanStack Router for:

- Nested routing
- Route-based layouts
- Authenticated flows
- Public/private page separation

---

# Screenshots / Demo

## Demo

> No public demo link is currently maintained (the previous one pointed at a
> retired Lovable-hosted preview). Ask the Eclipta engineering lead for
> access to a staging deployment.

## Screenshots

> we'll add this later ;)

---

# Backend / API

Eclipta does not currently include a standalone backend server.

Most backend functionality is handled through Supabase services and client-side integrations.

The project primarily functions as a frontend application integrated with Supabase services.

## Authentication

Authentication is managed through Supabase Auth.

Possible auth flows include:

- Email/password
- OAuth providers (if configured)
- Session-based authentication

## Backend Services

The frontend communicates with:

- Supabase database
- Supabase authentication APIs
- Supabase storage APIs

> No standalone REST or Express API server was identified in the repository during analysis.

---

# Development

## Recommended Workflow

1. Create a feature branch
2. Make isolated changes
3. Run linting and type checks
4. Test affected functionality
5. Request review from the Eclipta engineering lead

## Local Development Tips

### Use TypeScript Strictly

Prefer explicit typing for:

- Battle systems
- Game state logic
- API responses
- Route data

### Keep Components Modular

Some gameplay systems are currently large and complex.

As the project grows, consider splitting large gameplay components into:

- Engine/state logic
- Rendering layers
- Animation systems
- Matchmaking systems
- AI systems

#### Things That Would Improve the Project Long-Term

- a CI/CD workflow to run the existing test suite automatically on push/PR
  (Vitest + Playwright are already wired locally and pre-push — see
  `docs/cleanup-plan.md` Phase 1; this is about automation, not creating
  tests from scratch)
- replay/spectator systems
- better separation of gameplay logic from UI

---

## Branching

Suggested branching strategy:

```txt
main
 ├── feature/*
 ├── fix/*
 └── experimental/*
```

## Reporting Issues

When opening issues, include:

- Environment details
- Reproduction steps
- Expected behavior
- Screenshots/logs if applicable

---

# Troubleshooting

## Common Issues

### Environment Variables Missing

If you see Supabase connection errors:

```txt
Missing Supabase environment variables
```

Ensure your `.env` file contains:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

### Port Already In Use

If Vite fails to start:

```bash
lsof -i :5173
```

Then stop the conflicting process or change the Vite port.

### Dependency Installation Problems

Try deleting:

```txt
node_modules/
```

Then reinstall:

```bash
pnpm install
```

---

## Major Technologies

- React
- Vite
- Supabase
- Tailwind CSS
- Framer Motion
- TanStack Router

## Inspiration

The project blends concepts from:

- Competitive gaming systems
- Educational technology
- Adaptive learning platforms
- RPG progression systems
- Social learning environments

---

# TL;DR

Eclipta is an experimental learning platform where educational performance directly affects gameplay.

The core system — Knowledge Battles — turns solving problems into real-time combat mechanics:

- correct answers power attacks
- momentum affects strategy
- progression is skill-based
- learning becomes interactive instead of passive

The project currently uses:

- React 19
- TypeScript
- Vite
- Supabase
- Tailwind CSS
- Framer Motion

The codebase is still evolving, but the main gameplay systems already show the direction of the project pretty clearly.
