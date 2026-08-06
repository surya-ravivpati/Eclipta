# Docs index

What's here, what kind of document each one is, and what state it's in. Check
this before re-deriving "what's already planned" from scratch.

**Convention:** new plan/design/reference docs go in `docs/`, and get one line
added here when created. Active trackers (below) get a new dated `## Status
update — <date>` section appended near the top when their state changes —
never rewritten, and never with their old checklists edited to match a
different name for "done" than what they originally specified. Design
records stay as a single point-in-time document once their design work is
finished; if a redesign gets picked back up later, that's a new dated status
section on the same file, same rule as the trackers.

## Active trackers

Reflect current, in-progress work. Get dated status updates, not rewrites.

| Doc                                                                      | Purpose                                                                                                                                                          | Status (2026-08-05)                                                                                                                                                                                                              |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`cleanup-plan.md`](./cleanup-plan.md)                                   | Sever the Lovable platform dependency, fix silently-swallowed errors, remove dead weight (~12 MB, unused deps, orphan components), split `KnowledgeBattles.tsx`. | In progress. Phases 0, 3b, 3e, 5 done (2026-08-06); Phases 1 (CI), 2a (Lovable AI fallback), 3c (AI rate-limiting), 3d (edge-auth consolidation), 4 (dependency/shadcn pruning), 6 (file split), 7 (component tests) still open. |
| [`vertical-slice-migration-plan.md`](./vertical-slice-migration-plan.md) | Migrate every domain onto typed Drizzle schemas + a repository layer, one vertical slice at a time (`AGENTS.md`'s database rule).                                | In progress. Battles, profile, and courses domains done. Forum, moderation, study rooms, Luna, and notifications not started.                                                                                                    |

## Design records

Point-in-time redesigns/audits. Each is explicit about its own status —
check the doc itself for how much of it (if any) has shipped rather than
assuming from this table.

| Doc                                                      | Covers                                                                                                                                                                    | Shipped?                                                                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| [`battle-redesign.md`](./battle-redesign.md)             | Battle loading intro, per-Ecliptar Ultimates + status effects, and a further staged redesign (weak-spot practice, subject-agnostic questions, emoji removal, quick-chat). | Partially — the loading intro and Ultimates sections are live and accurate to shipped code; the rest is still staged, unshipped. |
| [`courses-redesign.md`](./courses-redesign.md)           | Collapsing Certified + Community courses into one unified Courses hub.                                                                                                    | Shipped (the `/certified` → `/courses` redirect, unified nav).                                                                   |
| [`luna-redesign.md`](./luna-redesign.md)                 | Luna tutor architecture redesign.                                                                                                                                         | Not shipped — design record only.                                                                                                |
| [`luna-learner-model.md`](./luna-learner-model.md)       | Learner-model defects audit + evidence-based redesign proposal.                                                                                                           | Not shipped — audit + design record only.                                                                                        |
| [`ranked-and-expedition.md`](./ranked-and-expedition.md) | A separate seasonal Ranked Mode and re-theming Trophy Road into a branching "Expedition."                                                                                 | Not shipped — design record only.                                                                                                |
| [`trophy-road-redesign.md`](./trophy-road-redesign.md)   | Trophy Road progression redesign.                                                                                                                                         | Not shipped — design record only.                                                                                                |

## Reference

Standing reference material, not tied to a specific piece of work.

| Doc                                                      | Purpose                                                                                            |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [`brand-system.md`](./brand-system.md)                   | Visual identity, tone, and brand language reference.                                               |
| [`daily-practice-streak.md`](./daily-practice-streak.md) | Daily streak system reference; companion to `trophy-road-redesign.md` and `luna-learner-model.md`. |

## Outside `docs/`

- [`../AGENTS.md`](../AGENTS.md) — binding engineering rules (stack, typing, TDD, comments, database access, commit gates). Read this first; it points back here.
- [`../PRODUCT_OVERVIEW.md`](../PRODUCT_OVERVIEW.md) — product-level overview (vision, features, architecture, current vs. planned state) for onboarding a new collaborator or another LLM.
- [`../README.md`](../README.md) — setup/run instructions.
