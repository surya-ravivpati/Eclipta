# Eclipta — Two Loops: Ranked Mode & The Expedition

**Fully separating skill-based ranking from discovery-based progression.**
Refines the dual-spine sketch in `docs/trophy-road-redesign.md` into two
independent systems with distinct psychological jobs. Grounded in what exists:
the ELO `player_ratings` ladder (`supabase/.../pvp-architecture.sql`,
`complete_*_battle`), the XP "Trophy Road" (`src/lib/trophy-road-data.ts`,
Bronze→God), Ecliptars, and the cosmic Eclipta brand (eclipse, Luna, Newton,
Ecliptadon).

---

## 1. The principle

Today Eclipta conflates two things under one Bronze→God vocabulary: the XP
track *looks* like a competitive ladder but is earned by **time/activity**, and
the real skill signal (ELO) is hidden. That's the exact mistake the request
names — when a rank can be reached by grinding, **the rank stops meaning
"skilled."**

The fix is not to tune one ladder. It's to run **two loops that never share a
currency**:

| | **Ranked Mode** (skill) | **The Expedition** (discovery) |
| --- | --- | --- |
| Job | Prove mastery | Go on a journey |
| Earned by | Ranked **wins** vs real opponents | **XP** from any learning/battle |
| Movement | Up *and* down | Forward only (never lost) |
| Resets | **Seasonal** | **Never** |
| Names | Competitive tiers | Themed **Realms** (no Bronze→Gold) |
| Reward | Status, prestige cosmetics, leaderboard | Unlocks, Ecliptars, narrative, themes |
| Emotion | Tension, pride | Wonder, anticipation |
| Psych driver | Competence + status signaling | Autonomy + curiosity + collection |

A player should pursue **both at once**: "I'm climbing to prove I'm good" *and*
"I'm exploring to see what's next." Neither can be bought with the other's
effort — that's what protects rank integrity.

---

## 2. Ranked Mode — skill, and only skill

Built on the existing ELO `player_ratings` engine, surfaced Brawl-Stars-style.

### 2.1 Two numbers, clean jobs
- **Hidden MMR** = the existing ELO `rating` (K=32→16). Decides *matchmaking*
  and *how fast you climb*. Players never see it directly.
- **Rank Points (RP)** = the visible ladder. **Win → +RP. Loss → −RP.** MMR
  shapes the magnitude (under-ranked players gain more) so you converge to your
  true rank, but RP is what's shown and what defines your tier.

### 2.2 The ladder (replaces nothing on the Expedition — these names now live *only* here)
Recognizable competitive tiers so a high rank is *instantly* read as skill,
capped by a brand-specific apex:

`Initiate → Bronze → Silver → Gold → Diamond → Mythic → Legendary → Eclipse`

- Each tier has 3 divisions (e.g. Gold III→II→I). RP fills a division; full →
  promote.
- **Promotion is sticky early, brutal late.** Below Diamond, you can't demote
  out of a *tier* you've reached this season (floors — protects casual ranked
  players). Diamond+ has no floor: every match matters (skill filter).
- **Eclipse** is a single, season-scarce apex with a **global numbered
  leaderboard** (#1 … #500). This is the aspirational seat — visible, contested,
  unattainable by grinding because RP only comes from beating real opponents.

### 2.3 RP math (keeps grind out)
- Base ±25 RP/match. **Knowledge-weighted** (Eclipta-specific): a win's RP
  scales with answer accuracy (`0.7 + 0.6×accuracy`), so you climb fastest by
  *actually knowing the material* — you cannot brute-force rank by spamming
  matches. (Mirrors the accuracy-weighting in the trophy-road doc.)
- **Placement:** 5 placement matches each season seed you near last season's
  MMR, so good players don't re-grind from zero.
- **Bots earn no RP.** Unlike the Expedition (where bots grant a small rating
  nudge per the recent change), **Ranked Mode is real-opponents-only** (live +
  ghost). This is the line that keeps ranks honest. *(Note: this means the
  current bot-rating change should apply to a casual rating, not Ranked RP — see
  §6 reconciliation.)*

### 2.4 Seasons, prestige, status
- **~4-week seasons.** Soft reset above Diamond: `new = floor + (peak − floor) ×
  0.5` (keeps identity, restores the climb). MMR doesn't reset.
- **End-of-season rewards by peak tier** (not final — anti-tilt): a seasonal
  banner/title, an exclusive **animated Ecliptar skin**, and a permanent
  season medallion ("S3 — Mythic").
- **Eclipse** finishers get a unique, never-repeated cosmetic + a permanent
  "Touched the Eclipse" mark.
- Everything is **cosmetic / status** — never power (competitive + educational
  integrity).

### 2.5 Anti-abuse
Real-opponents-only RP + accuracy weighting + MMR-based matchmaking + decay
above Legendary (anti-camping) + win-trade detection on `pvp_battles`. Detailed
in the trophy-road doc §8.

---

## 3. Trophy Road, reborn — challenging "Worlds"

The request's instinct is right: stop using Bronze→Gold for progression. But I
want to challenge the proposed replacement too.

### 3.1 Why plain linear "Worlds" is only a half-fix
"World 1 → World 5" fixes the *naming* problem (no more fake ranks) but keeps
the *structural* one: it's still a **single linear corridor**, just reskinned.
It doesn't add the things that actually drive discovery motivation —
**autonomy, branching, anticipation, and collection**. Renaming Bronze→Gold to
World 1→5 is lipstick on the same ladder.

To genuinely raise motivation, anticipation, memorability, reward delivery,
retention, and expandability, the framework needs four properties a linear
World track lacks:

1. **A map, not a corridor** — a sense of *place* you move through and can see
   ahead, with the next destination visible and enticing (anticipation).
2. **Light branching / optional detours** — choice creates autonomy (SDT) and
   replay; not everyone takes the same path.
3. **Per-chapter identity** — each chapter introduces a *new mechanic + reward
   category + collectible set + narrative beat*, so each is memorable and
   un-skippable in feel (not "same track, new color").
4. **Infinite, non-invalidating expansion** — new chapters can be appended each
   season without resetting or cheapening past ones.

### 3.2 Framework comparison

| Framework | Discovery | Branching/autonomy | Narrative | Expandability | On-brand (cosmic) | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Linear Worlds | med | low | med | high | med | reskinned ladder |
| Regions/Realms **on a map** | high | med-high | high | high | high | **strong** |
| Story Chapters | med | low | **high** | high | med | great narrative, weak autonomy |
| Skill-Mastery Paths | med | high | low | high | low | good for *learning* but abstract |
| Collection-based | high | high | low | **very high** | med | great *meta*, weak spine |
| Planetary/Star systems | high | med-high | high | **very high** | **very high** | **strong + on-brand** |

### 3.3 Recommendation: **The Expedition — a celestial Atlas of Realms**

Not a corridor of Worlds — a **star map you chart**. Eclipta is already a cosmic
brand (the eclipse, Luna the moon, Newton, Ecliptadon). Lean all the way in:

> The Trophy Road becomes **The Expedition**: a journey across the Eclipta
> cosmos, rendered as an **Atlas** of **Realms** (star systems / regions). You
> chart it node by node, but the *Atlas view* shows realms ahead glowing on the
> horizon. Each Realm is a self-contained chapter with its own sky, mechanic,
> Ecliptar set, and story beat. A short **guided critical path** runs through
> every realm; **optional side-expeditions** branch off for collectors.

This is the synthesis of the two strongest rows above (Realms-on-a-map +
Planetary/star systems) with a **collection meta** layered on top — beating
plain Worlds on every criterion the request listed.

### 3.4 The Realms (re-theming the existing 8 tiers / 5 bands / 58 nodes)
The current `trophy-road-data.ts` has 5 thematic bands and 58 XP nodes — perfect
raw material. Re-skin them into ~7 Realms, each with a distinct identity:

| # | Realm | Was (band/tier) | Theme | Introduces | Ecliptar set | Narrative beat |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **The Observatory** | Training / Bronze | Dawn, learning to read the stars | basics, first archetype | Speedster, Tank | "You wake under the eclipse." |
| 2 | **The Tidelock Belt** | Training / Silver | Ocean-moons, asteroid drift | momentum & combos | Chud | First rival appears |
| 3 | **Ember Wastes** | Trials / Gold–Diamond | Scorched world | pressure / the timer | Gambler | The heat of real trials |
| 4 | **The Resonance** | Ascension / Platinum | Crystalline, harmonic | accuracy & streaks | Healer, Fulcrum | Patterns become instinct |
| 5 | **The Long Drift** | Mastery / Champion–Unreal | Deep space, endurance | long-form mastery | Accelerator | Solitude of the expert |
| 6 | **Celestial Nexus** | Summit / God I–II | Convergence point | boss gauntlet | God archetype | All paths meet |
| 7 | **The Eclipse** | Summit / God III + finals | The threshold | the finale | **Newton, Ecliptadon** | The cosmos resolves |

Each Realm: a unique sky/palette (the `CinemaRoad` already does per-tier color +
scene-cut — reuse it), an introduced mechanic/archetype, a **collectible set**
(the realm's Ecliptars + a realm relic/cosmetic), a boss, and one narrative
card. Side-expeditions = optional node clusters with bonus collectibles.

### 3.5 Why this beats both Bronze→Gold and linear Worlds
- **Motivation:** each realm is a *new experience*, not a higher number.
- **Anticipation:** the Atlas shows the next realm glowing ahead — "what's in
  the Resonance?" (curiosity gap).
- **Memorability:** "I unlocked the Ember Wastes" sticks; "I hit Gold III"
  doesn't.
- **Reward delivery:** rewards are *themed to the realm* (a realm's Ecliptar set,
  relic, sky) — categorical, not numeric, so they don't habituate.
- **Retention:** collection completion per realm + a narrative spine pulls
  forward; nothing resets, so effort is permanent.
- **Expansion:** new Realms (and seasonal side-expeditions) append forever
  without invalidating the journey — a content engine, not a fixed ladder.

---

## 4. Two loops, one player — how they reinforce without coupling

They must *complement*, never *substitute*:

- **Skill unlocks discovery, gently.** Ranked performance can grant **Expedition
  XP boosts** and unlock *cosmetic* realm flair — but never advances the
  Expedition *for* you, and never the reverse. You still travel the realms
  yourself.
- **Discovery equips you for skill.** The Expedition unlocks **Ecliptars and
  archetypes** (tools) — which are **sidegrades, not power** — so exploring
  gives you *options* to express skill in Ranked, without making exploration a
  pay-to-win shortcut.
- **The daily streak feeds both** (the cadence layer from
  `docs/daily-practice-streak.md`): a day's practice can be a ranked match *or*
  an expedition step.
- **Shared surface, separate meaning:** the profile shows **Rank** (this season,
  skill) next to **Expedition progress** (lifetime, journey) — two badges that
  say different things about you.

---

## 5. Psychology (why the split works)

- **Competence vs autonomy (SDT):** Ranked serves competence + status; the
  Expedition serves autonomy + curiosity. Splitting them lets each be *pure*,
  so neither dilutes the other.
- **Loss aversion, quarantined:** Ranked can fall (productive tension); the
  Expedition never falls (safe, especially important for a *learning* product —
  failed learning must never feel like losing ground).
- **Status signaling done honestly:** because Ranked RP is win-only and
  accuracy-weighted, a high rank is unforgeable proof of skill — the request's
  core requirement.
- **Collection + narrative (the Expedition):** completion psychology + a story
  spine are the strongest *non-competitive* retention drivers, and they're
  immune to the "I lost my rank, I quit" churn.

---

## 6. Reconciliation with what's already shipped

- The recent change made **bot battles affect rating** (`complete_bot_battle`).
  Under this design, that belongs to a **casual rating**, *not* Ranked RP —
  Ranked is real-opponents-only. Cleanest path: keep `player_ratings` as the
  casual/MMR layer (bots ok), and introduce a separate **`ranked_points`** layer
  that only live/ghost ranked matches move.
- The XP **Ascent/tiers** in `trophy-road-data.ts` are re-skinned to **Realms**
  (data + copy change; node structure largely reused). `CinemaRoad`'s per-tier
  theming becomes per-Realm theming.
- The earlier **trophy-road-redesign** dual-spine stands; this doc makes the
  separation total and re-themes the progression spine away from rank names.

---

## 7. Implementation path (incremental, each shippable)

1. **Re-skin the Trophy Road → Expedition** (lowest risk, high impact):
   rename tier/band data to Realms + per-realm copy/theme in
   `trophy-road-data.ts` + `TrophyRoad.tsx`. Pure content/visual; node logic and
   XP thresholds unchanged.
2. **Add an Atlas view** — a map of realms with the next realm "glowing ahead"
   (the cinema road already has the scrolling + scene-cuts to build on).
3. **Introduce Ranked Mode** on the existing ELO: a `ranked_points` + tier
   layer, a dedicated Ranked queue/entry (real opponents only), the tiered
   ladder UI, season reset RPC, Eclipse leaderboard.
4. **Split casual rating from Ranked RP** (move bot results to casual).
5. **Season rewards + prestige cosmetics** (needs the cosmetic economy).

---

## 8. Final blueprint

> **Ranked Mode** is a tight, seasonal, real-opponents-only skill ladder
> (Initiate → … → Eclipse) where RP is won, lost, and accuracy-weighted, so a
> high rank is unforgeable proof of mastery and the apex is a contested,
> numbered seat. **The Trophy Road becomes The Expedition** — a celestial Atlas
> of themed Realms you chart forever, each a new sky, mechanic, Ecliptar set,
> and story beat, never lost, infinitely expandable. Skill and discovery run as
> two pure, parallel loops that *equip* and *celebrate* each other but never
> substitute — so every player is at once **proving they're good** and
> **finding out what's next.**

Recommendation: build it in that order — re-skin to the Expedition first (it's
mostly content and immediately fixes the "fake rank" problem), then stand up
Ranked Mode as its own loop. Want me to start with step 1 (the Expedition
re-skin of `trophy-road-data.ts`)?
