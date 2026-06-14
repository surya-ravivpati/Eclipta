# Eclipta — Daily Practice & Streak System

**A daily ritual, not a streak counter.** Design + the shipped first slice.
Companion to `docs/trophy-road-redesign.md` and `docs/luna-learner-model.md`.

---

## 1. Executive Summary

The goal isn't a number that goes up — it's that a learner *wakes up and thinks
"I should do my Eclipta practice today."* A streak is only the visible
scoreboard of an underlying habit loop. So this system optimizes for the
**habit**, and treats the streak as a gentle, forgiving signal of it — never a
source of dread.

Core philosophy, in one line: **reward consistency over perfection, make
showing up trivially easy, make the streak feel alive and personal, and make
missing a day survivable** so a single slip never becomes a quit.

The biggest failure mode of streak apps (Duolingo especially) is that the
streak becomes a source of *anxiety*, and the day it breaks, the user — having
lost the only thing they were playing for — churns entirely. Eclipta inverts
that: the streak is loss-protected, identity-framed, and backed by progression
that *doesn't* reset, so a broken streak is a stumble, not an ending.

What ships in v1 (already integrated): a true daily-practice streak (distinct
from the old win-streak), automatic freeze-grace for a missed day, freezes
earned weekly, flame tiers that evolve with the streak, a navbar flame visible
on every page (including the homepage), and a streak card on the Battles page.
Practice is recorded server-side on battle completion.

---

## 2. Behavioral Psychology Framework

For each principle: **why it works → behavior it drives → risk → mitigation.**

**Habit loop (cue → routine → reward → investment).** The navbar flame is a
persistent *cue*; one battle is the *routine*; XP + streak tick is the *reward*;
the growing streak is the *investment* that makes quitting feel costly. → drives
daily return. → Risk: loop decays once novelty fades. → Mitigation: variable
rewards + evolving flame tiers keep the reward fresh (§4, §3.3).

**Identity-based habits (Clear / Aronson).** "I'm someone who practices daily"
sticks far better than "I want to practice." → The system names the learner by
their consistency (flame tier labels: Ember → Eternal Flame), not just a count.
→ Risk: identity threat when broken. → Mitigation: longest-streak and
permanent progression preserve the identity even after a reset.

**Loss aversion (Kahneman).** A streak you've built is an endowment; losing it
hurts ~2×. → drives the "don't break the chain" pull. → Risk: toxic anxiety,
guilt, and rage-quit on loss. → Mitigation: freezes + grace (§3.2) and an
explicit "consistency, not perfection" frame so loss aversion motivates without
punishing.

**Goal-gradient effect.** Effort accelerates near a goal. → The "X days to your
next milestone" progress bar pulls harder as it fills. → Risk: post-milestone
slump. → Mitigation: the next milestone reveals immediately; freezes are granted
*at* milestones so arriving also restocks the safety net.

**Endowed progress.** People finish what they're already "into." → Day 1 of a
streak is framed as *already started* ("you're on a 1-day streak"), not zero. →
Risk: feels hollow if fake. → Mitigation: it's grounded in a real session.

**Variable reward schedules (Skinner).** Unpredictable rewards are stickier than
fixed. → A surprise daily drop (§4.3) makes "what will I get?" part of the
ritual. → Risk: drifts toward gambling — unacceptable for students. →
Mitigation: earned-only, public odds, no purchase, pity timer (mirrors the
trophy-road monetization stance).

**Self-Determination Theory (autonomy, competence, relatedness).** Intrinsic
motivation needs all three. → Autonomy: rest days and flexible goals, no forced
path. Competence: difficulty calibrated by Luna's learner model. Relatedness:
friend/clan streaks (§6). → Risk: over-gamification crowds out intrinsic
interest (overjustification effect). → Mitigation: rewards are *celebratory and
cosmetic*, never the only reason to practice; the learning itself stays central.

**Commitment devices.** A public/visible commitment raises follow-through. →
The navbar flame is a self-visible commitment; optional friend visibility adds
soft social accountability. → Risk: pressure. → Mitigation: opt-in social,
private by default.

---

## 3. Streak Architecture

### 3.1 Structure

- **Unit:** consecutive **UTC calendar days** with ≥ 1 practice activity (a
  battle, adaptive test, lesson, or a Luna study session). "Practice" is broad
  on purpose — any genuine learning act counts, so the bar to keep the streak is
  low (anti-burnout).
- **Start:** the first practice puts you on a **1-day** streak immediately
  (endowed progress), not 0.
- **Growth:** +1 per consecutive day. **Infinite** — no cap (veterans need
  headroom), but meaning comes from milestones + tiers, not the raw number.
- **Milestones:** `3, 7, 14, 30, 60, 100, 180, 365`. Spacing tightens early
  (fast wins build the habit) and widens later (each one stays special). 365 is
  the marquee; beyond it, every additional 365 is a "prestige year."

Implemented in `record_daily_practice()` (migration
`20260614030000_daily-practice-streak.sql`) on `user_profiles`
(`daily_streak`, `longest_daily_streak`, `last_practice_date`,
`streak_freezes`).

### 3.2 Streak Protection (the anti-churn core)

- **Freeze (auto-applied):** a single missed day is **automatically bridged** by
  a freeze if one is available — the user comes back to find the streak intact,
  no panic. (Duolingo's freeze is silent-good; we keep that and make it
  automatic so there's no "I forgot to equip it" failure.)
- **Earned, not bought:** a freeze is granted **every 7 streak-days**, capped at
  5. The safety net scales with commitment instead of running dry.
- **Reset rule:** a gap > 1 day with no freeze resets to **1** (today still
  counts) — never to 0, so returning *is itself* the start of the comeback.
- **Comeback (designed, v2):** returning after a real break shows a warm
  "welcome back — your best was N days, let's go again" and a 48-hour
  *Comeback Boost* (double streak-credit, see §8), turning the relapse into a
  fresh on-ramp instead of a shame moment.

This is the single most important section: it converts loss aversion from a
churn driver into a return driver.

### 3.3 Evolution — a 300-day streak must *feel* different from 7

**Flame tiers** scale the visual + the language (implemented in
`src/lib/daily-streak.ts`):

| Streak | Tier | Feel |
| --- | --- | --- |
| 1–6 | **Ember** | small, encouraging, "you've started" |
| 7–29 | **Flame** | established habit, brighter flame |
| 30–99 | **Blaze** | serious commitment, animated glow |
| 100–364 | **Inferno** | rare, prestige coloring |
| 365+ | **Eternal Flame** | legendary, unique treatment + yearly prestige |

- **Beginner (1–7):** lots of guidance, fast milestones, generous freezes, big
  celebratory moments — manufacture momentum.
- **Intermediate (8–60):** the ritual is forming; the flame and tier label
  become identity ("I'm a Blaze"); social comparison turns on.
- **Veteran (100+):** scarcity + prestige; rest weeks are normalized; the flame
  is a status symbol; the number matters less than the badge of belonging to a
  tiny club.

---

## 4. Reward Economy

Rewards **celebrate** the behavior; they never become the only reason to do it
(overjustification guardrail).

### 4.1 Daily (showing up)
- **XP** (already wired — battle XP lands on every session) + a small **daily
  consistency bonus** that scales gently with streak length (caps so it never
  dwarfs skill-based XP).
- The flame ticks up — the cheapest, most reliable reward is the streak itself.

### 4.2 Milestones
- **7:** a freeze + a cosmetic flair (banner/title).
- **14 / 30:** an Ecliptar skin shard / profile theme.
- **100 / 365:** exclusive prestige cosmetics (an "Inferno" / "Eternal" badge)
  — pure status, never power. Timed reveal with a full-screen celebration.
- **Timing:** rewards fire *at* the milestone moment (peak-end rule — the high
  point is what people remember), not drip-fed.

### 4.3 Surprise (variable schedule)
- A **mystery daily drop** on some sessions (published odds, earned-only, pity
  timer) — a reroll token, skin shard, or Luna deep-session pass.
- **Why it boosts retention:** variable-ratio reinforcement is the strongest
  schedule for sustained behavior; "what will I get today?" becomes its own cue.
- **Ethics:** no paid randomness, ever (student audience) — consistent with the
  trophy-road monetization stance.

---

## 5. Progression Systems

The streak feeds, but is **not the only**, progression — so a broken streak
never wipes everything (the key Duolingo failure).

- **Permanent: total practice days + longest streak** ("Career consistency") —
  never resets. This is the veteran's real trophy.
- **Flame tiers** (§3.3) = visible mastery rank for consistency.
- **Consistency badges:** "Perfect Week," "30-day Blaze," "Comeback" (returned
  and rebuilt), "Year of Fire."
- **Bridges to existing systems:** practice feeds XP → the **Trophy Road**
  Ascent (permanent), and the streak's daily bonus accelerates it. The streak is
  the *cadence*; the Ascent is the *journey*; the ladder is the *competition*.

---

## 6. Social Features (healthy by default)

- **Friend streaks (opt-in):** see friends' flames; nudge ("poke") support, not
  shame. Healthy: relatedness + soft accountability.
- **Clan / team streak:** a shared streak the group keeps alive together — the
  most powerful retention lever (you don't want to let the team down), and it
  distributes pressure so no individual carries it.
- **Weekly practice league (light):** consistency-based, not skill — ranks by
  *days practiced*, so anyone can top it by simply showing up. Avoids the
  toxicity of skill leagues.
- **Avoid:** public global streak leaderboards (breeds anxiety + cheating) and
  anything that punishes the group for one member's miss (use freezes to absorb
  individual slips in clan streaks).

---

## 7. Notification Strategy (encouragement, not guilt)

- **Daily reminder** at the learner's *personal* historical practice time (not a
  blanket hour) — "your arena's open." One per day, max.
- **Streak-at-risk** (only if a streak ≥ 3 and not yet practiced, sent in the
  evening): "Your N-day flame is still lit — one quick battle keeps it." Mentions
  that a freeze will cover them if they can't, so it informs rather than scares.
- **Missed day:** never guilt. "Your freeze saved your streak 🛟" or "Streaks
  restart easy — your best was N. Pick it back up?"
- **Milestone celebration:** push the win ("100 days. You're an Inferno. 🔥").
- **Comeback campaign:** after 3+ days away, a single warm re-invite with the
  Comeback Boost offer — then stop (no nagging a churned user).
- **Hard cap:** never more than ~1 notification/day; all are opt-out granularly.

---

## 8. Anti-Burnout Design

The differentiator. Consistency, not perfection.

- **Rest days / weekly goal:** the streak counts a **target days-per-week**
  option (e.g. "5 of 7"), so planned rest doesn't break it — explicit permission
  to rest, which paradoxically improves long-term adherence.
- **Auto-freeze grace** (§3.2): one slip is invisible-handled.
- **Comeback Boost:** returning gets double streak-credit for 48h, so rebuilding
  feels fast, not punishing.
- **No escalating pressure:** the UI never uses red/alarm framing or countdown
  dread; the flame is warm, the copy is supportive.
- **Reset = 1, not 0:** returning is always already-progress.
- **Cap the daily "ask":** one session satisfies the streak — no creeping daily
  quotas that turn a habit into a job.

---

## 9. Retention Analysis (expected impact)

- **D1/D7:** the navbar flame (a persistent cue on *every* page, including the
  homepage) + fast early milestones (3, 7) target the highest-drop window.
- **D30:** freezes + rest-days keep the inevitable first miss from churning the
  user; the 30-day Blaze is a strong intermediate anchor.
- **D90–D365:** flame tiers + permanent consistency stats + clan streaks sustain
  past novelty; prestige scarcity gives veterans a reason to protect the flame.
- **Post-break recovery:** because progression (XP/Ascent/longest-streak) is
  loss-proof and reset = 1, the "broke streak → quit" cascade is structurally
  defused — the metric that most predicts churn in streak apps.

---

## 10. Innovation (beyond Duolingo)

1. **Auto-freeze + freezes-earned-by-streak** — forgiveness scales with
   commitment; the safety net never silently runs out (Duolingo's runs dry and
   then the streak dies hard).
2. **Reset to 1, never 0** — returning is framed as momentum, not failure.
3. **Flame tiers as identity** — the streak becomes a *named rank* ("Inferno"),
   not just an integer, so it signals identity and status.
4. **Rest-day / days-per-week goal** — explicit permission to rest, killing the
   perfectionism that burns people out.
5. **Comeback Boost** — the relapse is a designed on-ramp with a reward, not a
   shame screen.
6. **Streak decoupled from progression** — XP/Ascent/longest-streak never reset,
   so a broken streak is survivable. This is the core fix to "why people quit
   after losing a streak."
7. **Clan streak with freeze absorption** — shared accountability without group
   punishment.

What Duolingo does well (and we keep): persistent visible streak, freezes,
milestone celebrations, identity ("I have a 365-day streak"). What users hate
(and we fix): brutal loss with no soft landing, guilt-heavy notifications,
streak anxiety, and the all-or-nothing cliff that makes one bad day end the
journey.

---

## 11. Final Blueprint

The single most effective system for Eclipta:

> A **forgiving, identity-driven daily flame** that any single learning act
> keeps alive; a **single missed day is auto-bridged** by freezes that you earn
> by being consistent; **rest days are built in**; the flame **evolves through
> named tiers** that become part of who the learner is; **milestones and
> surprise drops** celebrate without bribing; and crucially, **all real
> progression (XP, the Ascent, your longest streak) is loss-proof**, so a broken
> streak is a stumble you restart at day 1 — never a reason to quit.

Make showing up trivially easy, make the flame personal and visible everywhere,
make missing survivable, and let consistency — not perfection — be the whole
game.

---

## Implementation status (v1 shipped)

- **Migration** `20260614030000_daily-practice-streak.sql` — streak columns +
  `record_daily_practice()` RPC (auto-freeze grace, milestone freeze-earning,
  reset-to-1, server-authoritative).
- **`src/lib/daily-streak.ts`** — pure milestone/flame-tier/message helpers.
- **`src/hooks/use-daily-streak.tsx`** — live streak + `recordPractice()`.
- **Navbar flame** — visible on every page including the homepage (links to
  Battles), shown once a streak exists.
- **Battles page `DailyStreakCard`** — flame, today's status, milestone
  progress, freeze shields, encouraging copy.
- **`finishBattle`** records practice on every completed battle.

### Not yet built (clear next steps)
- Daily consistency XP bonus + milestone cosmetic rewards + surprise drops
  (§4) — needs the cosmetic economy.
- Rest-day / days-per-week goal (§8) — a profile setting + RPC tweak.
- Comeback Boost + notification strategy (§7, §8) — needs the notifications
  pipeline + a scheduler.
- Social (friend/clan) streaks (§6).
- Recording practice from adaptive tests, lessons, and Luna sessions (today
  only battles call the RPC) — one-line additions at each completion hook.
