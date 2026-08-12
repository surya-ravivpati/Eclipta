# Eclipta — Trophy Road Redesign

**A first-principles progression system for a competitive learning platform.**

Status: design document / blueprint. Scope: the player-facing progression
spine of Eclipta — XP/mastery track, competitive ladder, rewards, seasons,
retention, monetization. Grounded in the systems that already exist in this
repository; every recommendation maps to a concrete table, RPC, or component.

> **Superseded in part (2026-08-12): Ghost PvP no longer exists.** Matchmaking
> is now `Live → Bot`; `get_ghost_session` and `complete_ghost_battle` were
> dropped in `20260812000000_remove-ghost-pvp.sql`. Every recommendation below
> that leans on ghost replays — ghost-only onboarding, ghost-based tilt
> protection, the ghost matchmaking window — needs a bot-based equivalent
> instead. `battle_sessions` itself is untouched and still records every match.

---

## 0. How to read this document

This is not a generic "best practices" essay. It starts from what Eclipta
_actually ships today_, names the structural problem, and rebuilds the
progression spine around it. References to real code:

| System                          | Where it lives today                                                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| XP "Trophy Road" track          | `src/lib/trophy-road-data.ts`, `src/components/TrophyRoad.tsx`                                                          |
| XP economy / awards             | `award_xp`, `award_battle_xp`, `claim_chest` (migration `20260510013726…`, `20260510000005_redesigned-trophy-road.sql`) |
| Competitive rating (ELO)        | `player_ratings`, `update_pvp_rating`, `find_pvp_match`, `get_ghost_session` (`20260510000006_pvp-architecture.sql`)    |
| Collectible rewards (Ecliptars) | `user_ecliptars`, `claim_ecliptar`, `src/lib/ecliptars.ts`                                                              |
| Archetype skill meta            | `archetype_mastery` (`20260510000002_archetype-mastery.sql`), `use-archetype-mastery.ts`                                |
| Streaks                         | `user_profiles.current_streak`, `best_streak`                                                                           |
| AI tutor                        | Luna (`supabase/functions/luna-*`, `src/components/luna/*`)                                                             |

---

## 1. Executive Summary

### 1.1 The core finding

Eclipta currently runs **two progression spines that do not touch each other**:

1. **The "Trophy Road"** is, mechanically, a _cumulative-XP reward track_.
   58 nodes, 8 tiers (Bronze → God), 0 → 800,000 XP. XP only ever goes **up**
   (`UPDATE … SET xp = xp + v_amount`). It carries the _names_ of a
   competitive ladder (Bronze, Silver, Gold, … God) but has **none of its
   mechanics**: no loss, no tension, no matchmaking coupling, no seasons. It is
   a Battle-Pass-shaped object wearing a ranked-ladder costume.

2. **The ELO ladder** (`player_ratings`) is the _real_ competitive system —
   gain/loss, hidden expectation math, peak tracking, a `season` column, a
   rating leaderboard. But it is **invisible inside the Trophy Road** and
   **disconnected from every reward**. A player can be #1 on the rating
   leaderboard and see nothing for it on the road; a player can max the road
   purely by grinding lessons and never win a PvP match.

**This split is the central design problem.** The system that creates
_anticipation and collection satisfaction_ (XP track) has no stakes, and the
system that creates _stakes and status_ (ELO) has no rewards or narrative. Each
is half a progression system. Neither, alone, produces "just one more match."

### 1.2 The thesis

> Stop forcing one track to do two psychological jobs. Run **two coupled
> spines** with opposite loss-rules, and let skill and dedication each unlock
> the other.

- **The Ascent** (rebrand of the current XP road): _permanent, never lost._
  This is the journey, the collection, the endowed-progress engine. It rewards
  **dedication and learning**. Because Eclipta is an education product, the
  learning track must be **loss-proof** — punishing failed _learning_ attempts
  would suppress the exact behavior the product exists to create.

- **The Trophy Ladder** (built on the existing ELO `player_ratings`):
  _seasonal, gain-and-loss, prestige-bearing._ This is where loss aversion,
  tension, status signaling, and competitive integrity live. It rewards
  **skill under pressure**.

- **The Bridge:** the Ladder gates and accelerates the Ascent (skill earns
  faster mastery); the Ascent unlocks the _tools_ (Ecliptars/archetypes) that
  let a player express skill on the Ladder. Crucially, the tools are
  **sidegrades, not upgrades** — so the Ladder stays skill-based and the
  product stays not-pay-to-win.

### 1.3 What success looks like

| Goal                     | Lever in this design                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| Long-term retention      | Loss-proof Ascent + infinite seasonal Ladder + collection meta                                 |
| DAU / session frequency  | Daily quests tied to streaks (`current_streak` already exists), comeback bonus, season urgency |
| Progression satisfaction | Goal-gradient pacing on the Ascent, knowledge-weighted trophies on the Ladder                  |
| Competitive integrity    | Hidden MMR, accuracy-weighted deltas, smurf acceleration, decay at top                         |
| Monetization             | Cosmetic-only Scholar's Pass + learning-boost (never power)                                    |
| Social status            | Seasonal badges, peak-league flair, clan/rivalry ladders                                       |

---

## 2. Progression Framework — the full player journey

Three intertwined currencies, each with a distinct psychological job. Keeping
them _named differently_ is half the battle; today "trophies", "XP", and
"rating" are conceptually blurred.

| Currency                                  | Job                                                         | Loss rule              | Earned by                               | Today                                            |
| ----------------------------------------- | ----------------------------------------------------------- | ---------------------- | --------------------------------------- | ------------------------------------------------ |
| **XP → Ascent Marks**                     | "How far I've come." Permanent journey + collection.        | Never decreases        | Any learning or battle activity         | `user_profiles.xp`                               |
| **Trophies**                              | "How good I am _right now_." Seasonal competitive standing. | Won and lost per match | Ranked PvP outcomes (accuracy-weighted) | _new display layer over_ `player_ratings.rating` |
| **Mastery (per-archetype / per-subject)** | "What I've mastered." Horizontal collection.                | Never decreases        | Repeated skilled use of a tool/topic    | `archetype_mastery`                              |

### The journey, stage by stage

**Stage 0 — Onboarding (first session, 0–500 XP).**
Endowed Progress: the player starts the Ascent already showing **Bronze I
cleared** and the first node (Speedster) within reach at 400 XP — a finish line
they're _already moving toward_, not a blank bar. First PvP is **always a ghost
match** (`get_ghost_session`) so a real human never stomps a brand-new player.
First-win Ecliptar claim happens inside the first 10 minutes.

**Stage 1 — Acceleration (Bronze → Gold, ~0–38k XP / Trophies 0–1400).**
Fast, generous, frequent rewards. Trophy gains are large and losses are small
(see §3). The goal is to manufacture momentum and teach the loop. Every 1–2
matches hits a node. This is the "training grounds" band that already exists.

**Stage 2 — Skill filtering (Diamond → Champion, ~70k–240k XP / Trophies
1400–4000).** Matches get closer, trophy deltas symmetrize, and the _knowledge
weighting_ starts to bite — winning sloppily yields less than winning cleanly.
This is where the population spreads out by genuine skill. The Ascent slows but
each node is bigger (boss encounters, double chests).

**Stage 3 — Prestige (Unreal → God, 265k+ XP / Trophies 4000+).** Ladder
becomes zero-sum and seasonal: trophies above the Champion floor reset each
season; the Ascent does not. The two final monsters (Newton, Ecliptadon) and
God Tier are _permanent legacy_ on the Ascent — earned once, kept forever —
while the seasonal leaderboard is the renewable status race. Aspirational,
visible to all, achieved by few.

---

## 3. Trophy Mathematics

The existing ELO update (`update_pvp_rating`) is a fine _hidden_ engine. The
redesign keeps ELO as **hidden MMR** and surfaces **Trophies** as the
player-facing number — the Clash-Royale separation, adapted for a learning game
by weighting on **accuracy**, not just win/loss.

### 3.1 Why two numbers (MMR + Trophies)

- **MMR (hidden)** decides _who you play_ and _how fast you climb_. It is the
  existing `rating` field with its `EXPECTED = 1/(1+10^((opp−me)/400))` and
  `K = 32` (first 20 games) → `16`. Keep it. It is correct.
- **Trophies (visible)** decide _what you've shown the world_. They move in the
  _direction_ of the match result but their _magnitude_ is shaped by MMR
  (catch-up) and accuracy (integrity).

Players hate "I won and lost trophies." So Trophies obey a hard rule:
**a win never loses trophies; a loss never gains them.** MMR can do the subtle
correction underneath; Trophies stay legible.

### 3.2 The trophy delta formula

```
ΔTrophies =  outcome_base                      // ±30 baseline
           × mmr_catchup(mmr, opp_mmr)          // 0.5 … 1.5
           × knowledge_weight(accuracy, won)    // 0.6 … 1.3   ← Eclipta-specific
           + streak_bonus(win_streak, won)      // 0 … +20
           − tilt_relief(loss_streak, won)      // softens losses, never below floor
```

Component definitions:

- **`outcome_base`** = `+30` on a win, `−30` on a loss. Early arenas (below the
  Gold floor) use `+32 / −16` — asymmetric _gain-heavy_ to manufacture early
  momentum (acceleration). At Champion+ it becomes symmetric `+30 / −30`
  (skill filter). This mirrors the asymmetry good ladders use.

- **`mmr_catchup`** = clamp of `1 + (mmr − trophy_implied_mmr)/800`, in
  `[0.5, 1.5]`. If your hidden MMR says you're better than your trophy count
  shows, wins pay extra and losses cost less — you converge to your true rank
  fast. This is the smurf/placement accelerator (see §8) and the comeback
  mechanic in one.

- **`knowledge_weight`** _(the Eclipta innovation)_ — because battles are driven
  by answering questions, the trophy result is weighted by **answer accuracy**:
  - On a **win**: `0.7 + 0.6 × accuracy` → a flawless win pays ~1.3×, a scrappy
    50%-accuracy win pays ~1.0×. You can win on momentum but you climb fastest
    by actually _knowing the material_.
  - On a **loss**: `1.3 − 0.7 × accuracy` → losing while answering well costs
    _less_ (you were close / unlucky), losing while answering poorly costs full.
    This is the mechanic that keeps the competitive ladder honestly coupled to
    _learning_, which is the whole point of the product. It is not present in any
    of the reference games because they aren't knowledge games.

- **`streak_bonus`** = `min(20, 5 × (win_streak − 2))` on wins only, starting at
  the 3rd consecutive win. Rewards hot streaks (competence loop) without letting
  a single session rocket someone past their skill.

- **`tilt_relief`** = on a loss, if `loss_streak ≥ 3`, multiply the _loss_
  magnitude by `0.6`. Caps the bleeding during a bad run so players don't
  rage-quit (see §6). Never converts a loss into a gain.

### 3.3 Trophy floors (loss aversion done humanely)

Each **league gate** is a floor. Once you reach Gold (1400), you can never drop
below 1400 _this season_, even on a loss streak. This is the single most
important anti-rage mechanic on the ladder: it converts "I might lose everything"
(toxic loss aversion) into "I'm locked in at Gold, now I'm climbing for
Diamond" (productive loss aversion). Floors are at every league entry, not every
sub-tier, so there's still real intra-league tension.

### 3.4 Why each decision, psychologically

| Decision                         | Mechanism                          | Effect                                              |
| -------------------------------- | ---------------------------------- | --------------------------------------------------- |
| Gain-heavy early, symmetric late | Goal-gradient + endowed progress   | Fast dopamine onboarding, honest skill filter later |
| Hidden MMR ≠ visible Trophies    | Cognitive legibility               | "Won ⇒ gained" always holds; no betrayal feeling    |
| Accuracy weighting               | Competence + product alignment     | Climbing _is_ learning; can't brute-force rank      |
| Streak bonus                     | Variable-ratio reinforcement       | "One more — I'm on a roll"                          |
| Floors                           | Endowment + loss aversion (framed) | Protects status, redirects fear into ambition       |
| Tilt relief                      | Loss-aversion mitigation           | Prevents the rage-quit spiral                       |

**Risk:** accuracy weighting could feel like "I won but barely moved."
**Mitigation:** the floor is `0.7×`, never below ~`+21` on a win — a win always
_feels_ like a win; accuracy only governs the _bonus_, never erases the gain.

---

## 4. Arena Structure

Reuse the existing 8 tiers, but split their two jobs: the **Ascent** keeps the
XP thresholds (permanent chapters); the **Ladder** maps the same names to
**trophy ranges** (seasonal leagues). Same vocabulary, two surfaces — so the
player never relearns the world, but now "Gold" means something on both axes.

| League                     | Trophies  | Ascent XP gate (today) | Theme               | Emotional purpose      | New mechanic introduced                           |
| -------------------------- | --------- | ---------------------- | ------------------- | ---------------------- | ------------------------------------------------- |
| **Bronze — Origin**        | 0–600     | 0                      | Foundations, dawn   | Safety, first wins     | Ghost-only matches; no losses below 0             |
| **Silver — Apprentice**    | 600–1400  | 7,500                  | The forge           | First real discipline  | Win-streak bonus unlocks                          |
| **Gold — Crucible**        | 1400–2200 | 20,000                 | Pressure & heat     | "I'm getting good"     | First floor; ranked seasons begin counting        |
| **Diamond — Resonance**    | 2200–3000 | 43,000                 | Crystalline clarity | Mastery solidifies     | Accuracy weighting tightens; placement matches    |
| **Platinum — Architect**   | 3000–4000 | 78,000                 | Signature craft     | Identity / status      | Subject sub-ladders surface (§11)                 |
| **Champion — Vanguard**    | 4000–5200 | 145,000                | Carry the standard  | Leadership, visibility | Seasonal reset begins here; clan ranked           |
| **Unreal — Transcendence** | 5200–6800 | 265,000                | Beyond the curve    | Rarity, awe            | Decay timer (anti-camping); leaderboard cosmetics |
| **God — Apotheosis**       | 6800+     | 460,000                | The threshold       | Legend                 | Global ranked numbering (#1, #2…), legacy banner  |

Each league is a _scene cut_ — the existing `CinemaRoad` already does this
beautifully (per-tier aurora color, blur-in headline, watermark). The redesign
asks only that the **divider also shows the player's live trophy standing in
that league**, so the cinematic road becomes a status surface, not just a
catalog of locked nodes.

**Design rule:** there must _always_ be a visible next thing. Within a league,
that's the next sub-tier and the next Ascent node; at a league boundary, it's
the new world + its exclusive cosmetic. The road already encodes this; the
Ladder layer reinforces it with the floor-to-next-floor bar.

---

## 5. Reward Architecture

### 5.1 The current reward problem

Today, chests reward **bonus XP** (`claim_chest`: 75 → 5,500 XP). That is
**circular** — the reward for gaining XP is more XP, which is the least exciting
possible payout (it's just fast-forwarding the same bar). The genuinely exciting
rewards — **Ecliptars** (collectible battle creatures, `user_ecliptars`) — are
underused as a reward type, appearing only on `monster`/`final` nodes.

### 5.2 Reward taxonomy (diversify hard)

| Reward type                                                  | Psychological job       | Cadence                | Source                             |
| ------------------------------------------------------------ | ----------------------- | ---------------------- | ---------------------------------- |
| **Ascent Marks (XP)**                                        | Steady progress fuel    | Every action           | already `award_xp`                 |
| **Ecliptars** (tools)                                        | Collection + capability | Macro (per tier)       | `claim_ecliptar`                   |
| **Ecliptar skins / variants**                                | Status, no power        | Macro + seasonal       | _new_ (cosmetic on existing slugs) |
| **Profile flair / banners / titles**                         | Social signaling        | League-up + season-end | _new_                              |
| **Chest contents → reroll tokens, skin shards, Luna boosts** | Variable reward         | Micro                  | extend `claim_chest`               |
| **Seasonal exclusives**                                      | FOMO / urgency          | Season cadence         | _new_                              |

### 5.3 Micro vs macro spacing

- **Micro (every match / lesson):** XP + small variable drop. Target dopamine
  cadence ≈ a meaningful "ding" every **2–4 minutes** of activity. The existing
  `award_battle_xp` (correct×15 + 50 win bonus, cap 1000) is the micro engine —
  good. Add a **variable** micro-drop (reroll token, skin shard) with a
  published drop table to convert flat XP into a _surprise_.
- **Macro (per league / per ~5 nodes):** a _named_ reward the player anticipated
  — a new Ecliptar, a league banner, a season cosmetic. Macro rewards should be
  **previewed** ("Reach Gold to unlock the Crucible banner") to drive the
  goal-gradient sprint.

### 5.4 Reward escalation

Escalation must be **qualitative, not just numeric.** Going Bronze→Silver
shouldn't be "75 XP → 150 XP"; it should be "a chest → a chest _plus your first
animated Ecliptar skin_." Numeric-only escalation habituates fast (hedonic
treadmill); category unlocks ("you can now _do_ a new thing") don't.

### 5.5 Fix the chest

Replace pure-XP chests with **mixed chests**: a guaranteed XP floor (keeps the
existing feel) + a variable slot drawing from {skin shard, reroll token, Luna
deep-session pass, profile flair}. Implement as a server-side weighted table in
the existing `claim_chest` RPC so it stays exploit-proof (clients still can't
inject rewards).

---

## 6. Psychological Design Analysis

For each hook: **why it works → behavior it drives → risk → mitigation.**

**Goal-Gradient Effect.** Effort accelerates near a goal.
→ Behavior: the "just one more node" sprint near a league boundary.
→ Use: the league-floor-to-next-floor bar and previewed macro rewards.
→ Risk: post-goal slump after hitting the boundary.
→ Mitigation: immediately reveal the _next_ world at the moment of unlock (the
existing scene-cut). Never let the screen go "blank-next."

**Endowed Progress.** People finish tracks they're already "into."
→ Behavior: completing onboarding instead of bouncing.
→ Use: start every player with Bronze I shown as _cleared_ and the bar pre-filled
a sliver.
→ Risk: feels fake if overdone.
→ Mitigation: ground it in a genuine first action ("you earned this by signing
up + first answer").

**Variable Reward Scheduling.** Unpredictable rewards are stickier than fixed.
→ Behavior: repeat play to "see what drops."
→ Use: the variable chest slot and micro-drops.
→ Risk: drifts toward gambling/loot-box ethics — **especially unacceptable in a
product for students.**
→ Mitigation: **no paid randomness, ever.** Variable drops are _earned-only_,
drop tables are _public_, and pity timers guarantee the rare item within N opens.
This is a hard ethical line for an education platform (see §9).

**Loss Aversion.** Losing hurts ~2× as much as gaining feels good.
→ Behavior: protecting status keeps players logging in.
→ Use: seasonal trophies + floors.
→ Risk: toxic if unbounded (rage-quit, anxiety) — and doubly dangerous in
learning, where fear suppresses attempt-rate.
→ Mitigation: **the learning track (Ascent) is loss-proof.** Loss aversion is
quarantined to the _competitive_ ladder, with floors and tilt-relief. You can
never lose _learning progress_ — only _seasonal standing_.

**Competence Loops.** Visible skill growth is intrinsically motivating.
→ Behavior: deliberate practice.
→ Use: `archetype_mastery` + accuracy-weighted trophies + post-match "you
answered 92% — your best on Calculus."
→ Risk: plateau frustration.
→ Mitigation: surface _sub-skill_ growth (per-subject mastery) so there's always
a dimension still climbing.

**Status Signaling & Social Comparison.** Rank is currency among peers.
→ Behavior: chasing visible rank, sharing achievements.
→ Use: league banners, seasonal badges, global God-tier numbering, leaderboard.
→ Risk: demoralizes the bottom 90%.
→ Mitigation: _local_ comparison (clan/friends leaderboards) and _personal-best_
framing for most players; global ranks reserved for the top leagues.

**Collection Completion.** Open sets compel closure.
→ Behavior: "I need the last 2 Ecliptars / the full season set."
→ Use: archetype roster, seasonal skin sets with a visible "7/8" tracker.
→ Risk: completionist burnout / pay-to-skip pressure.
→ Mitigation: every collectible is **earnable for free**; sets are themed and
_retire gracefully_ (legacy slot) so missing one isn't permanent failure anxiety.

---

## 7. Seasonal Structure

The schema is _already_ season-aware: `player_ratings.season`, `peak_rating`.
There is no reset logic yet. Add it.

### 7.1 Cadence

- **Season length: 28 days** (4 weeks). Long enough to climb meaningfully, short
  enough to create recurring urgency and a fresh "this season I'll hit Diamond."
- Tie season boundaries to a **"Season Finals" weekend** (double trophy stakes)
  to spike end-of-season DAU.

### 7.2 The soft reset

Only trophies **above the Champion floor (4000)** reset; everything at/below is
sticky (protects the casual majority from feeling demoted). Above the floor:

```
new_trophies = floor + (peak_or_current − floor) × 0.45
```

A Champion at 5,000 starts the next season at `4000 + 1000×0.45 = 4450` — still
clearly Champion, but with a real climb back. This is the Clash-style
compression: it re-injects ladder tension monthly without erasing identity.
**MMR (`rating`) does NOT reset** — matchmaking stays accurate from match one,
so the reset is a _display_ climb, not a skill regression. Players re-earn the
_number_, not the _skill placement_.

### 7.3 Prestige & legacy (so prior effort is never invalidated)

- `peak_rating` already persists — surface it as a **permanent "Career Best"**
  on the profile.
- **Seasonal badge** stamped with the highest league reached (e.g. "S4 —
  Diamond"). Permanent, collectible, displayed as a row of season medallions.
- **God-tier legacy:** anyone who hit God in any season keeps a permanent "Touched
  Apotheosis" mark — the Ascent's final nodes (Newton, Ecliptadon, God Tier
  I–III) are _never_ reset. Reaching the summit once is forever.

### 7.4 End-of-season incentives

- Rewards scale by **peak league this season**, not final — so a late-season
  loss streak can't rob you of what you earned at your best (anti-tilt, again).
- Exclusive season cosmetic set, never sold, never returns. This is the renewable
  status engine.

---

## 8. Competitive Integrity

| Threat                                                      | Defense                                                                                                                                             | Built on                                                             |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Smurfs** (skilled alts farming low arenas)                | High K + `mmr_catchup` rockets a player with anomalous accuracy/win-rate out of low leagues in <10 games; placement matches at account start.       | existing `K=32` first-20-games; extend with accuracy-variance signal |
| **Boosting** (account sharing/win-trading to inflate)       | Flag pairs with abnormal repeated head-to-head + lopsided accuracy; cap trophies gained from the _same opponent_ within a window.                   | `pvp_battles` already logs both ids                                  |
| **Win-trading**                                             | Detect reciprocal loss patterns between two accounts; zero out trophy transfer, shadow-review.                                                      | `pvp_battles` history                                                |
| **Trophy inflation** (whole population drifts up over time) | Zero-sum above Champion floor + 45% seasonal compression keeps the top scarce.                                                                      | §7.2                                                                 |
| **Rank camping** (hit a peak, stop playing to protect it)   | **Decay above Unreal**: −25 trophies/day after 72h of inactivity, down to the Unreal floor only.                                                    | new cron RPC over `player_ratings.last_battle_at`                    |
| **Matchmaking abuse / queue dodging**                       | `find_pvp_match` already atomic with `FOR UPDATE SKIP LOCKED`; add small dodge penalty.                                                             | existing matchmaker                                                  |
| **XP/answer exploits**                                      | Already strong: server-authoritative `award_*` RPCs, rate limit (30/min), per-battle XP cap (1000), public profile via SECURITY-DEFINER view. Keep. | migration `20260510013726…`                                          |

**Knowledge-weighting is itself an integrity feature:** because climbing
requires _accuracy_, not just outcome, scripted/colluded wins that don't
demonstrate knowledge gain little. Cheating the ladder requires actually being
good at the material — which is a fine failure mode for a learning product.

**The highest ranks stay aspirational** through three compounding scarcities:
zero-sum trophies, monthly compression, and decay. God-tier global numbering
(#1…#100) makes the apex a single, contested, visible seat.

---

## 9. Monetization — ethical, non-pay-to-win

Eclipta is an **education product used by students and classrooms.** That raises
the ethical bar above a normal F2P game. Two hard rules:

1. **Never sell power.** No purchasable trophies, XP-that-buys-rank, or
   gameplay-advantaged Ecliptars. Tools are sidegrades; skins are paint.
2. **Never sell randomness.** No paid loot boxes. All variable drops are
   earned-only with public odds and pity timers. (This also keeps the platform
   clean of gambling-adjacent mechanics that schools and app stores increasingly
   reject.)

Within those rules:

| Product                                  | What it is                                                                                                                                                                                         | Why it's ethical & sticky                                                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Scholar's Pass** (seasonal)            | Free track + premium _cosmetic_ track: skins, banners, titles, profile themes, an XP-_learning_-boost (more XP per lesson/correct answer — accelerates the loss-proof Ascent, **not** the Ladder). | Rewards studying more, never winning more; cosmetics don't touch competitive integrity.                        |
| **Cosmetic Ecliptar skins / animations** | Paint over existing `user_ecliptars` slugs.                                                                                                                                                        | Pure status; zero balance impact.                                                                              |
| **Profile prestige**                     | Animated banners, season-medallion frames, name flair.                                                                                                                                             | Social signaling, the most ethical thing to sell.                                                              |
| **Luna deep-session passes**             | Extra/longer AI tutoring sessions (`luna-*` functions).                                                                                                                                            | This is _more learning value_ for money — aligned with the product's mission, and not a competitive advantage. |
| **Season exclusive sets**                | Time-limited cosmetic collections.                                                                                                                                                                 | Urgency without power.                                                                                         |

**How monetization _enhances_ progression:** the Pass gives the Ascent a second,
purchasable-cosmetic lane that runs _parallel_ to the free lane, so paying makes
the journey prettier and slightly faster _to learn_, while the Ladder — the
status race everyone can see — stays 100% earned. The flex on the leaderboard is
always skill; the flex on your profile can be taste. Both are desirable; only one
is buyable.

---

## 10. Social Systems

Trophy Road becomes a _social_ status system, not a solo grind:

- **Friend & clan leaderboards** — local comparison (where motivation actually
  lives for the 90% who'll never be global top-100). Built on the existing
  rating leaderboard, scoped to a social graph.
- **Clan ranked** (unlocks at Champion) — aggregate clan trophy standing and a
  clan banner that levels with collective seasonal performance. Drives the
  social-obligation retention loop ("the clan needs my matches this week").
- **Rivalries** — auto-surface a "nemesis" (similar MMR, recent close matches):
  "You're 40 trophies behind Kai." Personal, recurring, low-stakes drama.
- **Bragging rights** — shareable season-end cards (peak league, best subject,
  win streak) — the existing `BattleReport` is the natural seed for this.
- **Spectate / ghost flex** — the `battle_sessions` ghost system already stores
  replayable sessions; let players share a great match as a flex.

---

## 11. Long-Term Retention (30d / 90d / 1y / 3y+)

| Horizon      | Risk                      | Mechanism                                                                                                                                                                                              |
| ------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Day 1–7**  | Bounce                    | Endowed progress, ghost-only PvP, first Ecliptar in <10 min, daily quest streak (`current_streak`).                                                                                                    |
| **30 days**  | Loop boredom              | First full season arc + Scholar's Pass + first soft reset to climb again.                                                                                                                              |
| **90 days**  | Content exhaustion        | Subject sub-ladders, archetype mastery collection, rotating seasonal themes.                                                                                                                           |
| **1 year**   | Progression stagnation    | Permanent Ascent legacy (summit kept forever) + renewable seasonal status + accumulating season-medallion wall.                                                                                        |
| **3+ years** | Burnout / "done the game" | _Infinite_ aspirational axes (see Innovations): per-subject mastery has no ceiling; global God-tier seat is perpetually contested; cosmetic collection never "completes" because new seasons add sets. |

**Daily / weekly / monthly cadence:**

- **Daily:** 3 quests (e.g. "win 1 ranked", "answer 10 Calculus correctly", "play
  a new archetype") → streak fuel; missing a day costs the streak, not trophies.
- **Weekly:** a "Crucible" challenge (themed subject gauntlet) with a cosmetic
  shard reward; clan weekly target.
- **Monthly:** season climb + finals weekend + exclusive set.

**Anti-burnout guardrails:** loss-proof Ascent means a bad week never erases
_progress_; tilt-relief and floors mean a bad night never erases _status_ below
your league. The product is forgiving of failed learning by design.

---

## 12. Innovations (not common in the reference games)

1. **Knowledge-weighted trophies.** Trophy delta scales with _answer accuracy_,
   not just win/loss (§3.2). Couples the competitive ladder directly to learning
   outcomes — impossible in non-knowledge games, and the single most important
   adaptation of ladder design to an education product.

2. **Dual-spine, opposite-loss design.** A permanent, loss-proof _learning_
   Ascent running alongside a seasonal, loss-bearing _competitive_ Ladder, with
   an explicit non-pay-to-win bridge between them (§1.2). Reference games
   collapse these into one track (Clash) or keep them entirely separate with no
   bridge (most). Eclipta needs both _and_ the bridge because failed _learning_
   must never be punished while _competition_ must have stakes.

3. **Ghost-based humane onboarding & tilt protection.** The existing
   `get_ghost_session` replay system isn't just a no-opponent fallback — use it
   deliberately: brand-new and on-tilt players get matched to _replays_ instead
   of live humans, so the worst moments (first match, 4th straight loss) are
   never against a real person who can stomp or taunt.

4. **Subject sub-ladders.** Per-subject trophy tracks (Calculus, Mechanics, …)
   so a player is "Champion in Calculus, Gold in Chemistry." Creates _infinite_
   horizontal aspiration and routes learners toward their weak subjects for the
   biggest gains. Backed by extending `archetype_mastery`'s pattern to subjects.

5. **Accuracy-as-anti-cheat.** Because climbing requires demonstrated knowledge,
   collusion/boosting that doesn't involve actually answering well gains little —
   integrity emerges from the learning mechanic itself (§8).

6. **Career wall.** A permanent, growing row of season medallions + peak-rating
   "Career Best" — the long-horizon collectible that makes a 3-year veteran's
   profile _visibly_ a veteran's, independent of current-season standing.

---

## 13. Final Blueprint — the single recommended system

**One sentence:** _Keep the cumulative XP road as a permanent, loss-proof
"Ascent" (the journey + collection), build a seasonal, accuracy-weighted Trophy
Ladder on top of the existing ELO engine (the stakes + status), bridge them with
skill-unlocks-mastery / mastery-unlocks-tools, and monetize only cosmetics and
learning-value — never power or randomness._

### Build order (incremental, each step ships value)

1. **Rename & reframe (low-risk, high-clarity).** Keep `trophy-road-data.ts` and
   `TrophyRoad.tsx`; relabel the XP track as **"The Ascent"** in copy so it stops
   masquerading as a competitive ladder. Surface XP as permanent "Marks."
   _No schema change._

2. **Surface Trophies on the road.** Add a player-facing trophy number derived
   from `player_ratings`, displayed on `Overview` and league dividers, alongside
   XP. Wire the existing leaderboard in. _Read-only over existing data._

3. **Knowledge-weighted trophy delta.** Replace the raw `update_pvp_rating`
   display-side with the §3.2 formula (keep ELO as hidden MMR underneath). New
   server RPC; clients stay non-authoritative.

4. **Floors + tilt-relief + streaks.** Add league floors and the loss-streak
   softener to the trophy RPC. Wire `current_streak` into win-streak bonuses.

5. **Seasons.** Add the §7 soft-reset cron + season-medallion table; surface
   `peak_rating` as Career Best. MMR untouched by reset.

6. **Reward diversification.** Convert chests from pure-XP to mixed
   (XP floor + public-odds variable slot with pity), server-side in `claim_chest`.

7. **Scholar's Pass + cosmetics.** Cosmetic-only premium track + Ecliptar skins.
   Power-neutral by construction.

8. **Social + sub-ladders.** Friend/clan leaderboards, rivalries, subject
   sub-ladders.

### The non-negotiables (the soul of the design)

- **Learning progress is never lost.** The Ascent only goes up.
- **You can't buy rank or randomness.** Ethics for a student audience.
- **Climbing the ladder _is_ learning.** Accuracy weighting guarantees it.
- **There is always a visible next thing**, on at least one axis, forever.

That is the best Trophy Road Eclipta can ship: it turns the act of _learning_
into the act of _climbing_, keeps the stakes real without ever punishing a
student for trying, and stays honest, social, and aspirational for years.

---

### Appendix A — current XP economy (for reference / tuning)

| Event             | XP                                    | Source            |
| ----------------- | ------------------------------------- | ----------------- |
| `quiz_correct`    | 10                                    | `award_xp`        |
| `forum_thread`    | 10                                    | `award_xp`        |
| `forum_answer`    | 15                                    | `award_xp`        |
| `battle_complete` | 25                                    | `award_xp`        |
| `lesson_complete` | 30                                    | `award_xp`        |
| `battle_win`      | 75                                    | `award_xp`        |
| `daily_challenge` | 100                                   | `award_xp`        |
| battle (computed) | `min(1000, correct×15 + (won?50:0))`  | `award_battle_xp` |
| Chests            | 75 → 5,500 (Bronze Chest → God Vault) | `claim_chest`     |
| Rate limit        | 30 awards / minute                    | all `award_*`     |

### Appendix B — current ELO engine (kept as hidden MMR)

- Default rating 1000, floor 100, `peak_rating` tracked.
- `K = 32` for first 20 games, `16` after.
- `EXPECTED = 1 / (1 + 10^((opp − me)/400))`.
- Matchmaking window ±200; ghost window ±150.
- `season` column present; **no reset logic today** → added in §7.
