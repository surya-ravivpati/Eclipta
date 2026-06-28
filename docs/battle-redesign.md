# Battle System — Audit & Redesign

A first-principles audit of Eclipta's Knowledge Battles and a redesign of every
weak point, grounded in the actual implementation.

> **Status:** design record, staged for review. Phased implementation plan in
> §16–17; the low-risk slices (ability descriptions, emoji→on-brand chat, two
> balance tweaks) are shippable immediately.

> **The reframe:** the brief assumes battles are an unpolished quiz with weak
> bots, no exit friction, and a stale info panel. The code says otherwise — the
> bot AI is genuinely sophisticated, the abandon flow and info panel already
> exist, and abilities are already partly archetype-specific. The *real* gaps
> are different and deeper: **battles are math-only**, **"Practice Weak Spots"
> doesn't exist**, and **emoji are used as UI throughout** (against the brand).
> This document fixes what's actually broken and elevates what's already good.

---

## 0. Ground truth (what the code actually does)

| Area | Reality | File |
|---|---|---|
| **Questions** | **Math only** — procedurally generated arithmetic → basic algebra. "Knowledge Battles" teaches addition through exponents, nothing else. | `battles/questions.ts` |
| **Bot AI** | Sophisticated: per-turn battle memory, pattern detection, 8 personality profiles, bluffing, clutch factor, late-game ramp, anti-frustration, accuracy capped [0.42, 0.92]. | `battles/ai-brain.ts` |
| **Archetypes** | 8, with real stat trade-offs (HP, damage, multiplier, heal, time, question difficulty, focus). | `battles/archetypes.ts` |
| **Combat math** | Well-designed: focus economy (Attack/Heal build, Charge/Wild spend), self-damage scales inversely with maxHP, speed/scaling bonuses, action→difficulty mapping. | `battles/stat-mechanics.ts` |
| **Abilities** | Attack / Heal / Charge / Wild. **Already** carry per-archetype tags (`ATTACK_TAG`/`HEAL_TAG`/`CHARGE_TAG`, e.g. "combo every 2", "regen on hits too"). | `KnowledgeBattles.tsx` |
| **Chat** | Emoji reactions only: 👍👎😂😮🔥💀. No words, no quick-chat. | `KnowledgeBattles.tsx` |
| **Exit/abandon** | **Already implemented** — confirmation dialog, counts as loss, forfeits rating for ranked. | `KnowledgeBattles.tsx` ~L2591 |
| **Info panel** | **Already exists** — a how-to list (mechanics, leaving=loss, archetypes, streak). | `KnowledgeBattles.tsx` ~L3057 |
| **Practice Weak Spots** | **Does not exist.** Only a marketing mention on /about. | — |
| **Emoji as UI** | Pervasive: chat reactions, AI pressure lines (⚡🧠🩸🔥), match-start (⚔️). | `ai-brain.ts`, `KnowledgeBattles.tsx` |

**Implications that drive the redesign:**
1. The headline problem is **educational narrowness**, not polish. A math quiz
   can't deliver the all-subject mastery the platform promises, and it makes
   "Practice Weak Spots" impossible (the engine has no concept of your weak
   *concepts*).
2. The bot AI doesn't need a rewrite — it needs to be pointed at **real
   subject questions** and **de-emojified**.
3. Several requested features already exist; the work there is **refinement**,
   not construction. Honesty about that is what keeps this credible.

---

## 1. Executive Summary

Knowledge Battles is mechanically strong and unusually well-engineered for its
genre — the AI and combat math are the best parts of Eclipta. Three things hold
it back from being the defining feature:

1. **It only teaches math.** The single highest-leverage change is a
   **subject-agnostic question layer** so battles can be fought over biology,
   history, CS, languages — anything the learner studies. Everything else
   compounds off this.
2. **It doesn't close the learning loop.** Battles generate rich signal
   (missed questions, weak topics) that nothing consumes. **Practice Weak
   Spots** — a real coaching mode, not a battle redirect — is the missing half.
3. **It doesn't yet feel premium in the details.** Emoji-as-UI, terse ability
   tags, and a text-list info panel undercut an otherwise cinematic experience.

Fixing these turns a polished math quiz into a genuinely replayable,
all-subject competitive learning loop.

---

## 2. Complete Battle System Audit

**Strengths to preserve (do not "redesign" these):**
- The **focus economy** (Attack/Heal build focus; Charge/Wild spend it) gives
  Attack a real role and makes Charge a setup payoff — genuine decision depth.
- The **action→difficulty contract** (Heal = easiest question, Charge =
  hardest) means power costs risk. This is the cleverest mechanic in the system.
- **Self-damage scaling** (`hpToSelfDmgMult`) auto-balances glass cannons vs
  tanks without special-casing.
- The **AI's discoverability principle** ("I can learn it, it can learn me," no
  hidden info) is exactly right for a skill-based game.

**Core weaknesses:**
- **W1 — Math-only content.** Caps educational value and breaks weak-spot
  targeting. (§8, §17)
- **W2 — No learning loop.** Missed questions vanish; no remediation. (§8)
- **W3 — Emoji as UI.** Violates the brand system (`docs/brand-system.md`,
  "Do not use emojis") and cheapens the feel. (§9, §15)
- **W4 — God may be strictly best for skilled players.** Its only downside
  (hard questions) is exactly what experts overcome. (§6–7)
- **W5 — Tank has the lowest skill expression** — attrition with little
  decision-making. (§6–7)
- **W6 — Onboarding is a text wall**, not modern progressive disclosure. (§11)
- **W7 — Ability descriptions are terse tags**, not role-identity copy. (§12)
- **W8 — Abandon flow lacks disconnect/reconnect handling** and ranked-vs-casual
  distinction. (§10)

---

## 3. UX Audit

- **Information hierarchy in-battle is good** (fighter cards, focus bars, combo
  ticker) but the **why** is thin: a new player sees "Charge −25 Focus" without
  understanding that Charge also means a *harder question*. The cost is shown;
  the risk is not.
- **Chat is an afterthought** — six emojis with no sportsmanship framing or
  toxicity model.
- **Onboarding is opt-in and dense** — a HelpCircle that opens a list. Most
  players never read it, then don't understand focus or action-difficulty.
- **No post-battle "what to do next"** beyond rematch — the learning moment
  (you missed exponents 4 times) is dropped.
- **Emoji break the premium tone** the rest of the app worked to establish.

---

## 4. Gameplay Audit

- **Decision depth is real** but under-communicated; players discover the
  focus/risk interplay by accident, not design.
- **Match pacing is good** (tiered matchmaking live→ghost→bot).
- **Replayability is capped by content**: with finite arithmetic, the *questions*
  stop mattering quickly; only the *opponent* varies. Subject breadth + your
  own course material as the question pool is the replayability unlock.
- **Mastery reinforcement is weak**: winning rewards XP/rating but doesn't
  visibly improve your understanding of anything specific.

---

## 5. AI Bot Redesign

The AI is already excellent (memory, personalities, bluffing, clutch,
anti-frustration). **Do not rewrite it.** Three targeted upgrades:

1. **Point it at real questions (depends on §17 content layer).** Today
   "bot accuracy" simulates answering a math problem. With a subject-aware
   question bank, the same accuracy model works unchanged — but now the bot is
   "answering" biology, and the *player's* skill is subject knowledge, not
   arithmetic speed. The AI architecture needs no change; only its question
   source does.
2. **De-emojify pressure lines.** `getPressureLogLine` returns ⚡🧠🩸🔣 lines.
   Replace with typographic/worded equivalents ("Second wind — danger zone.",
   "It's reading your patterns."). Same drama, on-brand. (§15)
3. **Subject-adaptive accuracy (new, small).** Let bot accuracy vary by the
   *concept* being asked using the same `concept_mastery` store the player has —
   a "biology-strong" bot persona answers bio questions better and CS worse.
   This makes "different bots feel different" along a *knowledge* axis, not just
   a behavioral one — the deepest form of the brief's ask.

**New persona tier — named opponents.** Wrap the existing personality table in
a thin "named AI" layer (e.g. a tournament-level "Vesper" = `god` personality +
high cross-subject accuracy; a beginner "Pip" = `tank` personality + capped
accuracy). Persona = personality + accuracy profile + subject leanings + a
name/portrait. Zero engine change; pure presentation + a config table.

---

## 6. Archetype Balance Analysis

Derived from the real stats in `archetypes.ts` and `stat-mechanics.ts`. Two
numbers matter most: **bot accuracy** (avg question difficulty → how often a bot
of that class answers) and **effective durability** (HP × self-damage mult).

| Archetype | HP | Base DMG | Mult step | Heal | Q-diff (min–max) | Bot acc | Self-dmg ×@miss | Identity |
|---|---|---|---|---|---|---|---|---|
| Tank | 250 | 10 | 0.10 | — (none) | 3–7 | 0.68 | 0.50 | Attrition wall |
| Speedster | 125 | 15 (+speed) | 0.35 | 12 | 3–7 | 0.68 | ~0.93 | Tempo/burst |
| Chud | 75 | 30 | 0.30 | 22 | 6–9 | 0.58 | 1.30 | Glass cannon |
| Healer | 135 | 10 | 0.20 | 25 +regen | 2–6 | 0.72 | ~0.86 | Sustain |
| Fulcrum | 150 | 18 | 0.20 | 15 | 4–6 | 0.68 | ~0.80 | Consistent all-rounder |
| Accelerator | 160 | 13→27 | 0.15→0.40 | 18 | 3–7 | 0.68 | ~0.77 | Late-game scaler |
| Gambler | random | random | random | random | 2–9 | ~0.66 | varies | Variance |
| God | 200 | 25 | 0.20 | 15 | 8–10 | 0.51 | ~0.59 | Endgame statline |

**Findings:**

- **God is potentially strictly-best for skilled players (W4).** Its sole
  drawback is brutal questions (diff 8–10). For a player who can answer them,
  that drawback evaporates, leaving 200 HP + 25 DMG + low self-damage — superior
  on every axis. The class is partly protected by being **unlock-gated to
  endgame tiers** (it's `MonsterArchetypeKey`, tied to Trophy Road), so in
  practice only top players have it and they're matched against each other —
  but *within* that bracket it's the obvious pick. Needs a real trade-off
  beyond question difficulty.
- **Tank has the lowest skill ceiling (W5).** Easy questions + huge HP + 0.5×
  self-damage + can't-heal + lowest multiplier (0.10) = a slow, low-decision
  grind. Safe and accessible (good for newcomers) but flat — no rewarding
  mastery curve.
- **Healer risks stalling.** 25 heal + regen-on-hit + easy questions can drag
  games; low damage (10) means it wins by not losing. Fine, but watch match
  length.
- **The rest are well-balanced.** Speedster/Fulcrum/Accelerator/Chud/Gambler
  each have a clear trade-off and a distinct curve. No changes needed.

**No single archetype dominates the whole roster** thanks to question-difficulty
gating and self-damage scaling — the system is healthier than the brief assumes.
The two outliers are *skill-expression* problems (God too safe at the top, Tank
too flat at the bottom), not raw-number dominance.

---

## 7. Recommended Balance Changes

Minimal, trade-off-preserving — no numerical power creep.

1. **God — add a real cost (fixes W4).** Give God a genuine drawback that
   skilled players can't simply out-answer. Options, in preference order:
   - **No combo forgiveness:** a single miss resets momentum *and* halves Focus
     (vs. the normal reset). "Ultimate power, ultimate fragility of rhythm."
   - or **higher self-damage** (force `hpToSelfDmgMult` ≈ 1.0 for God, not
     0.59), so its big HP is offset by punishing misses.
   - or **no Heal** like Tank, leaning it into pure offense.
   This makes God a *high-skill, high-variance* pick instead of a safe stat
   upgrade.
2. **Tank — add one decision (fixes W5).** Give Tank a **Fortify** twist on
   Heal: it can't heal HP, but "Heal" instead converts to a one-turn damage
   *shield* (absorb next hit) at the cost of focus. Now Tank has a timing
   decision (when to shield) and a skill expression, without raising its damage.
3. **Healer — anti-stall.** Cap regen-on-hit to the first N turns, or reduce
   heal from 25→20, so it can't outlast indefinitely. Keep the sustain identity,
   bound the match length.

All three preserve identity and trade-offs; none is a raw buff. Ship behind the
balance section of a patch note so players see the reasoning (Riot-style).

---

## 8. Practice Weak Spots — Redesign (build, doesn't exist)

A **dedicated coaching mode**, separate from the battle queue. It reads the same
`concept_mastery` store proposed for Luna and Courses (see
`docs/luna-redesign.md` §6, `docs/courses-redesign.md` §6) — battles finally
become a *writer* to that store and weak-spot practice a *reader*.

**Data sources (ranked):**
1. **Recently missed questions** from battles (`QuestionRecord` already captures
   `{question, correct, timeSpent, action}` — persist these).
2. **Low-confidence concepts** from `concept_mastery` (struggling/developing).
3. **Recurring misconceptions** (from Luna's memory).
4. **Prerequisite gaps** (from the Courses concept DAG — a weak concept whose
   prereq is also weak surfaces the prereq first).

**The experience (not a battle):**
```
PRACTICE — your weak spots
┌────────────────────────────────────────────┐
│ Exponents          ▓▓░░░ struggling         │  ← concept, mastery state
│ You missed 4 of the last 6.                  │
│ [ Warm up (5 questions, no timer, hints) ]   │  ← low-stakes, Luna-backed
├────────────────────────────────────────────┤
│ Order of Operations   ▓▓▓░ developing        │
│ [ Warm up ]                                  │
└────────────────────────────────────────────┘
        … when ready …
   [ I'm ready — take this into battle → ]      ← smooth transition back
```

- **No timer, no opponent, no rating.** Calm, hint-first (Luna provides the
  Socratic scaffold from `docs/luna-redesign.md`). Productive struggle, not
  pressure.
- **Mastery updates live** as they practice; the bar fills.
- **Graduation:** once a concept crosses into "solid," the mode nudges
  "You've shored this up — want to test it under pressure?" → drops them into a
  battle **seeded with that concept's questions**. The loop closes:
  battle → detect weakness → coach → re-test in battle.
- **Entry points:** a Practice card on the battles idle screen (next to "Choose
  Class"), the post-battle report ("You struggled with exponents — practice
  it?"), and the Courses hub ("strengthen X first" from the readiness engine).

This is the feature that turns battles from a game with learning bolted on into
a genuine mastery loop.

---

## 9. In-Battle Chat System Design

**Verdict: unrestricted free chat is the wrong call** for an educational product
aimed at students — it's a toxicity and moderation liability with little upside
mid-battle. The current emoji-only system is the right *shape* but the wrong
*execution* (emoji violate the brand; six faces invite mockery: 💀😂).

**Design — sportsmanship-first Quick Chat (no free text):**
- A small fixed set of **worded, positive-or-neutral** quick-chat lines, sent as
  on-brand chips, not emoji: **"Good luck" · "Nice!" · "Close one" · "Well
  played" · "Tough question" · "GG"**. No insults possible by construction.
- **Rate-limited** (e.g. 1 per few turns) so it can't spam-distract.
- **Mutable** per-match (one tap to silence the opponent's chat).
- **Post-game** is the natural home for most communication — a "GG" exchange on
  the result screen, where it can't distract from a question.
- **Reactions** stay, but as **on-brand iconography** (a thumbs-up lucide icon,
  a spark) — never emoji. Tied to the §15 no-emoji cleanup.
- **Teammate / spectator chat (future):** when team modes arrive, teammate chat
  is quick-chat only during play, full(er) chat in lobby; spectators get a
  separate, moderated channel that players can't see mid-match.

Rationale: maximizes sportsmanship and "I'm playing a person" warmth, minimizes
toxicity and distraction, and fits a student audience and the brand. Communication
*enhances* the battle (a "close one" after a clutch finish) without competing
with the question.

---

## 10. Battle Exit & Abandonment Flow

Mostly **already built** (confirmation, loss, rating forfeit). Harden it:

- **Keep** the confirmation: "Leaving now counts as a loss by abandonment…"
- **Add reconnect window (ranked):** on tab-close / refresh / network drop,
  hold the match open ~30–45s with a "Reconnecting…" state for *both* players
  before declaring abandonment. A genuine disconnect shouldn't equal a rage quit.
- **Disconnect vs. quit:** distinguish an explicit "Leave" (immediate loss) from
  a dropped connection (grace window, then loss if no return). Log which.
- **Ranked vs. casual rules:** casual abandonment = no rating change, soft warning;
  ranked = rating loss + abandonment recorded. Repeated ranked abandons →
  escalating queue cooldown (rage-quit deterrent).
- **Abandonment history + rate:** track an abandon count/rate on the profile;
  surface a gentle "low abandonment" badge as a positive incentive rather than
  only punishing.
- **Opponent fairness:** the staying player always gets the win + full rating;
  never penalized for the other's exit.

---

## 11. Battle Information Panel Redesign

The info exists but is a **text list**. Replace with **progressive onboarding**:

- **First-match interactive coach mark** (one-time): 3–4 inline tips that fire
  *contextually* — when Focus first fills ("Charge is ready — it hits harder but
  asks a harder question"), on first miss ("A wrong answer breaks your combo and
  costs HP"). Learning by doing beats a wall of text.
- **The reference panel** stays available but becomes **visual + scannable**:
  - A one-screen **diagram** of the turn loop (Pick action → Answer question →
    Resolve → Opponent).
  - **Action cards** (Attack/Heal/Charge/Wild) each showing its focus effect
    *and its question difficulty* (the risk that's currently hidden).
  - A **win-condition** line, a **status/combo** line, **two strategy tips**.
- **No wall of text** — every item is a chip, an icon, or a one-liner.

Goal: a first-timer understands focus, action-risk, and win condition within the
first match, without reading anything they didn't want to.

---

## 12. Archetype-Specific Ability Descriptions

Today's per-archetype **tags** are terse ("combo every 2"). Promote them to
**role-identity descriptions** that teach playstyle on sight. One line each for
Attack / Heal / Charge, written in the archetype's fantasy. Examples:

| Archetype | Attack | Heal | Charge |
|---|---|---|---|
| **Tank** | "A measured blow — low damage, but you can throw them all day." | "No heal. Instead, brace: convert focus into a shield for the next hit." | "Slow wind-up, heavy landing. You have the HP to set it up." |
| **Chud** | "Everything, all at once. 30 damage — but you have no margin." | "A desperate patch. You're made of glass; spend it wisely." | "All-in. The hardest question for the hardest hit. Live or die." |
| **Speedster** | "Hit before they blink — faster answers cut deeper." | "A quick breath. Small, but you'll be gone before they swing." | "Burst them down while you still hold tempo." |
| **Healer** | "A soft jab — you win by outlasting, not out-hitting." | "Pour it back in: +25 HP, and you regen whenever they strike you." | "A rare burst — but every hit still feeds your sustain." |
| **Fulcrum** | "Clean, consistent damage — your combo climbs every two." | "Steady upkeep to keep the rhythm going." | "Your highest multiplier turns a combo into a finisher." |
| **Accelerator** | "Starts small, ends decisive — every answer makes the next hurt more." | "Buy time; your best turns are still ahead." | "Late-game payoff: the longer the fight, the deadlier this lands." |
| **Gambler** | "Whatever the dice gave you this match — swing with it." | "However much the roll allows — chaos cuts both ways." | "Bet it all on the hardest question. Fortune favors the bold." |
| **God** | "Precision incarnate — but only the hardest questions answer to you." | "Even gods mend — sparingly." | "The summit. Hardest question, decisive blow — miss and the rhythm shatters." |

(God's Heal/Charge copy encodes the §7 nerf: rhythm fragility.) These render in
the action buttons / class-select; the existing `ATTACK_TAG` maps become full
sentences in a `ARCHETYPE_ABILITY_COPY` table — a pure content change.

---

## 13. New UX Flows

- **Battle → weakness → coach → re-battle** (the mastery loop, §8).
- **First-match contextual onboarding** (§11) replacing the static panel.
- **Post-battle next-step**: result screen gains "Practice [weak concept]" and
  "Rematch" side by side, so the learning moment isn't dropped.
- **Subject select** (with §17): before/at class-select, pick the subject pool
  (or "Mixed", or "My weak spots"), so a battle can be about anything you study.

---

## 14. Edge Cases & Abuse Prevention

- **Rage-quit / repeat abandon** → escalating ranked queue cooldown (§10).
- **Disconnect abuse** (pulling network to dodge a loss) → the reconnect window
  still resolves to a loss if you don't return; dropping at <X% HP can be
  treated as a forfeit immediately.
- **Quick-chat spam / mockery** → fixed positive-only phrase set + rate limit +
  per-match mute (§9) makes toxicity structurally impossible.
- **Win-trading / boosting** in ranked → cap rating gain from repeat opponents
  in a short window; the matchmaking already tiers live→ghost→bot.
- **Practice-mode gaming** (farming easy concepts for mastery) → mastery only
  rises on appropriately-difficult items; trivial repeats decay-cap (reuse the
  concept_mastery confidence model).
- **Question exposure** (memorizing a finite bank) → procedural generation
  (math) + large per-subject pools + your own course content as source.

---

## 15. Visual & Interaction Improvements

- **Remove all emoji from UI** (the throughline of this redesign):
  - AI pressure lines (`ai-brain.ts`: ⚡🧠🩸🔥) → worded/typographic drama.
  - Match-start "⚔️" → a lucide Swords glyph or just the matchup text.
  - Chat reactions 👍👎😂😮🔥💀 → worded quick-chat + lucide icons (§9).
- **Surface hidden risk:** every action shows its question difficulty, not just
  its focus cost (§11).
- **Satisfying feedback** is already good (hit flashes, float numbers, combo
  ticker) — keep; ensure reduced-motion parity.
- **Premium typography/motion** already established (the `btt-*` system); the
  emoji are the one thing breaking the spell. Removing them is the highest
  ratio of polish-gained to effort.

---

## 16. Frontend Implementation Plan

Phased; early phases are low-risk and shippable on their own.

- **Phase A — Polish (low-risk, immediate):**
  - `ARCHETYPE_ABILITY_COPY` table → full role-identity descriptions (§12).
  - De-emojify pressure lines, match-start, and chat; swap emoji reactions for
    worded quick-chat + lucide icons (§9, §15).
  - Two balance tweaks (Tank Fortify-shield, God rhythm-fragility) + Healer
    regen cap (§7).
- **Phase B — Onboarding (medium):** contextual first-match coach marks + the
  visual reference panel (§11).
- **Phase C — Exit hardening (medium):** reconnect window, disconnect vs quit,
  ranked/casual rules, abandonment history (§10).
- **Phase D — Practice Weak Spots (large):** the coaching mode (§8) — depends on
  the persisted question records + concept_mastery store (Phase E).
- **Phase E — Subject content layer (large, the keystone):** see §17.

Recommended order: **A → B/C in parallel → E → D**. A delivers visible premium
polish immediately; E unlocks the educational ceiling; D closes the loop.

---

## 17. Backend & Data Model Changes

- **Subject-aware question layer (the keystone, W1).** Abstract the question
  source behind an interface so `generateQuestion` is one provider among many:
  ```ts
  interface QuestionProvider {
    subject: SubjectFamily;
    forConcept(concept: string, difficulty: Difficulty): BattleQuestion;
  }
  ```
  Sources: (1) the existing math generator, (2) **course content** (`course_blocks`
  quiz blocks already exist — the RAG path in `luna-chat` proves they're
  queryable), (3) an AI-generated bank per concept (one batch job, cached;
  reuse the AI gateway), validated and stored. The combat math, AI, and UI are
  unchanged — only the question *content* generalizes. `MathQuestion` becomes
  `BattleQuestion { prompt, answer, options, difficulty, concept, subject }`.
- **Persist question records.** Today `QuestionRecord` lives only in memory for
  the post-battle report. Write missed questions + concept outcomes to a table
  so Practice Weak Spots and `concept_mastery` can read them.
- **`concept_mastery` writes from battles.** Each resolved question is an
  observation feeding the shared mastery store (the one proposed for Luna +
  Courses). This is the unification: **battles, Luna, and Courses all read and
  write one mastery model** — every part of Eclipta makes the others smarter.
- **Abandonment + reconnect state** (§10): match status, disconnect timestamps,
  per-user abandon counters.
- **Named-AI config table** (§5): persona → personality + accuracy profile +
  subject leanings + name/portrait.

---

## 18. Additional Ideas to Make Battles Exceptional

1. **Battle over *your* course material.** Queue a battle whose questions come
   from the course you're studying — practice and competition become the same
   action. (Direct payoff of §17.)
2. **Weekly subject seasons / tournaments** (Riot/Supercell-style): a ranked
   ladder per subject, resetting seasonally, with cosmetic Ecliptar rewards.
3. **Draft / ban archetype phase** for high-tier ranked — adds a metagame layer
   on top of the existing roster.
4. **Spectate + ghost replays** (the `battle-replay` infra already exists) →
   "watch the #1 player" as aspirational, teachable content.
5. **Co-op raids vs a tough named AI boss** — teammate communication (§9) finds
   its purpose; learning becomes social.
6. **Post-battle "one thing you learned"** micro-card — converts a win into an
   explicit mastery moment (the Duolingo move).
7. **Adaptive question difficulty within a match** tied to live mastery, so a
   battle auto-calibrates to keep both players in flow.

---

## The Riot × Supercell × Blizzard × Duolingo test

> *"What would they do differently?"*

- **Riot:** publish the balance reasoning (this doc's §7) as patch notes;
  make every archetype's fantasy legible at a glance (§12); add a draft/ban meta
  (§18.3).
- **Supercell:** ruthless onboarding — teach by doing in the first match, never
  a manual (§11); short, replayable, season-driven loops (§18.2).
- **Blizzard:** make each opponent feel *authored* — named AI personas with
  identity (§5), not anonymous bots.
- **Duolingo:** never let a battle end without reinforcing what you learned
  (§18.6) and always offer the gentle next rep (Practice Weak Spots, §8).

The common thread, and this redesign's thesis: **the most competitive version of
Eclipta's battle system is also its most educational one** — because the thing
players compete on becomes the thing they actually master, across every subject
they study. Build §17 and §8 and battles stop being a math quiz with a combat
skin and become the reason people open Eclipta every day.
