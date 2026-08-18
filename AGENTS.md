# AGENTS.md — Rules for Eclipta

Rules an agent (or human) must follow when writing code here. Short and
checkable on purpose. Where a rule needs background, `CLAUDE FILES/core.md`,
`typescript.md`, and `security.md` hold the long form.

## Plan & design docs

Before assuming something isn't planned, or re-deriving project status from
scratch, check [`docs/README.md`](./docs/README.md) — it indexes every
plan/design/reference doc in `docs/`, what kind each one is, and its current
status. Active trackers there (`cleanup-plan.md`,
`vertical-slice-migration-plan.md`) get a new dated status section appended
when their state changes; check those before trusting an old checklist item.

## The stack (decided — do not re-litigate)

- **TanStack Start + TanStack Router** own routing and server rendering. Not
  Next.js. Do not migrate.
- **shadcn/ui** for every UI primitive. Install via the CLI. Never hand-roll a
  button, dialog, dropdown, or anything else shadcn already ships.
- **Framer Motion** for animation. Never hand-roll animation logic.
- **TanStack Query** for all server data. Never fetch in a bare `useEffect`.
- **Drizzle** defines the database schema and derives all database types.
- **Supabase client** executes the queries, so Row Level Security still applies.
- **pnpm** manages packages. Never `npm`, never `yarn`, never `bun`.
- **uv** manages Python packages, if Python ever lands here. Never `pip`.
- **Turborepo** runs tasks. One monolith. No microservices.

## Don't rebuild what exists

Before writing a utility, search npm. If a well-maintained library solves it,
use the library. We are not better at date math, virtual scrolling, or drag and
drop than the people who spent years on those problems. Wrap the library behind
our own small interface so swapping it later touches one file.

## Types

- `strict` stays on. Every new strict flag we enable stays enabled.
- No `any`. If the type is unknown, use `unknown` and narrow it.
- No `as` to silence the compiler. Type assertions are a last resort and need a
  reason next to them.
- No `@ts-ignore` / `@ts-expect-error` in new code.
- Every function that crosses a module boundary gets an exported, named
  interface for its arguments and its return value.
- Every data shape crossing a boundary — module to module, client to server,
  us to a third-party API — gets an exported type. When one side changes, the
  compiler must break the other side loudly.
- Validate all external input with **Zod** at the boundary, then trust it
  inside. External means: forms, API responses, URL params, env vars, LLM
  output, database rows arriving from an untyped path.

## Tests — TDD is not optional

- Red, green, refactor. Write the failing test first. Watch it fail. Make it
  pass. Then clean up.
- No production code without a failing test that demanded it.
- Never refactor while a test is red.
- Three levels, all required:
  - **Unit** — pure functions and logic. Fast, no I/O. Vitest.
  - **Integration** — modules talking to each other, repositories against a
    real test database. Vitest.
  - **End-to-end** — real browser, real user flow. Playwright.
- Tests are F.I.R.S.T.: Fast, Independent, Repeatable, Self-validating, Timely.
- One concept per test. Fresh data per test. Never depend on run order.
- Found a bug? Write the test that reproduces it _before_ fixing it.
- Never delete a failing test to make a feature pass.
- One test file per module. Check for an existing one before writing a new
  one — `foo.test.ts` and `foo.integration.test.ts` for the same module is one
  file too many, and the second gets written because nobody looked.
- `.integration.test.ts` / `.test.tsx` run in jsdom and are much slower to
  start. Use them only when the code genuinely needs a DOM. Logic that happens
  to live in a component belongs in a `.ts` module that a unit test can reach.

### The coverage gate

`scripts/coverage-ratchet.mjs`, run from pre-commit against the staged diff:

1. **No file you touch may lose coverage.** Recorded per file in
   `coverage-baseline.json`. Adding untested code to a covered file fails, and
   testing something else does not offset it.
2. **A new production file must reach 60%.** New code is where choosing to make
   it testable is still free.
3. **The project total may never fall.**

It used to demand a flat +1pp on the project total per commit. That took
coverage from 11.8% to 24.5% and then stopped measuring the right thing: 89% of
what remains uncovered is JSX, so the cheapest way to buy a point became writing
tests for a module you were _not_ changing. The per-file rule is stricter where
it counts and costs nothing when you edit a legacy component.

## Comments

Only four kinds of comment are allowed:

1. Legal notices
2. `TODO:` with an owner or issue reference
3. Compliance and regulatory notes
4. A genuine _why_ that the code cannot express — a warning about consequences,
   or a non-obvious constraint

Never write a comment that restates what the code does. Never narrate the task
or the implementation. Never leave debugging notes. Never comment out code —
git remembers it. If code needs a comment to be understood, rename things or
split the function until it doesn't.

## Functions and structure

- A function does one thing, at one level of abstraction.
- Small, then smaller. Length follows from doing one thing.
- Name a function for what it returns; name a procedure with a verb and object.
- Few arguments. Three needs justification. Bundle related ones into an object.
- No boolean flag arguments. A flag means it's two functions.
- Commands do something. Queries answer something. Never both.
- Nesting stops around three levels. Use guard clauses and early returns.
- Feature-based directories: behavior sits with its types, schema, and tests.

## Duplication and abstraction

- Every piece of knowledge lives in exactly one place.
- But don't abstract from one example. Wait for the second concrete case — an
  abstraction shaped by a guess is worse than visible duplication.

## Database

- Drizzle owns schema definition and type derivation.
- Queries live in typed repository modules under `src/repositories/`. Components
  and routes never call `supabase.from()` or `supabase.rpc()` directly.
- Row Level Security is the authorization boundary. Never bypass it with a
  privileged Postgres connection unless the equivalent checks are re-implemented
  server-side first.
- Every schema change is a reversible migration.
- Constraints in the schema: uniqueness, foreign keys, required fields, ranges.
  Bad data should be impossible, not merely unlikely.
- Select only needed fields. Paginate every list query.

## Tuning

Anything a human might want to adjust without a code change is configuration,
not code. XP curves, Elo K-factors, battle stat mechanics, mastery decay rates,
Luna prompts, model IDs, temperature — all of it lives in typed, Zod-validated
config, in one place, not scattered as magic numbers.

## Config and secrets

- Parse and validate every environment variable once, in one module, at startup.
- Fail loudly at boot if something is missing or malformed.
- Import config from that module. Never read `process.env`, `import.meta.env`,
  or `Deno.env` anywhere else.
- Secrets stay server-side. Never ship one to the browser.

## Errors and logging

- Validate at the boundary. Fail early and explicitly.
- Throw exceptions; don't return error codes. Give every exception enough
  context to find its source.
- Don't return null and don't pass null. Return an empty collection or a
  special-case object.
- Attribute blame: classify each failure as client, server, network, or third
  party, map it to the right status code, and say what the user can do.
- Never swallow an error silently.
- Structured logger, created once, imported everywhere. No `console.log` in
  production code.

## The gates, and how the ratchets work

Two quality bars run side by side.

**Hard gates — must always be zero, block every push:**

- `pnpm typecheck` — zero TypeScript errors against `tsconfig.json`
- `pnpm lint` — zero ESLint errors
- `pnpm test` — unit and integration suites green

**Ratchets — the count may fall, never rise:**

- `pnpm typecheck:ratchet` — errors under `tsconfig.strict.json`, the stricter
  flags the codebase has not fully earned yet. Baseline in
  `typecheck-baseline.json`.
- `pnpm lint:ratchet` — ESLint _warnings_. Baseline in `lint-baseline.json`.

A rule is set to "warn" only because legacy code still breaks it. New code must
not add violations — the ratchet fails the push if the total climbs. When you
drive a count down, the baseline file updates automatically; commit it. When a
rule reaches zero, promote it to "error" (ESLint) or move the flag into
`tsconfig.json` (TypeScript), and delete it from the aspirational list.

This is why the hard gates stay green from day one: a gate that is always red
teaches everyone to ignore it.

Run everything the pre-push hook runs with `pnpm verify`.

## Windows and OneDrive: path casing

This repo lives under `C:\Users\persw\OneDrive\Desktop\`. Always work from that
exact capitalisation. Windows opens the folder under any casing, but pnpm bakes
whatever spelling you used into its `node_modules` symlinks, while Vite resolves
its root canonically. Two spellings of the same path become two module
identities — which shows up as `Cannot read properties of null (reading
'useMemo')`, because React and react-dom end up as separate copies.

If that error appears: `rm -rf node_modules && pnpm install`, run from the
correctly-cased path.

## Linting and gates

- ESLint with type-aware TypeScript rules. Prettier owns formatting; never
  format by hand.
- Ruff for Python, if Python lands here.
- Husky runs the gates. Nothing broken reaches `main`:
  - **pre-commit** — format and lint staged files
  - **pre-push** — typecheck and the full test suite
- Never skip a hook. If a hook fails, fix the cause.

## Performance

- Correct and clear first. Optimize only after measuring.
- Profile to find the real hot spot. Measure again after to confirm it helped.
- Server state belongs to TanStack Query. Client state stays local and small.
- Keep state at the lowest level that works. Hoisting multiplies rerenders.

## Working style

- Explain each technology from first principles when it first comes up — what
  problem it exists to solve, then how it's used.
- Simple English. Keep the detail; drop the padding and the jargon.
- When a bug appears, explain what happened, why it happened, and what it would
  have cost if it shipped.
- Bring design decisions to the user — low-level, system, and product design.
- Fix broken windows when you see them. Leave code cleaner than you found it.
- Delete dead code immediately. It lies to the next reader.
