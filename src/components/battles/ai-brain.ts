/**
 * Adaptive Battle AI - "Flow" opponent design
 *
 * Philosophy (Csikszentmihalyi's challenge-skill balance):
 *   Difficulty scales through DECISION QUALITY, not stat inflation.
 *   Harder archetypes make smarter choices more often - they don't
 *   just hit harder. The accuracy ceiling is bounded so the AI is
 *   always beatable through skill. Bluffing and pattern detection
 *   create legitimate unpredictability: "I can learn this AI, but
 *   it can also learn me."
 *
 * Key design constraints:
 *   - No hidden information: AI only uses visible state (HP, Focus, Momentum)
 *   - No guaranteed counters or impossible reaction times
 *   - Dynamic accuracy range: +/-10% of archetype baseline, capped [0.42, 0.92]
 *   - Every adaptation is in principle discoverable by an attentive player
 *
 * Tuning knobs (all in AI_PERSONALITIES):
 *   aggressionBase       - baseline tendency to charge vs. play safe
 *   adaptRate            - how quickly detected patterns affect decisions
 *   riskTolerance        - willingness to charge at low HP
 *   bluffFreq            - probability of a deliberate suboptimal play
 *   clutchFactor         - accuracy bonus when AI HP < 35%
 *   counterPlaySensitivity - pattern-spam threshold that triggers counter-play
 *   lateGameRamp         - whether aggression + accuracy scale with turn count
 *   pressureStyle        - flavors log messages and minor behavioral tweaks
 */

import type { Action, ArchetypeId, Archetype } from "./types";
import { botAccuracy } from "./stat-mechanics";

// --- Battle Memory ------------------------------------------------------------
// Stored in a ref (not React state) so it never causes re-renders.

export interface BattleMemory {
  playerActionCounts: Record<Action, number>;
  playerLastActions: Action[]; // ring buffer of last 6 player actions
  playerCorrectCount: number;
  playerMissStreak: number; // consecutive wrong/timeout answers
  playerTurnCount: number; // total player turns this battle
  aiSuccessStreak: number; // AI consecutive correct-answer chain
  turnNumber: number; // increments each AI turn (for late-game ramp)
  dominantPlayerAction: Action | null;
  patternConfidence: number; // 0-1: share of total turns dominated by one action
}

export function createBattleMemory(): BattleMemory {
  return {
    playerActionCounts: { attack: 0, defend: 0, charge: 0, ultimate: 0 },
    playerLastActions: [],
    playerCorrectCount: 0,
    playerMissStreak: 0,
    playerTurnCount: 0,
    aiSuccessStreak: 0,
    turnNumber: 0,
    dominantPlayerAction: null,
    patternConfidence: 0,
  };
}

/** Called after every player question resolves (correct or not). */
export function updateBattleMemoryPlayerTurn(
  memory: BattleMemory,
  action: Action,
  correct: boolean,
): void {
  memory.playerTurnCount++;
  memory.playerActionCounts[action]++;
  memory.playerLastActions = [...memory.playerLastActions.slice(-5), action];

  if (correct) {
    memory.playerCorrectCount++;
    memory.playerMissStreak = 0;
  } else {
    memory.playerMissStreak++;
  }

  // Recompute dominant action for counter-play
  let maxCount = 0;
  let dominant: Action | null = null;
  for (const [a, c] of Object.entries(memory.playerActionCounts) as [Action, number][]) {
    if (c > maxCount) {
      maxCount = c;
      dominant = a;
    }
  }
  memory.dominantPlayerAction = dominant;
  memory.patternConfidence = memory.playerTurnCount >= 3 ? maxCount / memory.playerTurnCount : 0;
}

/** Called at the end of each AI turn. */
export function updateBattleMemoryAiTurn(memory: BattleMemory, aiSucceeded: boolean): void {
  memory.turnNumber++;
  memory.aiSuccessStreak = aiSucceeded ? memory.aiSuccessStreak + 1 : 0;
}

// --- Archetype Personalities --------------------------------------------------

export interface AiPersonality {
  /** 0-1: baseline tendency toward aggressive (charge) vs. conservative (attack/defend) */
  aggressionBase: number;
  /** 0-1: how strongly detected player patterns shift decisions */
  adaptRate: number;
  /** 0-1: willingness to charge when AI HP is critically low */
  riskTolerance: number;
  /** probability (0-1) of a deliberate suboptimal play (breaks predictability) */
  bluffFreq: number;
  /** raw accuracy bonus when AI HP < 35% - performs better under mortal pressure */
  clutchFactor: number;
  /** pattern share (0-1) required before counter-play kicks in */
  counterPlaySensitivity: number;
  /** Accelerator: ramp aggression + accuracy as turns increase */
  lateGameRamp: boolean;
  /** affects log-message flavor */
  pressureStyle: "burst" | "sustained" | "opportunistic" | "chaos";
}

/**
 * Per-archetype personality table.
 *
 * Psychological identities:
 *   speedster    - fast and reckless, adapts quickly, hates defending
 *   tank         - glacially methodical, barely reacts to patterns, grinds you out
 *   chud         - all-in every turn, charges regardless of HP or focus
 *   healer       - patient opportunist, waits for mistakes and punishes them
 *   fulcrum      - most adaptive opponent, highest counter-play sensitivity
 *   accelerator  - starts cautious, becomes dangerous; the slow knife
 *   gambler      - mostly chaotic, occasionally brilliant, never consistent
 *   god          - chess-master, reads everything, bluffs often
 */
export const AI_PERSONALITIES: Record<ArchetypeId, AiPersonality> = {
  speedster: {
    aggressionBase: 0.6,
    adaptRate: 0.65,
    riskTolerance: 0.8,
    bluffFreq: 0.1,
    clutchFactor: 0.05,
    counterPlaySensitivity: 0.55,
    lateGameRamp: false,
    pressureStyle: "burst",
  },
  tank: {
    aggressionBase: 0.2,
    adaptRate: 0.18,
    riskTolerance: 0.22,
    bluffFreq: 0.05,
    clutchFactor: 0.12,
    counterPlaySensitivity: 0.28,
    lateGameRamp: false,
    pressureStyle: "sustained",
  },
  chud: {
    aggressionBase: 0.92,
    adaptRate: 0.35,
    riskTolerance: 0.96,
    bluffFreq: 0.04,
    clutchFactor: 0.04,
    counterPlaySensitivity: 0.22,
    lateGameRamp: false,
    pressureStyle: "burst",
  },
  healer: {
    aggressionBase: 0.28,
    adaptRate: 0.5,
    riskTolerance: 0.18,
    bluffFreq: 0.15,
    clutchFactor: 0.08,
    counterPlaySensitivity: 0.6,
    lateGameRamp: false,
    pressureStyle: "opportunistic",
  },
  fulcrum: {
    aggressionBase: 0.5,
    adaptRate: 0.88,
    riskTolerance: 0.6,
    bluffFreq: 0.22,
    clutchFactor: 0.1,
    counterPlaySensitivity: 0.72,
    lateGameRamp: false,
    pressureStyle: "opportunistic",
  },
  accelerator: {
    aggressionBase: 0.32,
    adaptRate: 0.58,
    riskTolerance: 0.45,
    bluffFreq: 0.1,
    clutchFactor: 0.12,
    counterPlaySensitivity: 0.48,
    lateGameRamp: true,
    pressureStyle: "sustained",
  },
  gambler: {
    aggressionBase: 0.5,
    adaptRate: 0.08,
    riskTolerance: 0.5,
    bluffFreq: 0.42,
    clutchFactor: 0.0,
    counterPlaySensitivity: 0.1,
    lateGameRamp: false,
    pressureStyle: "chaos",
  },
  god: {
    aggressionBase: 0.68,
    adaptRate: 0.95,
    riskTolerance: 0.72,
    bluffFreq: 0.28,
    clutchFactor: 0.15,
    counterPlaySensitivity: 0.82,
    lateGameRamp: false,
    pressureStyle: "opportunistic",
  },
};

// --- Decision Engine ----------------------------------------------------------

interface OppState {
  hp: number;
  maxHp: number;
  focus: number;
  maxFocus: number;
  canHeal: boolean;
  /** Whether the ultimate charge is full - gates the `ultimate` action. */
  ultimateReady: boolean;
}
interface PlayerState {
  hp: number;
  maxHp: number;
  momentum: number;
}

/**
 * Weighted probabilistic action picker.
 *
 * Returns an Action sampled from a weight distribution shaped by:
 *   1. Archetype personality (base aggression, risk tolerance)
 *   2. Situational factors (AI/player HP, player momentum)
 *   3. Adaptive counter-play (detected player action patterns)
 *   4. Pressure amplification (player miss streaks, AI success streaks)
 *   5. Controlled bluffing (deliberate suboptimal play)
 *
 * Unavailable actions (insufficient focus, can't heal) receive weight 0
 * and are excluded from sampling - no phantom choices.
 */
export function pickAiAction(
  memory: BattleMemory,
  personality: AiPersonality,
  opp: OppState,
  player: PlayerState,
): Action {
  const oppHpPct = opp.hp / opp.maxHp;
  const playerHpPct = player.hp / player.maxHp;

  // -- Gambler: mostly chaotic, occasionally drops into smart-play mode ------
  if (personality.pressureStyle === "chaos") {
    if (Math.random() > 0.14) {
      const pool: Action[] = ["attack", "attack", "ultimate", "charge", "charge", "defend"];
      const available = pool.filter((a) => {
        if (a === "charge") return opp.focus >= 25;
        if (a === "ultimate") return opp.ultimateReady;
        if (a === "defend") return opp.canHeal;
        return true;
      });
      return available[Math.floor(Math.random() * available.length)] ?? "attack";
    }
    // 14%: fall through to the full decision engine for a "lucid" read
  }

  // -- Late-game ramp (Accelerator only) ------------------------------------
  const aggressionRamp = personality.lateGameRamp ? Math.min(memory.turnNumber * 0.055, 0.43) : 0;
  const eff = Math.min(0.96, personality.aggressionBase + aggressionRamp);

  // -- Base weights ---------------------------------------------------------
  // Charge is 0 when unaffordable and the ultimate 0 until charged -
  // both are then excluded from the weighted draw.
  const w: Record<Action, number> = {
    attack: 3.0,
    defend: opp.canHeal ? 1.5 : 0,
    charge: opp.focus >= 25 ? 2.0 : 0,
    ultimate: opp.ultimateReady ? 0.9 : 0,
  };

  // -- Personality: aggression lifts charge, dampens defend -----------------
  w.charge *= 0.4 + eff * 2.2;
  w.defend *= 2.0 - eff * 1.6;
  w.attack *= 0.8 + eff * 0.4;
  w.ultimate *= 0.6 + eff * 0.8;

  // -- Situational: AI HP ---------------------------------------------------
  if (oppHpPct < 0.28) {
    if (personality.riskTolerance >= 0.7) {
      // Aggressive identity: all-in, do or die
      w.charge *= 2.8;
      w.defend *= 0.12;
    } else {
      // Conservative identity: survive and claw back
      w.defend *= 3.8;
      w.charge *= 0.28;
    }
  } else if (oppHpPct < 0.5 && !personality.lateGameRamp) {
    const conserve = 1.5 + (1 - personality.riskTolerance) * 1.5;
    w.defend *= conserve;
  }

  // -- Situational: player HP - smell blood ---------------------------------
  if (playerHpPct < 0.28) {
    w.charge *= 2.3;
    w.defend *= 0.32;
    w.attack *= 1.35;
  } else if (playerHpPct < 0.55) {
    w.charge *= 1.4;
    w.attack *= 1.15;
  }

  // -- Situational: player momentum - hot streaks demand a response ----------
  if (player.momentum >= 4) {
    if (personality.riskTolerance >= 0.6) {
      // Counter-aggress: charge to interrupt their flow
      w.charge *= 1.75;
      w.defend *= 0.38;
    } else {
      // Absorb: defend and wait for them to miss
      w.defend *= 2.1;
      w.attack *= 0.7;
    }
  } else if (player.momentum >= 2) {
    w.charge *= 1.22;
  }

  // -- Adaptive: pattern counter ---------------------------------------------
  // Only engages once there's enough data and a clear dominant pattern.
  const hasData = memory.playerTurnCount >= 4;
  const strongPattern = memory.patternConfidence >= personality.counterPlaySensitivity;

  if (hasData && strongPattern && Math.random() < personality.adaptRate) {
    switch (memory.dominantPlayerAction) {
      case "attack":
        // Player stacks focus via attacks - charge before they cash out with a Charge
        w.charge *= 1.95;
        w.attack *= 0.6;
        break;
      case "defend":
        // Player stalls, heals, builds HP - break through with charge
        w.charge *= 1.65;
        w.defend *= 0.38;
        break;
      case "charge":
        // Player is all-in - if cautious archetype, outlast them
        if (personality.riskTolerance < 0.65) {
          w.defend *= 1.9;
          w.charge *= 0.7;
        }
        break;
      case "ultimate":
        // Player plays chaos - mirror chaos or ignore, depending on personality
        if (personality.adaptRate > 0.6) w.ultimate *= 1.5;
        break;
    }
  }

  // -- Adaptive: player miss streak - capitalize on weakness ----------------
  if (memory.playerMissStreak >= 2) {
    const pressMult = 1.0 + Math.min(memory.playerMissStreak, 4) * 0.22 * personality.adaptRate;
    w.charge *= pressMult;
    w.ultimate *= pressMult * 1.1;
  }

  // -- Adaptive: AI success streak - confidence building -------------------
  if (memory.aiSuccessStreak >= 2) {
    const confMult = 1.0 + Math.min(memory.aiSuccessStreak, 5) * 0.14;
    w.charge *= confMult;
    w.defend *= 0.85;
  }

  // -- Bluff: controlled suboptimal play ------------------------------------
  // Prevents players from perfectly predicting the AI. The suboptimal choice
  // is still within the space of legal moves - it's a timing/commitment error,
  // not a logic error. Players who recognize bluff patterns can exploit them.
  if (Math.random() < personality.bluffFreq) {
    const roll = Math.random();
    if (roll < 0.45 && w.defend > 0) {
      // False retreat: appear passive, conserve focus for a surprise Charge next turn
      w.defend *= 5.5;
      w.charge *= 0.06;
    } else if (roll < 0.8 && w.charge > 0) {
      // Reckless surge: commits to charge at a suboptimal moment
      w.charge *= 5.0;
      w.defend *= 0.06;
    }
    // Otherwise the bluff roll "fires" but changes nothing (random noise)
  }

  // -- Weighted sample -------------------------------------------------------
  const entries = (Object.entries(w) as [Action, number][]).filter(([, v]) => v > 0);
  if (entries.length === 0) return "attack";
  const total = entries.reduce((s, [, v]) => s + v, 0);
  let r = Math.random() * total;
  for (const [action, weight] of entries) {
    r -= weight;
    if (r <= 0) return action;
  }
  return entries[0][0];
}

// --- Dynamic Accuracy ---------------------------------------------------------

/**
 * Extends the static botAccuracy baseline with context-aware modifiers.
 *
 * All modifiers are capped so the total dynamic range stays within +/-10% of
 * the archetype baseline and the global ceiling of 0.92 is never exceeded.
 * The floor of 0.42 ensures even hard archetypes make occasional errors.
 *
 *   Clutch factor  - performs better under mortal pressure (HP < 35%)
 *   AI momentum    - consecutive successes yield a small chain bonus (+5.4% max)
 *   Warm-up        - smart archetypes get sharper over 6-8 turns (+6.5% max)
 *   Late-game ramp - Accelerator ramps both choices and accuracy (+9.6% max)
 *   Anti-frustration - caps accuracy if player is already critically low
 */
export function computeAiAccuracy(
  arch: Archetype,
  personality: AiPersonality,
  memory: BattleMemory,
  oppHpPct: number,
  playerHpPct: number,
  /**
   * Accuracy shift from the rating gap between the two fighters, from
   * `ratingSkillAdjustment`. Optional and defaulted to 0 so an unrated context
   * (or a caller that predates matchmaking) behaves exactly as before.
   */
  skillAdjustment = 0,
): number {
  const base = botAccuracy(arch);
  let acc = base + skillAdjustment;

  // Clutch factor
  if (oppHpPct < 0.35) acc += personality.clutchFactor;
  else if (oppHpPct < 0.55) acc += personality.clutchFactor * 0.4;

  // AI momentum chain bonus
  if (memory.aiSuccessStreak > 0) {
    acc += Math.min(memory.aiSuccessStreak * 0.018, 0.054);
  }

  // Warm-up: high-adapt archetypes sharpen after turn 2
  if (personality.adaptRate > 0.75 && memory.turnNumber > 2) {
    acc += Math.min((memory.turnNumber - 2) * 0.013, 0.065);
  }

  // Accelerator: explicit late-game ramp
  if (personality.lateGameRamp) {
    acc += Math.min(memory.turnNumber * 0.016, 0.096);
  }

  // Anti-frustration: ease off if player is almost dead anyway. The cap is
  // relative to this opponent's own baseline rather than the archetype's, so
  // mercy means "stop stacking bonuses", not "become a weaker opponent
  // mid-match" - which would read as the AI visibly pulling its punches.
  if (playerHpPct < 0.15) {
    acc = Math.min(acc, base + skillAdjustment + 0.04);
  }

  return Math.max(0.42, Math.min(0.92, acc));
}

/**
 * Accuracy shift from the rating gap between the player and their opponent.
 *
 * Without this the bot's difficulty comes from its archetype alone, so a 2000
 * and a 700 player meet the same opponent and exactly one of them has a real
 * match. Rating is the only skill estimate available at match time, and
 * matchmaking already picks a bot near the player's, so the gap is usually
 * small and this usually does very little - which is the point. It corrects
 * the mismatch at the edges instead of rescaling every fight.
 *
 * Deliberately bounded well inside the [0.42, 0.92] envelope: difficulty in
 * this design comes from decision quality, and a bot that answers 92% of
 * questions correctly is not a hard opponent, it is an unbeatable one.
 */
export const SKILL_ADJUSTMENT_LIMIT = 0.1;

export function ratingSkillAdjustment(playerRating: number, botRating: number): number {
  if (!Number.isFinite(playerRating) || !Number.isFinite(botRating)) return 0;
  // 400 Elo is the classic "one class stronger" gap, mapped to most of the
  // budget so a genuinely mismatched opponent feels different without the
  // curve going vertical.
  const raw = ((botRating - playerRating) / 400) * 0.08;
  return Math.max(-SKILL_ADJUSTMENT_LIMIT, Math.min(SKILL_ADJUSTMENT_LIMIT, raw));
}

// --- Pacing ------------------------------------------------------------------

/**
 * Tuning for how long an opponent appears to think.
 *
 * The old delay was a flat 400ms on every single turn. Nothing else gives a bot
 * away as fast: people are never metronomes, and a perfectly regular cadence is
 * legible within about three turns even to someone not looking for it.
 */
export const BOT_PACING = {
  /** Never so fast it reads as machine-instant. */
  floorMs: 650,
  /** Never so slow the player thinks the game has hung. */
  ceilingMs: 4200,
  /** Typical time to settle on an action. */
  baseMs: 1150,
  /** Someone glancing away, re-reading the question, or second-guessing. */
  hesitationChance: 0.12,
  hesitationMinMs: 800,
  hesitationMaxMs: 2000,
} as const;

/**
 * How long the opponent should appear to think before its turn resolves.
 *
 * Three properties, each chosen because its absence is a tell:
 *
 *   - **Right-skewed, not symmetric.** Real response times have a long tail -
 *     mostly quick with occasional slow ones - so the jitter is exponential
 *     over a roughly normal draw rather than a uniform +/- band, which would
 *     produce an obviously bounded spread.
 *   - **Warms up.** People speed up slightly as they settle into a match.
 *   - **Occasionally hesitates.** A rare long pause is what a distracted human
 *     looks like; without it the tail is too clean.
 *
 * Bounded at both ends because this is still a game someone is waiting on.
 * Pure and rng-injectable so the distribution can actually be tested.
 *
 * Note what this deliberately does NOT vary on: the action being taken. The
 * delay is spent before the opponent has chosen one, and weighting it by the
 * choice would mean either restructuring the turn resolution around a cosmetic
 * detail or shipping a knob nothing turns.
 */
export function botThinkDelayMs(turnNumber: number, r: () => number = Math.random): number {
  // Settles by ~25% over the first dozen turns, then holds.
  const warmUp = Math.max(0.75, 1 - Math.max(0, turnNumber) * 0.02);
  // Sum of three uniforms ≈ normal (central limit, cheaply); exp of it gives a
  // lognormal with a median near 1 and a long right tail.
  const draw = r() + r() + r() - 1.5;
  const jitter = Math.exp(draw * 0.55);

  let ms = BOT_PACING.baseMs * warmUp * jitter;
  if (r() < BOT_PACING.hesitationChance) {
    const span = BOT_PACING.hesitationMaxMs - BOT_PACING.hesitationMinMs;
    ms += BOT_PACING.hesitationMinMs + r() * span;
  }

  return Math.round(Math.max(BOT_PACING.floorMs, Math.min(BOT_PACING.ceilingMs, ms)));
}

// --- Narrative Pressure Messages ---------------------------------------------

/**
 * Returns a battle-log line that hints at AI psychology - or null (usually).
 * These appear at most once every few turns and only at meaningful moments.
 * They don't reveal hidden AI state; they narrate observable situations.
 */
export function getPressureLogLine(
  memory: BattleMemory,
  personality: AiPersonality,
  oppName: string,
  oppHpPct: number,
  wasPatternCounter: boolean,
): string | null {
  if (Math.random() > 0.52) return null; // usually silent

  // Clutch situation
  if (oppHpPct < 0.35 && personality.clutchFactor >= 0.08 && Math.random() < 0.72) {
    const msgs = [`${oppName} finds a second wind.`, `${oppName} digs deep - danger zone.`];
    return msgs[Math.floor(Math.random() * msgs.length)];
  }

  // Pattern counter activated
  if (wasPatternCounter && memory.patternConfidence > 0.58 && Math.random() < 0.68) {
    const msgs = [
      `${oppName} has read your patterns.`,
      `${oppName} adapts - change your approach.`,
    ];
    return msgs[Math.floor(Math.random() * msgs.length)];
  }

  // Player on a bad miss streak
  if (memory.playerMissStreak >= 3 && Math.random() < 0.72) {
    const msgs = [`${oppName} senses weakness - pressing hard.`, `${oppName} smells blood.`];
    return msgs[Math.floor(Math.random() * msgs.length)];
  }

  // AI on a long success streak
  if (memory.aiSuccessStreak >= 4 && Math.random() < 0.58) {
    const msgs = [
      `${oppName} is on fire - momentum shifting.`,
      `${oppName} builds unstoppable momentum.`,
    ];
    return msgs[Math.floor(Math.random() * msgs.length)];
  }

  return null;
}
