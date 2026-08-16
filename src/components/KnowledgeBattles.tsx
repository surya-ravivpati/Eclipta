import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Swords,
  Zap,
  Trophy,
  Shield,
  Flame,
  Timer,
  Sparkles,
  Target,
  Heart,
  Skull,
  Dices,
  User,
  Bot,
  HelpCircle,
  Info,
  FastForward,
  Users,
  TrendingUp,
  TrendingDown,
  MessageSquare,
  VolumeX,
  Volume2,
  Crown,
  Medal,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import type {
  Phase,
  Action,
  Difficulty,
  ArchetypeId,
  Archetype,
  Fighter,
  MathQuestion,
  QuestionRecord,
  BattleStats,
  ActionConfig,
  GamblerRoll,
  LogEntry,
  LogActionType,
} from "./battles/types";
import { GAME_MODES, type GameModeId } from "@/lib/battle-modes/types";
import { GameModeSelectDialog } from "./battles/GameModeSelectDialog";
import { DraftDialog } from "./battles/DraftDialog";
import { TerritoryGridView } from "./battles/TerritoryGrid";
import { TugOfWarBar } from "./battles/TugOfWarBar";
import {
  initialTugState,
  pushTug,
  recoverTug,
  tugWinner,
  TUG_BAR_MAX,
  type TugState,
} from "@/lib/battle-modes/tug-of-war";
import {
  startingGrid,
  initialWeights,
  placeFlag,
  scoreGrid,
  flagWeight,
  territoryWinner,
  chooseBotPlacement,
  type TerritoryGrid as TerritoryGridT,
  type TerritoryWeights,
} from "@/lib/battle-modes/territory";
import {
  startingTeam,
  activeMember,
  advanceTeam,
  teamDefeated,
  autoDraftTeam,
  type DraftTeam,
} from "@/lib/battle-modes/draft";
import { generateQuestion } from "./battles/questions";
import {
  tickEffects,
  consumeUse,
  totalOf,
  has as hasEffect,
  isHarmful,
  type ActiveEffect,
} from "./battles/effects";
import { getUltimate, type Ultimate } from "./battles/ultimates";
import {
  resolveUltimate,
  damageWithEffects,
  defendWithEffects,
  type SideState,
} from "./battles/resolve-ultimate";
import {
  levelToCategory,
  getActionDifficultyLevel,
  getQuestionTime,
  applyDefense,
  absorbWithShield,
  getHealShield,
  getStreakHeal,
  getScoreMultiplier,
  rollCopiedPassive,
  rollMissPenalty,
} from "./battles/stat-mechanics";
import { DAMAGE_TUNING, ULTIMATE_TUNING } from "@/config/battle-tuning";
import { useTranslation } from "@/i18n/use-translation";
import { announce } from "@/lib/a11y";
import {
  createBattleMemory,
  updateBattleMemoryPlayerTurn,
  updateBattleMemoryAiTurn,
  AI_PERSONALITIES,
  pickAiAction,
  computeAiAccuracy,
  getPressureLogLine,
  ratingSkillAdjustment,
  botThinkDelayMs,
  type BattleMemory,
} from "./battles/ai-brain";
import { ARCHETYPES, rollGamblerStats } from "./battles/archetypes";
import { ClassSelectDialog, type ClassSelection } from "./battles/ClassSelectDialog";
import { BattleReport } from "./battles/BattleReport";
import { UserSearchDialog } from "./battles/UserSearchDialog";
import { ChallengeInbox } from "./battles/ChallengeInbox";
import { WeakSpotPractice } from "./battles/WeakSpotPractice";
import { BattleIntro } from "./battles/BattleIntro";
import { StreakHub } from "./streak/StreakHub";
import { recordDailyPractice } from "@/lib/record-practice";
import { recordOutcomes } from "@/lib/concept-mastery";
import { ECLIPTARS, ecliptarForArchetype, ecliptarSpriteUrl, type Ecliptar } from "@/lib/ecliptars";
import { supabase } from "@/integrations/supabase/client";
import type { TableRow } from "@/integrations/supabase/database";
import { getDailyChallengeProgress } from "@/repositories/courses";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getTodayChallenge } from "@/lib/daily-challenge";
import { findMatch, type MatchResult, type OpponentType } from "@/lib/matchmaking";
import { fetchPlayerRating, ratingToTier } from "@/lib/rating";
import { awardXp, awardVerifiedBattleXp } from "@/lib/xp-service";
import { toast } from "sonner";
import "./Battles.css";

/**
 * Pick a random opponent Ecliptar (excluding the player's own archetype when possible).
 * Rank-based matchmaking has been removed - every battle is a fair random draw.
 */
function pickOpponent(playerArch: ArchetypeId): Ecliptar {
  const candidates = ECLIPTARS.filter((e) => e.archetype !== playerArch);
  const pool = candidates.length > 0 ? candidates : ECLIPTARS;
  return pool[Math.floor(Math.random() * pool.length)];
}

// --- Action Config ---------------------------------------------------
// Focus economy: Attack & Defend BUILD focus, Charge SPENDS it. Ultimate is
// deliberately outside that economy - it spends its own charge meter, earned
// only by answering correctly - so the two payoff moves never compete for the
// same resource and Charge keeps its role as the tempo play.
const FOCUS_GAIN: Record<Action, number> = { attack: 15, defend: 10, charge: 0, ultimate: 0 };

const ACTIONS: Record<Action, ActionConfig> = {
  attack: { label: "Attack", icon: Swords, focusCost: 0, desc: "Your base DMG | +15 Focus" },
  defend: { label: "Heal", icon: Heart, focusCost: 0, desc: "Restore HP | +10 Focus" },
  charge: { label: "Charge", icon: Zap, focusCost: 25, desc: "1.8x your DMG | -25 Focus" },
  ultimate: {
    label: "Ultimate",
    icon: Sparkles,
    focusCost: 0,
    desc: "Your Ecliptar's signature move",
  },
};

/**
 * Action button descriptions, derived from the ACTIVE archetype's real stats
 * AND its signature identity - so Attack/Heal/Charge read differently for every
 * class. The +/- Focus is shown as a badge, so the text carries flavor instead.
 */
const ATTACK_TAG: Record<string, string> = {
  speedster: "fast = harder",
  tank: "low, relentless",
  chud: "glass cannon",
  gambler: "rolled stats",
  healer: "soft hits",
  fulcrum: "borrowed passive",
  accelerator: "ramps each answer",
  god: "all maxed",
};
const HEAL_TAG: Record<string, string> = {
  speedster: "quick patch",
  tank: "",
  chud: "risky pause",
  gambler: "rolled",
  healer: "+8 HP shield",
  fulcrum: "steady",
  accelerator: "scales up",
  god: "free every 3rd",
};
const CHARGE_TAG: Record<string, string> = {
  speedster: "fast = harder",
  tank: "rare big hit",
  chud: "devastating",
  gambler: "rolled",
  healer: "burst heal-tank",
  fulcrum: "always an answer",
  accelerator: "ramps",
  god: "finisher",
};

/** Base damage shown on the action buttons - live, so ramps read as they climb. */
function displayDamage(arch: Archetype, correctCount: number): string {
  if (arch.damageIsTimeScaled) {
    return `${arch.baseDamage}-${arch.baseDamage + DAMAGE_TUNING.speedster.maxSpeedBonus} DMG`;
  }
  if (arch.damageRamps) {
    const { damagePerAnswer, damageCap } = DAMAGE_TUNING.accelerator;
    return `${arch.baseDamage + Math.min(correctCount * damagePerAnswer, damageCap)} DMG ^`;
  }
  return `${arch.baseDamage} DMG`;
}

function getActionDesc(
  action: Action,
  arch: Archetype,
  correctCount: number,
  ultimate?: Ultimate | null,
): string {
  const tag = (m: Record<string, string>) => (m[arch.id] ? ` | ${m[arch.id]}` : "");
  switch (action) {
    case "attack":
      return `${displayDamage(arch, correctCount)}${tag(ATTACK_TAG)}`;
    case "defend": {
      if (arch.healAmount === null) return "Can't heal | builds Focus"; // Tank
      return `+${arch.healAmount} HP${tag(HEAL_TAG)}`;
    }
    case "charge": {
      // Charge is chargeMultiplierx whatever Attack would deal right now.
      const scaled = displayDamage(arch, correctCount).replace(/\d+/g, (n) =>
        String(Math.floor(Number(n) * DAMAGE_TUNING.chargeMultiplier)),
      );
      return `${scaled}${tag(CHARGE_TAG)}`;
    }
    case "ultimate":
      return ultimate ? ultimate.tag : "No Ecliptar equipped";
  }
}

// --- Quick-chat constants -------------------------------------------
// Preset-only, sportsmanship-first: a fixed set of positive/neutral worded
// phrases. No free text (toxicity), no emoji (brand: docs/brand-system.md).
// Insults are impossible by construction; communication stays warm, not loud.
const CHAT_PHRASES = [
  "Good luck",
  "Nice!",
  "Close one",
  "Well played",
  "Tough question",
  "GG",
] as const;

interface ChatItem {
  id: number;
  text: string;
  fromPlayer: boolean; // true = local player sent it
  senderName: string;
  ts: number; // Date.now() at creation for TTL removal
}

interface LiveTurnActionRow {
  actor_id: string;
  /** `PvpActionName`, not `Action`: rows written before Ultimate replaced Wild
   *  still carry "wild", so reads must tolerate it. */
  action: Action | "wild";
  correct: boolean;
  damage: number;
  self_damage: number;
  heal: number;
  focus_delta: number;
  momentum: number;
  time_spent: number;
  question?: unknown;
}

// Aligned with Trophy Road tier thresholds in src/lib/trophy-road-data.ts
// XP leaderboard shows the player's Expedition realm (the discovery loop),
// matching the re-skinned Trophy Road. Thresholds mirror the TIERS xpRequired.
function xpToTier(xp: number): string {
  if (xp >= 460000) return "Eclipse";
  if (xp >= 265000) return "Totality";
  if (xp >= 145000) return "Nightfall";
  if (xp >= 78000) return "Umbra";
  if (xp >= 43000) return "Penumbra";
  if (xp >= 20000) return "Meridian";
  if (xp >= 7500) return "Moonrise";
  return "Dawn";
}

const tierColors: Record<string, string> = {
  // Expedition realms (XP leaderboard)
  Eclipse: "text-tier-god",
  Totality: "text-tier-unreal",
  Nightfall: "text-tier-champion",
  Umbra: "text-tier-platinum",
  Penumbra: "text-tier-diamond",
  Meridian: "text-tier-gold",
  Moonrise: "text-tier-silver",
  Dawn: "text-tier-bronze",
  // Competitive leagues (rating leaderboard)
  "God Tier": "text-tier-god",
  Unreal: "text-tier-unreal",
  Champion: "text-tier-champion",
  Platinum: "text-tier-platinum",
  Diamond: "text-tier-diamond",
  Gold: "text-tier-gold",
  Silver: "text-tier-silver",
  Bronze: "text-tier-bronze",
};

// --- Audio Engine -----------------------------------------------------
// Web Audio API tone synthesizer - runs on the main thread, no external deps.
// AudioContext is created lazily on first use (requires prior user gesture).
let _audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!_audioCtx) {
    try {
      _audioCtx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (_audioCtx.state === "suspended") void _audioCtx.resume();
  return _audioCtx;
}
function playTone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.1) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + dur);
}
// Pitch rises with streak (220 Hz base + 22 Hz per streak hit, capped at 880 Hz)
function sfxStreak(streak: number) {
  playTone(Math.min(220 + streak * 22, 880), 0.11, "sine", 0.09);
}
function sfxBreak() {
  playTone(160, 0.22, "triangle", 0.11);
  setTimeout(() => playTone(110, 0.28, "triangle", 0.07), 90);
}
function sfxCombo() {
  playTone(660, 0.08, "sine", 0.13);
  setTimeout(() => playTone(880, 0.14, "sine", 0.1), 80);
}
function sfxWild() {
  [0, 55, 110].forEach((ms, i) =>
    setTimeout(() => playTone(300 + i * 130, 0.18, "sawtooth", 0.07), ms),
  );
}
// Rising major arpeggio for the win, falling minor slide for the loss
function sfxVictory() {
  [523, 659, 784, 1047].forEach((f, i) =>
    setTimeout(() => playTone(f, 0.22, "sine", 0.1), i * 110),
  );
}
function sfxDefeat() {
  [330, 262, 196].forEach((f, i) => setTimeout(() => playTone(f, 0.3, "triangle", 0.1), i * 170));
}

// --- Sub-components --------------------------------------------------
function HpBar({
  current,
  max,
  color,
  label,
}: {
  current: number;
  max: number;
  color: string;
  label: string;
}) {
  const pct = Math.max(0, (current / max) * 100);
  const isCritical = max > 0 && current / max < 0.2;
  return (
    <div
      className="w-full"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.max(0, Math.round(current))}
      // A bare "70%" is meaningless: name the bar, and spell out the critical
      // state, which is otherwise carried only by the colour turning pink.
      aria-valuetext={`${label}: ${Math.max(0, Math.round(current))} / ${max}${isCritical ? " - critical" : ""}`}
    >
      <div className="flex justify-between items-center mb-1">
        <span
          className={`text-[10px] font-bold tracking-widest transition-colors ${isCritical ? "text-neon-pink" : "text-muted-foreground"}`}
        >
          {label}
        </span>
        <div className="flex items-center gap-1">
          <motion.span
            animate={isCritical ? { scale: [1, 1.25, 1] } : {}}
            transition={{ repeat: Infinity, duration: 0.65 }}
          >
            <Heart className={`w-3 h-3 ${isCritical ? "text-neon-pink" : "text-neon-pink/70"}`} />
          </motion.span>
          <span
            className={`text-xs font-bold font-display transition-colors ${isCritical ? "text-neon-pink" : ""}`}
          >
            {current}/{max}
          </span>
        </div>
      </div>
      <div className="btt-hp-track">
        <motion.div
          className={`btt-hp-fill ${isCritical ? "btt-hp-fill--critical" : color === "bg-neon-cyan" ? "btt-hp-fill--cyan" : "btt-hp-fill--pink"}`}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

function FocusBar({
  current,
  max,
  isPlayer = false,
  canCharge = false,
}: {
  current: number;
  max: number;
  isPlayer?: boolean;
  canCharge?: boolean;
}) {
  const chargeCost = ACTIONS.charge.focusCost;
  // Charged means: enough focus, AND if we're showing this on the local player
  // side, the player can actually use Charge right now (phase allows it, no
  // action already locked for this turn, etc.). Without the second gate the
  // pink "CHARGE READY" ticker would stay on screen forever after the first
  // time focus crossed 25, regardless of whether spending it was possible.
  const isCharged = current >= chargeCost && (!isPlayer || canCharge);
  const isWarm = current >= chargeCost - 10 && !isCharged;
  const fillRatio = max > 0 ? current / max : 0;
  const pulseSpeed = isCharged ? 0.55 : isWarm ? 0.95 : 1.6;
  return (
    <div
      className="w-full"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.max(0, Math.round(current))}
      // "Charged" is signalled visually by a pink pulse - state that in words
      // too, so the cue is not colour-and-motion only.
      aria-valuetext={`Focus: ${Math.max(0, Math.round(current))} / ${max}${isCharged ? " - charged, Charge available" : ""}`}
    >
      <div className="flex justify-between items-center mb-1">
        <motion.span
          className={`text-[10px] font-bold tracking-widest transition-colors ${isCharged ? "text-neon-pink" : isWarm ? "text-neon-purple" : "text-muted-foreground"}`}
          animate={isCharged ? { opacity: [1, 0.6, 1] } : {}}
          transition={{ repeat: Infinity, duration: pulseSpeed }}
        >
          {isCharged ? "CHARGED" : "FOCUS"}
        </motion.span>
        <motion.span
          className={`text-xs font-bold font-display transition-colors ${isCharged ? "text-neon-pink" : "text-neon-purple"}`}
          animate={isCharged ? { scale: [1, 1.06, 1] } : {}}
          transition={{ repeat: Infinity, duration: pulseSpeed }}
        >
          {current}/{max}
        </motion.span>
      </div>
      <div className="flex gap-0.5">
        {Array.from({ length: max / 10 }).map((_, i) => {
          const filled = i < current / 10;
          return (
            <motion.div
              key={i}
              className={`btt-focus-pip ${filled ? (isCharged ? "btt-focus-pip--charged" : "btt-focus-pip--on") : ""}`}
              animate={filled && isCharged ? { opacity: [1, 0.55, 1] } : {}}
              transition={{ repeat: Infinity, duration: pulseSpeed, delay: i * 0.04 }}
            />
          );
        })}
      </div>
      <AnimatePresence>
        {isCharged && isPlayer && (
          <motion.p
            key="charge-ready"
            className="text-[8px] font-bold tracking-widest text-neon-pink mt-0.5 text-right"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.6, 1, 0.6] }}
            exit={{ opacity: 0 }}
            transition={{
              opacity: { repeat: Infinity, duration: 0.55, ease: "easeInOut" },
            }}
          >
            CHARGE READY
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function FighterCard({
  fighter,
  side,
  momentum,
  archetype,
  showHit,
  showHeal,
  canCharge = false,
  effects = [],
  showHp = true,
}: {
  fighter: Fighter;
  side: "left" | "right";
  momentum: number;
  archetype?: ArchetypeId;
  effects?: ActiveEffect[];
  showHit: boolean;
  showHeal: boolean;
  canCharge?: boolean;
  /** False in modes where health is not the resource - the bar would sit at
   *  full all match and read as a win condition that isn't one. */
  showHp?: boolean;
}) {
  const arch = archetype ? ARCHETYPES[archetype] : null;
  const comboThreshold = archetype === "fulcrum" ? 2 : 3;

  // In-battle creature art. Falls back to the Lucide icon if the sprite is
  // missing or fails to load; reset when the fighter's sprite changes.
  const [spriteFailed, setSpriteFailed] = useState(false);
  useEffect(() => {
    setSpriteFailed(false);
  }, [fighter.sprite]);
  const showSprite = !!fighter.sprite && !spriteFailed;

  // Floating combat numbers - derived from HP deltas so every damage source
  // (bot, live PvP, wild events, heals) produces one automatically.
  const prevHpRef = useRef(fighter.hp);
  const floatIdRef = useRef(0);
  const [floats, setFloats] = useState<{ id: number; delta: number }[]>([]);
  useEffect(() => {
    const delta = fighter.hp - prevHpRef.current;
    prevHpRef.current = fighter.hp;
    if (delta === 0) return;
    const id = ++floatIdRef.current;
    setFloats((f) => [...f, { id, delta }]);
    // No cleanup: each float owns its timer, so rapid back-to-back hits
    // don't cancel the previous number's removal.
    setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 1200);
  }, [fighter.hp]);

  return (
    <motion.div
      className={`btt-card ${side === "left" ? "btt-card--cyan" : "btt-card--pink"} p-5 flex-1 relative overflow-hidden`}
      animate={showHit ? { x: side === "left" ? [-8, 8, -4, 0] : [8, -8, 4, 0] } : {}}
      transition={{ duration: 0.4 }}
    >
      <AnimatePresence>
        {showHit && (
          <motion.div
            className="absolute inset-0 bg-neon-pink/10 z-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          />
        )}
        {showHeal && (
          <motion.div
            className="absolute inset-0 bg-neon-cyan/10 z-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          />
        )}
      </AnimatePresence>
      <div className="btt-float-layer" aria-hidden>
        <AnimatePresence>
          {floats.map((f) => (
            <motion.span
              key={f.id}
              className={`btt-float absolute ${f.delta < 0 ? "btt-float--dmg" : "btt-float--heal"} ${Math.abs(f.delta) >= 25 ? "btt-float--big" : ""}`}
              initial={{ opacity: 0, y: 14, scale: 0.7 }}
              animate={{ opacity: [0, 1, 1, 0], y: -42, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.15, times: [0, 0.12, 0.72, 1], ease: "easeOut" }}
            >
              {f.delta > 0 ? `+${f.delta}` : f.delta}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
      <div className="relative z-10">
        {showSprite && (
          <div className="relative flex justify-center mb-3">
            {/* Soft spotlight so the creature always separates from the card,
                whether its art is dark or light. */}
            <div
              aria-hidden
              className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-40 sm:h-52 pointer-events-none bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.12),transparent_68%)]"
            />
            <img
              src={fighter.sprite}
              // Decorative: the fighter's name is rendered as text directly
              // below, so alt text here would just be a duplicate announcement.
              alt=""
              aria-hidden="true"
              onError={() => setSpriteFailed(true)}
              // Ecliptar art is drawn facing left, which is right for the
              // opponent on the right-hand card but leaves the player's creature
              // facing away from the fight. Mirroring the left card turns the
              // two to face each other, which is what makes a duel read as a
              // duel rather than two portraits side by side.
              className={`relative h-32 sm:h-44 w-auto max-w-full object-contain select-none pointer-events-none drop-shadow-[0_10px_22px_rgba(0,0,0,0.65)] ${
                side === "left" ? "-scale-x-100" : ""
              }`}
            />
          </div>
        )}
        <div className="flex items-center gap-3 mb-4">
          {!showSprite && (
            <div
              className={`w-11 h-11 border flex items-center justify-center ${side === "left" ? "border-neon-cyan/40 text-neon-cyan" : "border-neon-pink/40 text-neon-pink"}`}
            >
              <fighter.icon className="w-6 h-6" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h4 className="btt-shout text-xl truncate">{fighter.name}</h4>
            {arch && (
              <span
                className={`inline-flex items-center gap-1 text-[9px] font-bold tracking-widest ${arch.color}`}
              >
                <arch.icon className="w-3 h-3" /> {arch.name.toUpperCase()}
              </span>
            )}
            {momentum > 0 &&
              (() => {
                const combos = Math.floor(momentum / comboThreshold);
                const isHot = combos >= 2;
                const isWarm = combos >= 1;
                return (
                  <motion.div
                    className={`flex items-center gap-1 ${isHot ? "text-neon-pink" : isWarm ? "text-neon-pink/75" : "text-neon-pink/50"}`}
                    key={momentum}
                    initial={{ scale: 1.35, opacity: 0.7 }}
                    animate={{ scale: 1, opacity: 1 }}
                  >
                    <Flame className={isHot ? "w-4 h-4" : "w-3 h-3"} />
                    <span
                      className={`font-bold tracking-widest ${isHot ? "text-[11px]" : "text-[10px]"}`}
                    >
                      {momentum}x STREAK
                    </span>
                  </motion.div>
                );
              })()}
          </div>
        </div>
        {showHp && (
          <HpBar
            current={fighter.hp}
            max={fighter.maxHp}
            color={side === "left" ? "bg-neon-cyan" : "bg-neon-pink"}
            label="HP"
          />
        )}
        {/* Absorb pool (Healer passive) - only rendered while it holds charge,
            so classes without a shield never show an empty slot. */}
        <AnimatePresence>
          {(fighter.shield ?? 0) > 0 && (
            <motion.div
              className="mt-1.5 flex items-center gap-1 text-tier-silver"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              key={fighter.shield}
            >
              <Shield className="w-3 h-3" />
              <span className="text-[10px] font-bold tracking-widest tabular-nums">
                {fighter.shield} SHIELD
              </span>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="mt-2">
          <FocusBar
            current={fighter.focus}
            max={fighter.maxFocus}
            isPlayer={side === "left"}
            canCharge={canCharge && side === "left"}
          />
        </div>
        <EffectChips effects={effects} side={side} />
      </div>
      <AnimatePresence>
        {momentum > 0 && momentum % comboThreshold === 0 && (
          <motion.div
            className="absolute top-2 right-2 text-neon-pink"
            initial={{ scale: 0, rotate: -30, opacity: 0 }}
            animate={{ scale: [0, 1.5, 1], rotate: [0, 12, -6, 0], opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.45 }}
            key={Math.floor(momentum / comboThreshold)}
          >
            <Sparkles className="w-7 h-7" />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function QuestionOverlay({
  question,
  timeLeft,
  maxTime,
  onAnswer,
}: {
  question: MathQuestion;
  timeLeft: number;
  maxTime: number;
  onAnswer: (answer: number, timeSpent: number) => Promise<{ correct: boolean; answer?: number }>;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [showReveal, setShowReveal] = useState(false);
  const [result, setResult] = useState<{ correct: boolean; answer?: number } | null>(null);
  const startTimeRef = useRef(Date.now());
  const pct = (timeLeft / maxTime) * 100;

  const handleSelect = async (val: number) => {
    if (selected !== null) return;
    setSelected(val);
    const spent = (Date.now() - startTimeRef.current) / 1000;
    const answerResult = await onAnswer(val, spent);
    setResult(answerResult);
    if (!answerResult.correct) setTimeout(() => setShowReveal(true), 300);
  };

  return (
    <motion.div
      className="btt-q-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className={`btt-q-card ${timeLeft <= 3 ? "btt-q-card--danger" : ""}`}
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
      >
        <div className="mb-5">
          <div className="flex items-center justify-between mb-1.5">
            <span
              className={`text-[10px] font-bold tracking-widest ${question.difficulty === "hard" ? "text-neon-pink" : question.difficulty === "medium" ? "text-neon-purple" : "text-neon-cyan"}`}
            >
              {question.difficulty.toUpperCase()} | {question.topic.toUpperCase()}
            </span>
            <div className="flex items-center gap-1">
              <Timer
                className={`w-3.5 h-3.5 ${timeLeft <= 3 ? "text-neon-pink" : "text-muted-foreground"}`}
              />
              <span
                className={`text-sm font-bold font-display ${timeLeft <= 3 ? "text-neon-pink" : "text-foreground"}`}
              >
                {timeLeft}s
              </span>
            </div>
          </div>
          <div className="btt-hp-track">
            <motion.div
              className={`btt-hp-fill ${timeLeft <= 3 ? "btt-hp-fill--critical" : "btt-hp-fill--purple"}`}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>
        <h3 className="btt-shout text-5xl text-center mb-8 text-foreground">
          {question.q.trimEnd().endsWith("?") ? question.q : `${question.q} = ?`}
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {question.options.map((opt, i) => {
            let style = "border-white/[0.08] hover:border-white/[0.18] hover:bg-white/[0.03]";
            if (selected !== null) {
              if (result?.answer !== undefined && opt === result.answer)
                style = "border-neon-cyan/60 bg-neon-cyan/8 text-neon-cyan";
              else if (opt === selected)
                style = "border-neon-pink/60 bg-neon-pink/8 text-neon-pink";
              else style = "border-white/[0.05] opacity-30";
            }
            return (
              <motion.button
                key={i}
                onClick={() => handleSelect(opt)}
                disabled={selected !== null}
                className={`p-5 border btt-shout text-2xl transition-colors ${style}`}
                whileHover={selected === null ? { scale: 1.03 } : {}}
                whileTap={selected === null ? { scale: 0.97 } : {}}
              >
                {opt}
              </motion.button>
            );
          })}
        </div>

        {/* Correct answer reveal - appears briefly on wrong answer before damage */}
        <AnimatePresence>
          {showReveal && (
            <motion.div
              className="mt-5 flex items-center justify-center gap-2 px-4 py-2.5 border border-neon-cyan/30 bg-neon-cyan/5"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <span className="text-[10px] font-bold tracking-widest text-muted-foreground">
                {question.topic.toUpperCase()} | CORRECT ANSWER
              </span>
              <span className="text-xl font-bold font-display text-neon-cyan">
                {result?.answer}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

/**
 * Issue 1: structured log renderer.
 * Uses LogEntry.id as the React key (never the array index) so that entries
 * are stable across re-renders and can never be reordered or deduplicated
 * by React's reconciler. Color derives from actor + actionType - no emoji
 * prefix parsing.
 */
function BattleLog({ logs }: { logs: LogEntry[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo(0, ref.current.scrollHeight);
  }, [logs]);

  function colorFor(e: LogEntry): string {
    if (e.actor === "system") {
      if (e.actionType === "combo") return "text-neon-pink";
      if (e.actionType === "separator") return "text-muted-foreground";
      if (e.actionType === "info") return "text-tier-gold";
      return "text-muted-foreground";
    }
    if (e.actor === "player") {
      if (e.actionType === "miss") return "text-neon-pink/80";
      if (e.actionType === "heal") return "text-neon-cyan";
      if (e.actionType === "ultimate") return "text-neon-purple";
      return "text-foreground";
    }
    // opponent
    if (e.actionType === "miss") return "text-muted-foreground";
    if (e.actionType === "heal") return "text-neon-cyan";
    return "text-neon-pink";
  }

  const turn = logs.filter((e) => e.actionType === "separator").length || 1;

  return (
    <div className="btt-log overflow-hidden">
      <div className="btt-log-head">
        <span className="btt-mono-text text-[10px] tracking-widest text-muted-foreground">
          BATTLE LOG
        </span>
        <span className="btt-mono-text text-[10px] tabular-nums text-muted-foreground">
          T-{String(turn).padStart(2, "0")}
        </span>
      </div>
      <div ref={ref} className="p-3 h-48 overflow-y-auto space-y-1">
        {logs.length === 0 && (
          <p className="text-[10px] text-muted-foreground italic">Battle log will appear here...</p>
        )}
        {logs.map((e) => (
          <motion.p
            key={e.id}
            className={`btt-mono-text text-[10px] leading-snug ${colorFor(e)}`}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <span className="text-muted-foreground/60 tabular-nums mr-1.5 font-mono">
              {String(e.id).padStart(2, "0")}
            </span>
            {e.result}
            {e.value !== undefined && e.actor !== "system" && (
              <span className="ml-1 text-[9px] text-muted-foreground/50 tabular-nums font-mono">
                [{e.value}]
              </span>
            )}
          </motion.p>
        ))}
      </div>
    </div>
  );
}

// --- Wild Event Overlay -----------------------------------------------
// An ultimate is the loudest thing that happens in a battle, so the cast gets
// its own overlay: the move's name, who cast it, and any random branches it
// rolled (the Gambler ultimates lean on this to show what the dice gave).
function UltimateCastOverlay({
  cast,
}: {
  cast: { name: string; caster: "player" | "opponent"; rolls: string[] };
}) {
  const mine = cast.caster === "player";
  const color = mine ? "text-neon-purple" : "text-neon-pink";
  const border = mine ? "border-neon-purple/60" : "border-neon-pink/60";
  const bg = mine ? "bg-neon-purple/10" : "bg-neon-pink/10";
  return (
    <motion.div
      className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, 0] }}
      transition={{ duration: 1.8, times: [0, 0.06, 0.78, 1] }}
    >
      <motion.div
        className={`px-10 py-6 border-2 ${border} ${bg} text-center backdrop-blur-sm max-w-[90%]`}
        initial={{ scale: 0.55, y: 24 }}
        animate={{ scale: [0.55, 1.12, 1], y: [24, -4, 0] }}
        transition={{ duration: 0.38, ease: "easeOut" }}
      >
        <p className={`text-[10px] font-bold tracking-[0.3em] ${color} opacity-70`}>
          {mine ? "ULTIMATE" : "ENEMY ULTIMATE"}
        </p>
        <p className={`text-2xl font-bold font-display tracking-widest ${color} mt-1`}>
          {cast.name.toUpperCase()}
        </p>
        {cast.rolls.length > 0 && (
          <p className={`text-xs font-bold mt-2 ${color} opacity-80 tracking-wider`}>
            {cast.rolls.join("  |  ")}
          </p>
        )}
      </motion.div>
    </motion.div>
  );
}

/** Active status effects as compact chips under a fighter's bars. */
function EffectChips({ effects, side }: { effects: ActiveEffect[]; side: "left" | "right" }) {
  if (effects.length === 0) return null;
  return (
    <div className={`mt-1.5 flex flex-wrap gap-1 ${side === "right" ? "justify-end" : ""}`}>
      <AnimatePresence>
        {effects.map((e) => (
          <motion.span
            key={`${e.kind}-${e.label}`}
            className={`px-1.5 py-0.5 border text-[8px] font-bold tracking-widest tabular-nums ${
              isHarmful(e.kind)
                ? "border-neon-pink/50 text-neon-pink bg-neon-pink/5"
                : "border-neon-cyan/50 text-neon-cyan bg-neon-cyan/5"
            }`}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
          >
            {e.label}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}

// --- Battle Chat + Emoji Reactions -----------------------------------
// Issue 2: lightweight preset-only expression system. No free-text, no
// gameplay interruption. 3-second cooldown between sends prevents spam.
// Works one-sided for a bot (local display only, no broadcast).

let _chatIdCounter = 0;

function BattleChat({
  pvpChannelRef,
  opponentType,
  opponentName,
  playerName,
  phase,
  incomingItems,
}: {
  pvpChannelRef: React.MutableRefObject<RealtimeChannel | null>;
  opponentType: OpponentType;
  opponentName: string;
  playerName: string;
  phase: Phase;
  incomingItems: ChatItem[];
}) {
  const [sentItems, setSentItems] = useState<ChatItem[]>([]);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [muted, setMuted] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [tick, setTick] = useState(0);

  // Drive cooldown countdown without excessive re-renders
  useEffect(() => {
    if (tick === 0) return;
    const id = setInterval(() => setTick(Date.now()), 200);
    return () => clearInterval(id);
  }, [tick]);

  // Auto-expire displayed items after 4 s
  const allItems = [...sentItems, ...(muted ? [] : incomingItems)].sort((a, b) => a.ts - b.ts);

  const visibleItems = allItems.filter((item) => Date.now() - item.ts < 4000);

  // Only visible during active battle phases - zero footprint otherwise
  const isActive = phase === "select" || phase === "question" || phase === "animate";
  if (!isActive) return null;

  const now = Date.now();
  const onCooldown = now < cooldownUntil;
  const cooldownSec = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  const send = (text: string) => {
    if (onCooldown) return;
    const item: ChatItem = {
      id: ++_chatIdCounter,
      text,
      fromPlayer: true,
      senderName: playerName,
      ts: Date.now(),
    };
    setSentItems((prev) => [...prev, item]);
    setCooldownUntil(Date.now() + 3000);
    setTick(Date.now()); // kick countdown interval

    if (opponentType === "live" && pvpChannelRef.current) {
      pvpChannelRef.current.send({
        type: "broadcast",
        event: "chat",
        payload: { text, sender_name: playerName },
      });
    }
  };

  return (
    <div className="relative">
      {/* Floating message bubbles - up to 2 visible at once */}
      <div className="absolute bottom-full mb-1 w-full pointer-events-none z-10 space-y-1">
        <AnimatePresence>
          {visibleItems.slice(-2).map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 6, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.94 }}
              transition={{ duration: 0.18 }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 border text-[11px] font-bold tracking-wide ${
                item.fromPlayer
                  ? "float-right ml-auto border-neon-purple/50 bg-neon-purple/10 text-neon-purple"
                  : "border-neon-pink/50 bg-neon-pink/10 text-neon-pink"
              }`}
              style={{ float: item.fromPlayer ? "right" : "left", clear: "both" }}
            >
              {!item.fromPlayer && (
                <span className="text-muted-foreground text-[9px] font-normal">
                  {item.senderName}:
                </span>
              )}
              {item.text}
            </motion.div>
          ))}
        </AnimatePresence>
        {/* clearfix */}
        <div style={{ clear: "both" }} />
      </div>

      {/* Toolbar */}
      <div className="btt-card p-2 flex items-center gap-2 flex-wrap">
        {/* Toggle + mute controls */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setShowPanel((v) => !v)}
            title="Quick chat"
            aria-label="Quick chat"
            aria-expanded={showPanel}
            className={`p-1.5 border text-[10px] font-bold transition-colors ${
              showPanel
                ? "border-neon-purple/60 text-neon-purple bg-neon-purple/10"
                : "border-border/40 text-muted-foreground hover:border-border"
            } active:scale-[0.97]`}
          >
            <MessageSquare className="w-3 h-3" />
          </button>
          <button
            onClick={() => setMuted((v) => !v)}
            title={muted ? "Unmute opponent" : "Mute opponent"}
            aria-label={muted ? "Unmute opponent" : "Mute opponent"}
            aria-pressed={muted}
            className={`p-1.5 border text-[10px] font-bold transition-colors ${
              muted
                ? "border-neon-pink/60 text-neon-pink bg-neon-pink/10"
                : "border-border/40 text-muted-foreground hover:border-border"
            } active:scale-[0.97]`}
          >
            {muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
          </button>
        </div>

        <AnimatePresence>
          {showPanel && (
            <motion.div
              initial={{ opacity: 0, maxWidth: 0 }}
              animate={{ opacity: 1, maxWidth: 600 }}
              exit={{ opacity: 0, maxWidth: 0 }}
              transition={{ duration: 0.18 }}
              className="flex items-center gap-1 flex-wrap overflow-hidden"
            >
              {/* Preset phrases */}
              {CHAT_PHRASES.map((phrase) => (
                <button
                  key={phrase}
                  onClick={() => send(phrase)}
                  disabled={onCooldown}
                  className="px-2 py-1 border border-border/40 hover:border-neon-purple/50 text-[10px] font-bold tracking-wide transition-colors disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.97]"
                >
                  {phrase}
                </button>
              ))}

              {onCooldown && (
                <span className="text-[9px] font-mono text-muted-foreground ml-1 tabular-nums">
                  {cooldownSec}s
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// --- Gambler Reveal ---------------------------------------------------
// Stat definitions for the slot-machine reveal sequence.
interface RevealDef {
  key: keyof GamblerRoll;
  label: string;
  /** Formatted value shown once locked */
  lockText: (s: GamblerRoll) => string;
  /** Integer range cycled while unlocked (avoids floating-point flicker) */
  cycleRange: [number, number];
  /** Returns a 0-1 score for quality colouring (higher = better) */
  qualityScore: (s: GamblerRoll) => number;
  hasQuality: boolean;
}

const REVEAL_DEFS: RevealDef[] = [
  {
    key: "maxHp",
    label: "HP",
    lockText: (s) => String(s.maxHp),
    cycleRange: [90, 220],
    qualityScore: (s) => (s.maxHp - 90) / 130,
    hasQuality: true,
  },
  {
    key: "baseDamage",
    label: "DMG",
    lockText: (s) => String(s.baseDamage),
    cycleRange: [10, 40],
    qualityScore: (s) => (s.baseDamage - 10) / 30,
    hasQuality: true,
  },
  {
    key: "defense",
    label: "DEF",
    lockText: (s) => `${Math.round(s.defense * 100)}%`,
    cycleRange: [0, 20],
    qualityScore: (s) => s.defense / 0.2,
    hasQuality: true,
  },
  {
    key: "timeSeconds",
    label: "TIME",
    lockText: (s) => `${s.timeSeconds}s`,
    cycleRange: [20, 80],
    qualityScore: (s) => (s.timeSeconds - 20) / 60,
    hasQuality: true,
  },
  {
    key: "healAmount",
    label: "HEAL",
    lockText: (s) => `+${s.healAmount}`,
    cycleRange: [0, 30],
    qualityScore: (s) => s.healAmount / 30,
    hasQuality: true,
  },
  {
    key: "critBonus",
    label: "CRIT",
    lockText: (s) => `+${Math.round(s.critBonus * 100)}%`,
    cycleRange: [0, 40],
    qualityScore: (s) => s.critBonus / 0.4,
    hasQuality: true,
  },
  {
    key: "diffMin",
    label: "DIFF",
    lockText: (s) => `${s.diffMin}-${s.diffMax}`,
    cycleRange: [2, 10],
    qualityScore: () => 0.5,
    hasQuality: false,
  },
];

type StatQuality = "poor" | "standard" | "good" | "legendary";

function scoreToQuality(score: number): StatQuality {
  if (score < 0.25) return "poor";
  if (score < 0.55) return "standard";
  if (score < 0.82) return "good";
  return "legendary";
}

const QUALITY_STYLE: Record<
  StatQuality,
  { label: string; value: string; border: string; bg: string }
> = {
  poor: { label: "LOW", value: "text-muted-foreground/70", border: "border-border/50", bg: "" },
  standard: { label: "BASE", value: "text-foreground", border: "border-border/70", bg: "" },
  good: {
    label: "HIGH",
    value: "text-neon-cyan",
    border: "border-neon-cyan/50",
    bg: "bg-neon-cyan/5",
  },
  legendary: {
    label: "MAX",
    value: "text-neon-pink",
    border: "border-neon-pink/60",
    bg: "bg-neon-pink/5",
  },
};

/** Pre-battle slot-machine reveal for the Gambler archetype. */
function GamblerRevealScreen({
  stats,
  opponentName,
  onComplete,
}: {
  stats: GamblerRoll;
  opponentName: string;
  onComplete: () => void;
}) {
  const STAGGER = 850; // ms between each stat locking (7 stats - keep it snappy)

  const [lockedCount, setLockedCount] = useState(0);
  const lockedRef = useRef(0);
  lockedRef.current = lockedCount;

  const [cycleNums, setCycleNums] = useState<number[]>(() =>
    REVEAL_DEFS.map((d) => d.cycleRange[0]),
  );
  const [allDone, setAllDone] = useState(false);

  useEffect(() => {
    // Cycle all not-yet-locked stats every 80 ms (slot-machine effect)
    const interval = setInterval(() => {
      setCycleNums(
        REVEAL_DEFS.map((d, i) =>
          i < lockedRef.current
            ? 0
            : d.cycleRange[0] + Math.floor(Math.random() * (d.cycleRange[1] - d.cycleRange[0] + 1)),
        ),
      );
    }, 80);

    // Lock one stat at a time with a staggered sequence
    const lockTimers = REVEAL_DEFS.map((_, i) =>
      setTimeout(
        () => {
          lockedRef.current = i + 1;
          setLockedCount(i + 1);
        },
        STAGGER * (i + 1),
      ),
    );

    // Show the CTA once all stats are locked
    const doneTimer = setTimeout(
      () => {
        clearInterval(interval);
        setAllDone(true);
      },
      STAGGER * REVEAL_DEFS.length + 700,
    );

    return () => {
      clearInterval(interval);
      lockTimers.forEach(clearTimeout);
      clearTimeout(doneTimer);
    };
  }, []);

  // Overall build rating - average quality score across stats that have one
  const qualityStats = REVEAL_DEFS.filter((d) => d.hasQuality);
  const avgQuality =
    qualityStats.reduce((s, d) => s + d.qualityScore(stats), 0) / qualityStats.length;

  const runLabel =
    avgQuality >= 0.78
      ? "GOD ROLL"
      : avgQuality >= 0.6
        ? "BLESSED RUN"
        : avgQuality >= 0.42
          ? "SOLID BUILD"
          : avgQuality >= 0.25
            ? "BALANCED ODDS"
            : "GLASS CANNON";

  const runColor =
    avgQuality >= 0.78
      ? "text-neon-pink"
      : avgQuality >= 0.6
        ? "text-tier-gold"
        : avgQuality >= 0.42
          ? "text-neon-cyan"
          : "text-foreground";

  return (
    <motion.div
      className="btt-card p-8 text-center"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      {/* Header */}
      <div className="mb-5">
        <motion.div
          className="w-14 h-14 mx-auto mb-3 border-2 border-tier-gold/50 bg-tier-gold/10 flex items-center justify-center"
          animate={
            !allDone
              ? {
                  rotate: [0, 12, -12, 0],
                  borderColor: [
                    "oklch(0.8 0.15 80 / 0.5)",
                    "oklch(0.75 0.18 50 / 0.8)",
                    "oklch(0.8 0.15 80 / 0.5)",
                  ],
                }
              : {}
          }
          transition={{ duration: 1.2, repeat: Infinity }}
        >
          <Dices className="w-7 h-7 text-tier-gold" />
        </motion.div>
        <h3 className="btt-shout text-3xl mb-0.5">
          {allDone ? "FATE HAS SPOKEN" : "ROLLING FATE..."}
        </h3>
        <p className="text-[10px] text-muted-foreground tracking-widest">
          {allDone ? `vs ${opponentName}` : "YOUR BUILD IS BEING DETERMINED"}
        </p>
      </div>

      {/* 2-column stat grid - each cell cycles then locks with a quality pop */}
      <div className="grid grid-cols-2 gap-2 mb-5 text-left">
        {REVEAL_DEFS.map((def, i) => {
          const isLocked = i < lockedCount;
          const justLocked = i === lockedCount - 1;
          const quality = def.hasQuality ? scoreToQuality(def.qualityScore(stats)) : "standard";
          const qs = QUALITY_STYLE[quality];

          return (
            <motion.div
              key={def.key}
              className={`border p-4 transition-colors duration-300 ${
                isLocked ? `${qs.border} ${qs.bg}` : "border-border/30 bg-secondary/10"
              }`}
              animate={justLocked ? { scale: [1, 1.07, 1] } : {}}
              transition={{ duration: 0.35 }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[9px] font-bold tracking-widest text-muted-foreground">
                  {def.label}
                </span>
                {isLocked && def.hasQuality && (
                  <motion.span
                    className={`text-[8px] font-bold tracking-widest ${qs.value}`}
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    {qs.label}
                  </motion.span>
                )}
              </div>
              {/* Value: cycling integers when unlocked, formatted text when locked */}
              <div
                className={`btt-shout text-3xl tabular-nums ${
                  isLocked ? qs.value : "text-foreground/50"
                }`}
              >
                {isLocked ? def.lockText(stats) : cycleNums[i]}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Overall run rating + CTA - appears after all stats are locked */}
      <AnimatePresence>
        {allDone && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <p className={`text-sm font-bold font-display tracking-widest ${runColor}`}>
              {runLabel}
            </p>
            <motion.button
              onClick={onComplete}
              className="w-full py-3 bg-neon-pink text-primary-foreground font-bold text-sm tracking-widest hover:opacity-90 transition-opacity"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.35 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              <Swords className="w-4 h-4 inline mr-2" />
              ENTER BATTLE
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// --- Main Battle Engine ----------------------------------------------
function BattleArena() {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>("idle");
  const [showPractice, setShowPractice] = useState(false);
  /** Concept to drop straight into when Practice is opened from a battle report. */
  const [practiceConcept, setPracticeConcept] = useState<string | null>(null);
  // -- Game mode ---------------------------------------------------------
  // Modes never touch stat-mechanics/resolve-ultimate/effects - they only
  // redirect what an already-computed dmg/heal number is spent on. `gameMode`
  // is read inside async turn callbacks, so it gets the same ref-twin pattern
  // as everything else those callbacks need.
  const [gameMode, setGameMode] = useState<GameModeId>("battle");
  const gameModeRef = useRef<GameModeId>("battle");
  const [tugState, setTugState] = useState<TugState>(initialTugState());
  const tugStateRef = useRef<TugState>(initialTugState());
  const [territoryGrid, setTerritoryGrid] = useState<TerritoryGridT>(startingGrid());
  const territoryGridRef = useRef<TerritoryGridT>(startingGrid());
  const territoryWeightsRef = useRef<TerritoryWeights>(initialWeights());
  const [territoryFlipped, setTerritoryFlipped] = useState<number[]>([]);
  // Flags the player has earned but not yet placed (Territory only). The turn
  // loop parks in the "placing" phase until this reaches zero.
  const pendingPlacementRef = useRef<{
    /** What the flag waiting to be planted is worth. */
    weight: number;
    /** Whose turn was interrupted to ask for it. A reflect can earn the player
     *  a flag in the middle of the *bot's* turn, and resuming into the bot
     *  again there would silently hand it two turns in a row. */
    resume: "player" | "opponent";
  } | null>(null);
  /** Who is acting right now, so grantFlag knows which turn it interrupted. */
  const actingSideRef = useRef<"player" | "opponent">("player");
  /** Weight of the flag awaiting placement, for the prompt. 0 when none. */
  const [placementWeight, setPlacementWeight] = useState(0);
  /** Turns taken this match - Territory's stand-in for the spec's match clock. */
  const modeTurnsRef = useRef(0);
  /** Opponent's correct answers, for Territory's tied-board tiebreak. */
  const opponentCorrectRef = useRef(0);
  // Draft Battle team state lives only in refs - nothing renders a roster
  // sidebar yet, and the turn-loop logic (resolveModeOutcome, startBattle)
  // only ever needs synchronous reads, never a re-render.
  const playerDraftTeamRef = useRef<DraftTeam | null>(null);
  const opponentDraftTeamRef = useRef<DraftTeam | null>(null);
  const [archetype, setArchetype] = useState<ArchetypeId>("speedster");
  const [opponentArchetype, setOpponentArchetype] = useState<ArchetypeId>("tank");
  const [player, setPlayer] = useState<Fighter>({
    name: "You",
    hp: 100,
    maxHp: 100,
    focus: 20,
    maxFocus: 100,
    icon: User,
  });
  const [opponent, setOpponent] = useState<Fighter>({
    name: "Opponent",
    hp: 100,
    maxHp: 100,
    focus: 20,
    maxFocus: 100,
    icon: HelpCircle,
  });
  const [momentum, setMomentum] = useState(0);
  const [opponentMomentum, setOpponentMomentum] = useState(0);
  const [currentAction, setCurrentAction] = useState<Action | null>(null);
  const [question, setQuestion] = useState<MathQuestion | null>(null);
  const [questionChallengeId, setQuestionChallengeId] = useState<string | null>(null);
  const answeredChallengeIdsRef = useRef<string[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [maxTime, setMaxTime] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showPlayerHit, setShowPlayerHit] = useState(false);
  const [showOpponentHit, setShowOpponentHit] = useState(false);
  const [showPlayerHeal, setShowPlayerHeal] = useState(false);
  const [totalScore, setTotalScore] = useState(0);
  const [records, setRecords] = useState<QuestionRecord[]>([]);
  // -- Ultimate & status-effect state ----------------------------------
  // Charge is a 0-1 meter filled by correct answers; effects are the flat,
  // serialisable status lists from battles/effects.ts. Each has a ref twin
  // because the async turn callbacks (bot, PvP resolution) read them
  // outside React's render cycle.
  const [ultimateCharge, setUltimateCharge] = useState(0);
  const [opponentCharge, setOpponentCharge] = useState(0);
  const [playerEffects, setPlayerEffects] = useState<ActiveEffect[]>([]);
  const [opponentEffects, setOpponentEffects] = useState<ActiveEffect[]>([]);
  const [ultimateCast, setUltimateCast] = useState<{
    name: string;
    caster: "player" | "opponent";
    rolls: string[];
  } | null>(null);
  /** Equipped Ecliptar slug and remaining cooldown, as state so the UI reacts. */
  const [ecliptarSlug, setEcliptarSlug] = useState<string | null>(null);
  const [ultimateCooldown, setUltimateCooldown] = useState(0);
  const ultimateChargeRef = useRef(0);
  const opponentChargeRef = useRef(0);
  const playerEffectsRef = useRef<ActiveEffect[]>([]);
  const opponentEffectsRef = useRef<ActiveEffect[]>([]);
  const playerBonusDamageRef = useRef(0);
  const opponentBonusDamageRef = useRef(0);
  const ultimateCooldownRef = useRef(0);
  const opponentCooldownRef = useRef(0);
  /** Seconds to add to the player's next clock, set by an opponent ultimate. */
  const pendingTimerDeltaRef = useRef(0);
  /** Correr: pins the next clock and pays out for unused seconds. */
  const nextTimerOverrideRef = useRef<{ seconds: number; damagePerUnusedSecond: number } | null>(
    null,
  );
  /** Set when an ultimate grants an immediate second turn. */
  const extraTurnRef = useRef(false);
  /** Player HP at the start of each past turn, most recent first (Temporobys). */
  const hpHistoryRef = useRef<number[]>([]);
  /** The bot's Ecliptar, so it casts a real ultimate from its own archetype. */
  const opponentEcliptarRef = useRef<string | null>(null);
  /** The player's equipped Ecliptar slug - keys their ultimate. */
  const ecliptarRef = useRef<string | null>(null);
  const momentumRef = useRef(0);
  // Correct answers banked this match - drives the Accelerator ramp and God's
  // every-third-answer heal, both of which count answers, not turns.
  const [correctCount, setCorrectCount] = useState(0);
  // Fulcrum only: the passive borrowed for the current round, rolled fresh
  // each time an action is chosen and applied at reduced strength.
  const [copiedPassive, setCopiedPassive] = useState<ArchetypeId | null>(null);
  const [longestStreak, setLongestStreak] = useState(0);
  const [fastestAnswer, setFastestAnswer] = useState(Infinity);
  const [battleStats, setBattleStats] = useState<BattleStats | null>(null);
  const [gamblerStats, setGamblerStats] = useState<GamblerRoll | null>(null);
  // Impact/event layer: combo bursts, battle-start stinger, KO banner
  const [comboBurst, setComboBurst] = useState<{ id: number; combo: number; mult: number } | null>(
    null,
  );
  const comboBurstIdRef = useRef(0);
  const [koBanner, setKoBanner] = useState<"victory" | "defeat" | null>(null);
  const [showFight, setShowFight] = useState(false);
  const fightShownRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const battleMemoryRef = useRef<BattleMemory | null>(null);
  const [playerXp, setPlayerXp] = useState<number>(0);

  // Issue 1: ref-based log pipeline - prevents React batching from swallowing
  // multiple synchronous addLog calls and eliminates nested-setState side-effects.
  const logCounterRef = useRef(0);
  const pendingLogsRef = useRef<LogEntry[]>([]);

  // Issue 1: snapshot refs so aiTurn can read current HP without
  // calling setState inside another setState's updater function.
  const playerRef = useRef(player);
  const opponentRef = useRef(opponent);
  const recordsRef = useRef<QuestionRecord[]>([]);
  const archetypeRef = useRef<ArchetypeId>(archetype);
  const correctCountRef = useRef(0);
  const copiedPassiveRef = useRef<ArchetypeId | null>(null);
  const longestStreakRef = useRef(0);
  const fastestAnswerRef = useRef(Infinity);
  const totalScoreRef = useRef(0);

  // Issue 2: incoming chat items populated by the PvP channel subscription.
  const [incomingChats, setIncomingChats] = useState<ChatItem[]>([]);
  const chatCounterRef = useRef(0);
  const chatMutedRef = useRef(false);

  // PvP / matchmaking state
  const [opponentType, setOpponentType] = useState<OpponentType>("bot");
  const [confirmExit, setConfirmExit] = useState(false);
  const [matchStatus, setMatchStatus] = useState("Finding opponent...");
  const [pvpBattleId, setPvpBattleId] = useState<string | null>(null);
  const [playerRating, setPlayerRating] = useState(1000);
  const [playerUsername, setPlayerUsername] = useState<string | null>(null);
  const [opponentRating, setOpponentRating] = useState(1000);
  const [ratingChange, setRatingChange] = useState<number | null>(null);
  const [liveTurnNumber, setLiveTurnNumber] = useState(1);
  const [liveActionLocked, setLiveActionLocked] = useState(false);
  const [liveOpponentLocked, setLiveOpponentLocked] = useState(false);
  const [liveResolvingTurn, setLiveResolvingTurn] = useState(false);
  const [liveRematchState, setLiveRematchState] = useState<"idle" | "waiting" | "starting">("idle");

  // Refs for async-safe access inside callbacks
  const pvpChannelRef = useRef<RealtimeChannel | null>(null);
  const playerRatingRef = useRef(1000);
  const opponentRatingRef = useRef(1000);
  const opponentTypeRef = useRef<OpponentType>("bot");
  const pvpBattleIdRef = useRef<string | null>(null);
  const liveTurnNumberRef = useRef(1);
  const liveActionLockedRef = useRef(false);
  const liveOpponentLockedRef = useRef(false);
  const liveResolvingRef = useRef(false);
  const liveResolvedTurnsRef = useRef<Set<number>>(new Set());
  const livePendingActionRef = useRef<LiveTurnActionRow | null>(null);
  const liveChallengeIdRef = useRef<string | null>(null);
  const liveChallengeAnswerRef = useRef<number | null>(null);
  const liveResolutionRef = useRef<(actions: LiveTurnActionRow[], turnNumber: number) => void>(
    () => {},
  );
  const rematchStartedRef = useRef(false);
  const liveRematchStateRef = useRef<"idle" | "waiting" | "starting">("idle");
  const rematchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const myUserIdRef = useRef<string | null>(null);
  const opponentUserIdRef = useRef<string | null>(null);
  const iAmChallengerRef = useRef(false);
  // Idempotency guard so finishBattle runs exactly once per battle, even if
  // both the local HP-zero check and the opponent's broadcast battle_end
  // arrive. Rating is completed through idempotent backend RPCs.
  const battleFinishedRef = useRef(false);

  // Fetch player profile (XP + rating + username)
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      myUserIdRef.current = user.id;
      const [profileRes, ratingData] = await Promise.all([
        supabase.from("user_profiles").select("xp, username").eq("user_id", user.id).maybeSingle(),
        fetchPlayerRating(),
      ]);
      setPlayerXp(profileRes.data?.xp ?? 0);
      setPlayerUsername(profileRes.data?.username ?? null);
      setPlayerRating(ratingData.rating);
      playerRatingRef.current = ratingData.rating;
    })();
  }, []);

  // Live PvP: subscribe to Realtime channel when a live battle is active
  useEffect(() => {
    if (!pvpBattleId || opponentType !== "live") return;

    const channel = supabase.channel(`pvp-battle:${pvpBattleId}`, {
      config: { broadcast: { self: false }, private: true },
    });

    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "pvp_turn_actions",
          filter: `battle_id=eq.${pvpBattleId}`,
        },
        async (payload) => {
          const row = payload.new as { turn_number: number; actor_id: string };
          if (row.turn_number !== liveTurnNumberRef.current) return;
          if (row.actor_id !== myUserIdRef.current) {
            liveOpponentLockedRef.current = true;
            setLiveOpponentLocked(true);
          }
          if (liveActionLockedRef.current) {
            const { data } = await supabase.rpc("get_pvp_turn_resolution", {
              p_battle_id: pvpBattleId,
              p_turn_number: row.turn_number,
            });
            if (data?.ready) liveResolutionRef.current(data.actions ?? [], row.turn_number);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pvp_battles",
          filter: `id=eq.${pvpBattleId}`,
        },
        async (payload) => {
          const row = payload.new as TableRow<"pvp_battles">;
          if (row.status === "completed" && row.winner_id && !battleFinishedRef.current) {
            // A battle can also be resolved by the server's reaper when the
            // other side goes quiet. Say so - otherwise the win arrives out of
            // nowhere and reads as a bug rather than a forfeit.
            if (row.abandoned_by && row.abandoned_by !== myUserIdRef.current) {
              toast(`${opponentRef.current.name} left the battle.`, {
                description: "The match is yours by abandonment.",
              });
            }
            finishBattle(row.winner_id === myUserIdRef.current);
          }
          if (row.rematch_battle_id && !rematchStartedRef.current) {
            rematchStartedRef.current = true;
            setLiveRematchState("starting");
            await startLiveBattleFromId(row.rematch_battle_id);
          } else if (
            Array.isArray(row.rematch_requested_by) &&
            row.rematch_requested_by.length === 1 &&
            row.rematch_requested_by[0] !== myUserIdRef.current &&
            liveRematchStateRef.current === "idle"
          ) {
            // Opponent asked for a rematch first - surface it so the player
            // knows clicking QUICK REMATCH will jump straight into another match.
            toast(`${opponentRef.current.name} wants a rematch.`, {
              description: "Click QUICK REMATCH on the result screen to accept.",
            });
          }
        },
      )
      .on("broadcast", { event: "battle_end" }, ({ payload }) => {
        if (payload.winner_id) finishBattle(payload.winner_id === myUserIdRef.current);
      })
      // Issue 2: receive opponent chat / emoji reactions
      .on("broadcast", { event: "chat" }, ({ payload }) => {
        if (chatMutedRef.current) return;
        setIncomingChats((prev) => [
          ...prev,
          {
            id: ++chatCounterRef.current,
            text: payload.text as string,
            fromPlayer: false,
            senderName: opponentRef.current.name,
            ts: Date.now(),
          },
        ]);
      })
      .subscribe();

    pvpChannelRef.current = channel;
    return () => {
      void supabase.removeChannel(channel);
      pvpChannelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pvpBattleId, opponentType]);

  // Keep snapshot refs in sync after every render so async callbacks always
  // read the latest HP without nesting setState inside another updater.
  useEffect(() => {
    playerRef.current = player;
  }, [player]);
  useEffect(() => {
    opponentRef.current = opponent;
  }, [opponent]);
  useEffect(() => {
    recordsRef.current = records;
  }, [records]);
  useEffect(() => {
    archetypeRef.current = archetype;
  }, [archetype]);
  useEffect(() => {
    correctCountRef.current = correctCount;
  }, [correctCount]);
  useEffect(() => {
    copiedPassiveRef.current = copiedPassive;
  }, [copiedPassive]);
  useEffect(() => {
    ultimateChargeRef.current = ultimateCharge;
  }, [ultimateCharge]);
  useEffect(() => {
    opponentChargeRef.current = opponentCharge;
  }, [opponentCharge]);
  useEffect(() => {
    playerEffectsRef.current = playerEffects;
  }, [playerEffects]);
  useEffect(() => {
    opponentEffectsRef.current = opponentEffects;
  }, [opponentEffects]);
  useEffect(() => {
    momentumRef.current = momentum;
  }, [momentum]);
  useEffect(() => {
    ecliptarRef.current = ecliptarSlug;
  }, [ecliptarSlug]);

  /** Clear every ultimate and status-effect field at the start of a battle. */
  const resetUltimateState = useCallback(() => {
    ultimateChargeRef.current = 0;
    setUltimateCharge(0);
    opponentChargeRef.current = 0;
    setOpponentCharge(0);
    playerEffectsRef.current = [];
    setPlayerEffects([]);
    opponentEffectsRef.current = [];
    setOpponentEffects([]);
    playerBonusDamageRef.current = 0;
    opponentBonusDamageRef.current = 0;
    ultimateCooldownRef.current = 0;
    setUltimateCooldown(0);
    opponentCooldownRef.current = 0;
    pendingTimerDeltaRef.current = 0;
    nextTimerOverrideRef.current = null;
    extraTurnRef.current = false;
    hpHistoryRef.current = [];
    setUltimateCast(null);
  }, []);

  /** Single writer for the player's cooldown, keeping ref and state in step. */
  const setPlayerCooldown = useCallback((turns: number) => {
    ultimateCooldownRef.current = turns;
    setUltimateCooldown(turns);
  }, []);

  /** The equipped Ecliptar's ultimate, and whether it can be cast right now. */
  const playerUltimate = getUltimate(ecliptarSlug);
  const ultimateReady = Boolean(playerUltimate) && ultimateCharge >= 1 && ultimateCooldown <= 0;
  useEffect(() => {
    longestStreakRef.current = longestStreak;
  }, [longestStreak]);
  useEffect(() => {
    fastestAnswerRef.current = fastestAnswer;
  }, [fastestAnswer]);
  useEffect(() => {
    totalScoreRef.current = totalScore;
  }, [totalScore]);
  useEffect(() => {
    pvpBattleIdRef.current = pvpBattleId;
  }, [pvpBattleId]);
  useEffect(() => {
    liveRematchStateRef.current = liveRematchState;
  }, [liveRematchState]);

  const resetLiveTurnLocks = useCallback((nextTurn: number) => {
    liveTurnNumberRef.current = nextTurn;
    setLiveTurnNumber(nextTurn);
    liveActionLockedRef.current = false;
    liveOpponentLockedRef.current = false;
    liveResolvingRef.current = false;
    livePendingActionRef.current = null;
    setLiveActionLocked(false);
    setLiveOpponentLocked(false);
    setLiveResolvingTurn(false);
  }, []);

  const getArch = useCallback(
    (id: ArchetypeId): Archetype => {
      const base = ARCHETYPES[id];
      if (id === "gambler" && gamblerStats) return { ...base, ...gamblerStats };
      return base;
    },
    [gamblerStats],
  );

  const comboThreshold = archetype === "fulcrum" ? 2 : 3;

  /**
   * Issue 1 - single-pipeline addLog.
   *
   * All synchronous addLog calls within the same execution frame are
   * batched into one setLogs via queueMicrotask, preserving insertion order
   * and preventing React's automatic batching from collapsing multiple
   * functional-updater calls into a single stale-prev read.
   *
   * Deduplication by id ensures entries are never doubled even if the
   * microtask fires more than once (e.g. Strict-Mode double-invocation).
   */
  const addLog = useCallback((entry: Omit<LogEntry, "id">) => {
    const id = ++logCounterRef.current;
    pendingLogsRef.current = [...pendingLogsRef.current, { ...entry, id }];
    queueMicrotask(() => {
      if (pendingLogsRef.current.length === 0) return;
      const batch = pendingLogsRef.current.splice(0); // drain atomically
      setLogs((prev) => {
        const existingIds = new Set(prev.map((e) => e.id));
        return [...prev, ...batch.filter((e) => !existingIds.has(e.id))];
      });
    });
  }, []);

  const fireComboBurst = useCallback((combo: number, mult: number) => {
    const id = ++comboBurstIdRef.current;
    setComboBurst({ id, combo, mult });
    setTimeout(() => setComboBurst((prev) => (prev?.id === id ? null : prev)), 1200);
  }, []);

  // "FIGHT" stinger - fires once per battle, the first time we hit select.
  // The flag re-arms on any pre-battle phase (and on result, so a direct
  // result -> select rematch transition still gets its stinger).
  useEffect(() => {
    if (phase === "select" && !fightShownRef.current) {
      fightShownRef.current = true;
      setShowFight(true);
      const t = setTimeout(() => setShowFight(false), 1200);
      return () => clearTimeout(t);
    }
    if (
      phase === "idle" ||
      phase === "classSelect" ||
      phase === "searching" ||
      phase === "result"
    ) {
      fightShownRef.current = false;
    }
  }, [phase]);

  const resolveLiveTurn = useCallback(
    (actions: LiveTurnActionRow[], turnNumber: number) => {
      if (liveResolvedTurnsRef.current.has(turnNumber) || liveResolvingRef.current) return;
      const myId = myUserIdRef.current;
      if (!myId) return;
      const mine = actions.find((a) => a.actor_id === myId);
      const theirs = actions.find((a) => a.actor_id !== myId);
      if (!mine || !theirs) return;

      liveResolvedTurnsRef.current.add(turnNumber);
      liveResolvingRef.current = true;
      setLiveResolvingTurn(true);
      setPhase("animate");

      const curPlayer = playerRef.current;
      const curOpp = opponentRef.current;
      const nextPlayerHp = Math.max(
        0,
        Math.min(curPlayer.maxHp, curPlayer.hp - theirs.damage - mine.self_damage + mine.heal),
      );
      const nextOppHp = Math.max(
        0,
        Math.min(curOpp.maxHp, curOpp.hp - mine.damage - theirs.self_damage + theirs.heal),
      );

      if (mine.damage > 0) {
        setShowOpponentHit(true);
        addLog({
          actor: "player",
          actionType: mine.action === "wild" ? "info" : (mine.action as LogActionType),
          result: `${mine.action === "wild" ? "Wild" : ACTIONS[mine.action].label}: ${mine.damage} DMG.`,
          value: mine.damage,
        });
      }
      if (mine.heal > 0) {
        setShowPlayerHeal(true);
        addLog({
          actor: "player",
          actionType: "heal",
          result: `Heal resolves: +${mine.heal} HP.`,
          value: mine.heal,
        });
      }
      if (mine.self_damage > 0) {
        setShowPlayerHit(true);
        addLog({
          actor: "player",
          actionType: "miss",
          result: `Your miss resolves: -${mine.self_damage} HP.`,
          value: mine.self_damage,
        });
      }
      if (theirs.damage > 0) {
        setShowPlayerHit(true);
        addLog({
          actor: "opponent",
          actionType: theirs.action as LogActionType,
          result: `${opponentRef.current.name}: ${theirs.damage} DMG.`,
          value: theirs.damage,
        });
      }
      if (theirs.heal > 0)
        addLog({
          actor: "opponent",
          actionType: "heal",
          result: `${opponentRef.current.name} heals +${theirs.heal} HP.`,
          value: theirs.heal,
        });
      if (theirs.self_damage > 0)
        addLog({
          actor: "opponent",
          actionType: "miss",
          result: `${opponentRef.current.name} misses: -${theirs.self_damage} HP.`,
          value: theirs.self_damage,
        });

      setMomentum(mine.momentum);
      setOpponentMomentum(theirs.momentum);
      setPlayer((p) => ({
        ...p,
        hp: nextPlayerHp,
        focus: Math.max(0, Math.min(p.maxFocus, p.focus + mine.focus_delta)),
      }));
      setOpponent((o) => ({
        ...o,
        hp: nextOppHp,
        focus: Math.max(0, Math.min(o.maxFocus, o.focus + theirs.focus_delta)),
      }));

      setTimeout(() => {
        setShowPlayerHit(false);
        setShowOpponentHit(false);
        setShowPlayerHeal(false);
        if (nextOppHp <= 0 || nextPlayerHp <= 0)
          finishBattle(nextOppHp <= 0 && nextPlayerHp > 0 ? true : nextOppHp <= nextPlayerHp);
        else {
          resetLiveTurnLocks(turnNumber + 1);
          setPhase("select");
        }
      }, 900);
    },
    [addLog, resetLiveTurnLocks],
  );

  useEffect(() => {
    liveResolutionRef.current = resolveLiveTurn;
  }, [resolveLiveTurn]);

  async function startLiveBattleFromId(battleId: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    myUserIdRef.current = user.id;
    const { data: battle } = await supabase
      .from("pvp_battles")
      .select("challenger_id, opponent_id, challenger_archetype, opponent_archetype")
      .eq("id", battleId)
      .maybeSingle();
    if (!battle) return;
    const iAmChallenger = battle.challenger_id === user.id;
    const oppId = iAmChallenger ? battle.opponent_id : battle.challenger_id;
    const { data: prof } = await supabase
      .from("user_profiles")
      .select("username")
      .eq("user_id", oppId)
      .maybeSingle();
    const { data: rating } = await supabase
      .from("player_ratings")
      .select("rating")
      .eq("user_id", oppId)
      .maybeSingle();
    startDirectBattle({
      battleId,
      // Archetypes are written by this client on enqueue, so the `text`
      // columns hold ArchetypeId values by construction.
      myArchetype: (iAmChallenger
        ? battle.challenger_archetype
        : battle.opponent_archetype) as ArchetypeId,
      opponentArchetype: (iAmChallenger
        ? battle.opponent_archetype
        : battle.challenger_archetype) as ArchetypeId,
      opponentName: prof?.username ?? `Player_${oppId.slice(0, 6)}`,
      opponentRating: rating?.rating ?? 1000,
      iAmChallenger,
      opponentUserId: oppId,
    });
  }

  /** Snapshot one side in the shape resolve-ultimate.ts expects. */
  const snapshotSide = useCallback(
    (who: "player" | "opponent"): SideState => {
      const f = who === "player" ? playerRef.current : opponentRef.current;
      const arch = getArch(who === "player" ? archetypeRef.current : opponentArchetype);
      return {
        arch,
        hp: f.hp,
        maxHp: f.maxHp,
        shield: f.shield ?? 0,
        effects: who === "player" ? playerEffectsRef.current : opponentEffectsRef.current,
        bonusDamage:
          who === "player" ? playerBonusDamageRef.current : opponentBonusDamageRef.current,
        scoreMult:
          who === "player"
            ? getScoreMultiplier(
                arch,
                momentumRef.current,
                correctCountRef.current,
                copiedPassiveRef.current,
              )
            : 1 + totalOf(opponentEffectsRef.current, "scoreMult"),
      };
    },
    [getArch, opponentArchetype],
  );

  /**
   * Cast an ultimate and commit its outcome to battle state.
   *
   * Everything the ops produced - HP, shields, effects, timers, permanent
   * damage, charge refunds - is written here so the player, bot and PvP paths
   * share one commit point rather than each re-deriving the rules.
   */
  const castUltimate = useCallback(
    (ult: Ultimate, caster: "player" | "opponent"): { extraTurn: boolean } => {
      const casterSide = snapshotSide(caster);
      const targetSide = snapshotSide(caster === "player" ? "opponent" : "player");

      const outcome = resolveUltimate(ult, {
        caster: casterSide,
        target: targetSide,
        correctCount: correctCountRef.current,
        hpHistory: caster === "player" ? hpHistoryRef.current : [],
      });

      const isPlayer = caster === "player";
      const casterIsPlayerSide = isPlayer ? outcome.caster : outcome.target;
      const oppSideOut = isPlayer ? outcome.target : outcome.caster;

      // Outside an HP mode the resolver's health numbers are not what the match
      // turns on, so they are not written to the fighters - the ultimate's
      // damage and healing get spent on the mode's own resource below instead.
      // Everything else the ultimate did (shields, effects, bonus damage,
      // timers, charge) lands identically either way.
      const usesHp = modeUsesHp();

      // Player fighter + effects
      setPlayer((prev) => ({
        ...prev,
        hp: usesHp ? Math.max(0, Math.min(prev.maxHp, casterIsPlayerSide.hp)) : prev.hp,
        shield: casterIsPlayerSide.shield,
      }));
      playerEffectsRef.current = casterIsPlayerSide.effects;
      setPlayerEffects(casterIsPlayerSide.effects);
      playerBonusDamageRef.current = casterIsPlayerSide.bonusDamage;

      // Opponent fighter + effects
      setOpponent((prev) => ({
        ...prev,
        hp: usesHp ? Math.max(0, Math.min(prev.maxHp, oppSideOut.hp)) : prev.hp,
        shield: oppSideOut.shield,
      }));
      opponentEffectsRef.current = oppSideOut.effects;
      setOpponentEffects(oppSideOut.effects);
      opponentBonusDamageRef.current = oppSideOut.bonusDamage;

      if (!usesHp) {
        spendDamage(caster, outcome.damageDealt);
        spendHeal(caster, outcome.healed);
        // A self-damaging ultimate gives ground in Tug-of-War exactly as a
        // wrong answer does, and costs nothing on a Territory board.
        spendMiss(caster, outcome.selfDamage);
      }

      // Timers: a delta aimed at "opponent" lands on whoever is not the caster,
      // and only the player's clock is ours to change.
      const playerTimerDelta = isPlayer ? outcome.timerDelta.self : outcome.timerDelta.opponent;
      if (playerTimerDelta !== 0) pendingTimerDeltaRef.current += playerTimerDelta;
      if (isPlayer && outcome.nextTimerOverride) {
        nextTimerOverrideRef.current = outcome.nextTimerOverride;
      }

      // Charge: spend it, then honour any refund the ultimate rolled.
      // Casting resets to the configured floor, then any refund is added - the
      // level before the cast plays no part, so nothing is passed in.
      const chargeAfterCast = Math.max(
        0,
        Math.min(1, ULTIMATE_TUNING.chargeAfterCast + outcome.chargeRefund),
      );
      if (isPlayer) {
        const next = chargeAfterCast;
        ultimateChargeRef.current = next;
        setUltimateCharge(next);
        setPlayerCooldown(outcome.resetCooldowns ? 0 : ULTIMATE_TUNING.cooldownTurns);
      } else {
        const next = chargeAfterCast;
        opponentChargeRef.current = next;
        setOpponentCharge(next);
        opponentCooldownRef.current = outcome.resetCooldowns ? 0 : ULTIMATE_TUNING.cooldownTurns;
      }

      if (outcome.damageDealt > 0) {
        if (isPlayer) setShowOpponentHit(true);
        else setShowPlayerHit(true);
      }
      if (outcome.healed > 0 && isPlayer) setShowPlayerHeal(true);
      if (outcome.selfDamage > 0) {
        if (isPlayer) setShowPlayerHit(true);
        else setShowOpponentHit(true);
      }

      setUltimateCast({ name: ult.name, caster, rolls: outcome.rolls });
      setTimeout(() => setUltimateCast(null), 1800);
      sfxWild();

      const rollNote = outcome.rolls.length > 0 ? ` [${outcome.rolls.join(" | ")}]` : "";
      addLog({
        actor: isPlayer ? "player" : "opponent",
        actionType: "ultimate",
        result: `${isPlayer ? "" : `${opponentRef.current.name} `}ULTIMATE - ${ult.name}!${rollNote} ${outcome.notes.join(" ")}`,
        value: outcome.damageDealt,
      });

      return { extraTurn: outcome.extraTurn };
    },
    // The mode-routing helpers are plain declarations recreated each render and
    // read only refs and stable setters, so listing them would rebuild this
    // callback every render for no behavioural gain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addLog, snapshotSide, setPlayerCooldown],
  );

  /**
   * Run one side's turn-start effect tick: poison, regen and freeze expiry.
   * Returns whether the tick froze the turn, so callers can skip the action.
   */
  const runEffectTick = useCallback(
    (who: "player" | "opponent"): { frozen: boolean; died: boolean } => {
      const isPlayer = who === "player";
      const current = isPlayer ? playerEffectsRef.current : opponentEffectsRef.current;
      if (current.length === 0) return { frozen: false, died: false };

      const tick = tickEffects(current);
      const fighter = isPlayer ? playerRef.current : opponentRef.current;
      const canHeal =
        getArch(isPlayer ? archetypeRef.current : opponentArchetype).healAmount !== null;
      const healBlocked = hasEffect(current, "healBlock") || !canHeal;

      // Poison and regen are outcomes like any other, so outside an HP mode
      // they buy ground or flags instead of quietly draining a bar nobody is
      // looking at - which would otherwise make poison the only thing in these
      // modes that could still end a match by health.
      const other = isPlayer ? "opponent" : "player";
      const poisonHp = spendDamage(other, tick.poisonDamage);
      const regenHp = healBlocked ? 0 : spendHeal(who, tick.regenHeal);
      let hp = fighter.hp - poisonHp;
      hp = Math.min(fighter.maxHp, hp + regenHp);
      hp = Math.max(0, hp);

      if (isPlayer) {
        playerEffectsRef.current = tick.effects;
        setPlayerEffects(tick.effects);
        setPlayer((prev) => ({ ...prev, hp }));
        if (tick.poisonDamage > 0) setShowPlayerHit(true);
        if (tick.regenHeal > 0 && !healBlocked) setShowPlayerHeal(true);
      } else {
        opponentEffectsRef.current = tick.effects;
        setOpponentEffects(tick.effects);
        setOpponent((prev) => ({ ...prev, hp }));
        if (tick.poisonDamage > 0) setShowOpponentHit(true);
      }

      for (const note of tick.notes) {
        addLog({
          actor: isPlayer ? "player" : "opponent",
          actionType: tick.poisonDamage > 0 ? "miss" : "heal",
          result: `${isPlayer ? "You" : opponentRef.current.name}: ${note}`,
        });
      }

      // A freeze still costs the turn in every mode; death is only a thing
      // where health is the win condition.
      return { frozen: tick.frozen, died: modeUsesHp() && hp <= 0 };
    },
    // See the note on castUltimate: the spend*/mode* helpers are stable in
    // everything they touch, so they are deliberately not dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addLog, getArch, opponentArchetype],
  );

  useEffect(() => {
    if (phase === "question" && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            if (liveChallengeIdRef.current)
              liveChallengeAnswerRef.current = Number.MIN_SAFE_INTEGER;
            handleAnswer(false, maxTime);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
  }, [phase, question]);

  // -- Game mode: reinterpreting the same numbers, never new ones ----------
  // Every dmg/heal value below is already fully computed by
  // damageWithEffects/defendWithEffects/castUltimate - archetype stats, DEF,
  // crit and ultimates all already happened by the time these run. Modes only
  // decide what that number is SPENT ON (HP, a shared bar, a grid tile).
  //
  // The rule that keeps a mode from being Battle-with-decoration: outside an
  // `"hp"` mode, HP is NOT a second win condition ticking away underneath the
  // visible one. `spendDamage`/`spendHeal` are the only way an outcome reaches
  // a resource, and in bar/grid modes they return 0 HP - the health bars never
  // move and are not rendered. Everything the stat sheet does still lands,
  // because it landed before these ran: DEF and shields already shrank the
  // number, a crit already grew it.

  /** True when this mode's match is decided by health, i.e. Battle and Draft. */
  function modeUsesHp() {
    return GAME_MODES[gameModeRef.current].resource === "hp";
  }

  /**
   * How well a side is doing, as a 0-1 fraction of whatever this mode is
   * fought over. The bot brain reasons entirely in health fractions; outside an
   * HP mode health never moves, so without this translation the AI would
   * believe it was at full strength all match and never defend, heal or reach
   * for its ultimate at the moment it was losing.
   */
  function modeStanding(side: "player" | "opponent", fighter: Fighter): number {
    const resource = GAME_MODES[gameModeRef.current].resource;
    if (resource === "hp") return fighter.maxHp > 0 ? fighter.hp / fighter.maxHp : 0;
    if (resource === "bar") {
      // position > 0 means the player has pulled the rope their way.
      const pos = tugStateRef.current.position;
      const towardMe = side === "player" ? pos : -pos;
      return Math.max(0, Math.min(1, 0.5 + towardMe / (2 * TUG_BAR_MAX)));
    }
    const { player, opponent } = scoreGrid(territoryGridRef.current, territoryWeightsRef.current);
    const claimed = player + opponent;
    if (claimed === 0) return 0.5;
    return (side === "player" ? player : opponent) / claimed;
  }

  const flagNote = (amount: number) => {
    const w = flagWeight(amount);
    return w > 1 ? `a flag worth ${w}` : "a flag";
  };

  /** How an outgoing hit reads in the battle log for the current mode. */
  function modeDamageLabel(amount: number): string {
    const resource = GAME_MODES[gameModeRef.current].resource;
    if (resource === "hp") return `${amount} DMG`;
    if (resource === "bar") return `pushed the rope ${amount}`;
    return `earned ${flagNote(amount)}`;
  }

  /** How a restore reads in the battle log for the current mode. */
  function modeRestoreLabel(amount: number): string {
    const resource = GAME_MODES[gameModeRef.current].resource;
    if (resource === "hp") return `+${amount} HP`;
    if (resource === "bar") return `pulled the rope back ${amount}`;
    return `earned ${flagNote(amount)}`;
  }

  /**
   * Route an outgoing damage number to whatever this mode is fought over, and
   * return the HP that should actually be subtracted (0 outside `hp` modes).
   */
  function spendDamage(dealer: "player" | "opponent", dmg: number): number {
    const resource = GAME_MODES[gameModeRef.current].resource;
    if (resource === "hp") return dmg;
    if (dmg <= 0) return 0;

    if (resource === "bar") {
      const next = pushTug(tugStateRef.current, dealer, dmg);
      tugStateRef.current = next;
      setTugState(next);
    } else {
      grantFlag(dealer, dmg);
    }
    return 0;
  }

  /**
   * The heal counterpart. A Healer or a God's passive restore is worth just as
   * much outside Battle mode - it pulls the tug bar back off your own line, or
   * buys board space - instead of topping up a bar nobody is looking at.
   */
  function spendHeal(healer: "player" | "opponent", heal: number): number {
    const resource = GAME_MODES[gameModeRef.current].resource;
    if (resource === "hp") return heal;
    if (heal <= 0) return 0;

    if (resource === "bar") {
      // Recovery only ever walks the bar back toward center - a heal cannot
      // push through into enemy ground the way a hit can.
      const next = recoverTug(tugStateRef.current, healer, heal);
      tugStateRef.current = next;
      setTugState(next);
    } else {
      grantFlag(healer, heal);
    }
    return 0;
  }

  /**
   * Territory: a correct answer earns exactly one flag, whose weight carries
   * the stat sheet onto the board. The player's is banked and the turn loop
   * parks in the "placing" phase until they tap a tile - placement is the
   * decision this mode is built around, so it is never auto-resolved for them.
   * A bot resolves immediately against the shared heuristic.
   */
  function grantFlag(side: "player" | "opponent", amount: number) {
    if (!territoryGridRef.current.includes("empty")) return; // board is full
    const weight = flagWeight(amount);

    if (side === "player") {
      pendingPlacementRef.current = {
        weight,
        // Resume into whoever was NOT acting: a flag from the player's own turn
        // means the bot goes next; a flag a reflect earned during the bot's
        // turn means the player's question turn is what comes next.
        resume: actingSideRef.current === "player" ? "opponent" : "player",
      };
      setPlacementWeight(weight);
      setPhase("placing");
      return;
    }

    const target = chooseBotPlacement(territoryGridRef.current, "opponent");
    if (target === null) return;
    const res = placeFlag(
      territoryGridRef.current,
      target,
      "opponent",
      territoryWeightsRef.current,
      weight,
    );
    territoryGridRef.current = res.grid;
    territoryWeightsRef.current = res.weights;
    setTerritoryGrid(res.grid);
    setTerritoryFlipped(res.flipped);
  }

  /** Swap the next drafted Ecliptar in after a KO, resetting its own HP/focus
   *  fresh - a new duel, not a continuation of the fallen member's fight. */
  function swapInDraftMember(side: "player" | "opponent", team: DraftTeam) {
    const member = activeMember(team);
    if (!member) return;
    const arch = ARCHETYPES[member.archetype];
    if (side === "player") {
      playerDraftTeamRef.current = team;
      setArchetype(member.archetype);
      archetypeRef.current = member.archetype;
      setEcliptarSlug(member.slug);
      ecliptarRef.current = member.slug;
      setPlayer({
        name: member.name,
        hp: arch.maxHp,
        maxHp: arch.maxHp,
        shield: 0,
        focus: arch.startFocus,
        maxFocus: arch.focusPool,
        icon: member.icon,
        sprite: ecliptarSpriteUrl(member.slug),
      });
      playerEffectsRef.current = [];
      setPlayerEffects([]);
      addLog({
        actor: "system",
        actionType: "info",
        result: `${member.name} steps in for you!`,
      });
    } else {
      opponentDraftTeamRef.current = team;
      setOpponentArchetype(member.archetype);
      opponentEcliptarRef.current = member.slug;
      setOpponent({
        name: member.name,
        hp: arch.maxHp,
        maxHp: arch.maxHp,
        focus: arch.startFocus,
        maxFocus: arch.focusPool,
        icon: member.icon,
        sprite: ecliptarSpriteUrl(member.slug),
      });
      opponentEffectsRef.current = [];
      setOpponentEffects([]);
      addLog({
        actor: "system",
        actionType: "info",
        result: `Opponent sends in ${member.name}!`,
      });
    }
  }

  /**
   * Mode-aware replacement for Battle mode's plain HP<=0 check.
   * - "ended": finishBattle already ran; caller does nothing more.
   * - "handled": this mode owns the win-check (even with no winner yet this
   *   turn) - caller skips the default HP check and goes straight to its
   *   normal turn-continuation logic (extra turn / ai).
   * - "passthrough": not a mode with its own win condition - caller runs the
   *   original HP<=0 check exactly as Battle mode always has.
   */
  function resolveModeOutcome(
    currentPlayerHp: number,
    currentOppHp: number,
  ): "ended" | "handled" | "passthrough" {
    const mode = gameModeRef.current;
    if (mode === "tugofwar") {
      const winner = tugWinner(tugStateRef.current);
      if (winner) {
        finishBattle(winner === "player");
        return "ended";
      }
      return "handled";
    }
    if (mode === "territory") {
      // Board full, or the turn cap stood in for the spec's "clock runs out".
      const winner = territoryWinner(
        territoryGridRef.current,
        modeTurnsRef.current,
        territoryWeightsRef.current,
      );
      if (winner === null) return "handled";
      if (winner === "draw") {
        // Equal territory falls back to who answered more correctly; only a
        // double tie reaches the coin flip, which is disclosed in the log.
        const mine = recordsRef.current.filter((r) => r.correct).length;
        const theirs = opponentCorrectRef.current;
        if (mine !== theirs) {
          addLog({
            actor: "system",
            actionType: "info",
            result: `Territory tied - decided on correct answers, ${mine} to ${theirs}.`,
          });
          finishBattle(mine > theirs);
        } else {
          addLog({
            actor: "system",
            actionType: "info",
            result: `Territory and correct answers both tied - the round is decided by coin flip.`,
          });
          finishBattle(Math.random() < 0.5);
        }
      } else {
        finishBattle(winner === "player");
      }
      return "ended";
    }
    if (mode === "draft") {
      if (currentOppHp <= 0) {
        const team = opponentDraftTeamRef.current;
        const advanced = team ? advanceTeam(team) : null;
        if (advanced && !teamDefeated(advanced)) {
          swapInDraftMember("opponent", advanced);
          return "handled";
        }
        finishBattle(true);
        return "ended";
      }
      if (currentPlayerHp <= 0) {
        const team = playerDraftTeamRef.current;
        const advanced = team ? advanceTeam(team) : null;
        if (advanced && !teamDefeated(advanced)) {
          swapInDraftMember("player", advanced);
          return "handled";
        }
        finishBattle(false);
        return "ended";
      }
      return "passthrough";
    }
    return "passthrough";
  }

  /**
   * A wrong answer's self-inflicted damage. Separate from `spendDamage`
   * because the two modes read a miss differently: Tug-of-War hands the ground
   * you lost to the other side, while Territory "costs you the round's
   * placement entirely" - no flag for anyone. Returns the HP to subtract.
   */
  function spendMiss(missedSide: "player" | "opponent", selfDmg: number): number {
    const resource = GAME_MODES[gameModeRef.current].resource;
    if (resource === "hp") return selfDmg;
    if (resource === "bar" && selfDmg > 0) {
      const other = missedSide === "player" ? "opponent" : "player";
      const next = pushTug(tugStateRef.current, other, selfDmg);
      tugStateRef.current = next;
      setTugState(next);
    }
    return 0;
  }

  /** Territory: the player tapped an open tile, planting the flag they earned. */
  const resolvePendingPlacement = useCallback(
    (index: number) => {
      const pending = pendingPlacementRef.current;
      if (!pending) return;
      const res = placeFlag(
        territoryGridRef.current,
        index,
        "player",
        territoryWeightsRef.current,
        pending.weight,
      );
      territoryGridRef.current = res.grid;
      territoryWeightsRef.current = res.weights;
      setTerritoryGrid(res.grid);
      setTerritoryFlipped(res.flipped);
      pendingPlacementRef.current = null;
      setPlacementWeight(0);

      setTimeout(() => {
        const outcome = resolveModeOutcome(playerRef.current.hp, opponentRef.current.hp);
        if (outcome === "ended") return;
        if (pending.resume === "player") {
          // This flag interrupted the opponent's turn; the question is ours now.
          setPhase("select");
        } else if (extraTurnRef.current) {
          extraTurnRef.current = false;
          addLog({ actor: "system", actionType: "info", result: `Another turn - go again!` });
          setPhase("select");
        } else {
          aiTurn();
        }
      }, 400);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addLog],
  );

  const handleAnswer = useCallback(
    (correct: boolean, timeSpent: number) => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (!currentAction || !question) return;

      if (battleMemoryRef.current) {
        updateBattleMemoryPlayerTurn(battleMemoryRef.current, currentAction, correct);
      }

      modeTurnsRef.current += 1;
      actingSideRef.current = "player";
      const record: QuestionRecord = { question, correct, timeSpent, action: currentAction };
      const nextRecords = [...recordsRef.current, record];
      recordsRef.current = nextRecords;
      setRecords(nextRecords);
      // Feed Luna's adaptive context (timeSpent is in seconds, recordAnswer expects ms).
      void import("@/lib/luna-context").then(({ recordAnswer, updateLunaContext }) => {
        recordAnswer(correct, timeSpent * 1000);
        updateLunaContext({ lessonTitle: question.topic, difficulty: question.difficulty });
      });

      if (correct && timeSpent < fastestAnswerRef.current) {
        fastestAnswerRef.current = timeSpent;
        setFastestAnswer(timeSpent);
      }

      const arch = getArch(archetype);
      const oppArchNow = getArch(opponentArchetype);
      const copied = copiedPassiveRef.current;
      // Answers banked BEFORE this one - what the Accelerator ramp had to work
      // with when the question was posed.
      const priorCorrect = correctCountRef.current;
      if (correct) {
        correctCountRef.current = priorCorrect + 1;
        setCorrectCount(priorCorrect + 1);
      }

      // Ultimate charge is earned only by answering correctly, and never while
      // the ultimate being cast is the action itself.
      if (correct && currentAction !== "ultimate") {
        const nextCharge = Math.min(
          1,
          ultimateChargeRef.current + ULTIMATE_TUNING.chargePerCorrectAnswer,
        );
        ultimateChargeRef.current = nextCharge;
        setUltimateCharge(nextCharge);
      }
      if (ultimateCooldownRef.current > 0) setPlayerCooldown(ultimateCooldownRef.current - 1);
      // Keep a short HP trail so Infinite Cycle has a past to rewind to.
      hpHistoryRef.current = [playerRef.current.hp, ...hpHistoryRef.current].slice(0, 6);
      const scoreMult = getScoreMultiplier(arch, momentum, priorCorrect, copied);

      if (opponentTypeRef.current === "live") {
        const nextMom = correct ? momentum + 1 : 0;
        if (correct && nextMom > longestStreakRef.current) {
          longestStreakRef.current = nextMom;
          setLongestStreak(nextMom);
        }

        let damage = 0;
        let selfDamage = 0;
        let heal = 0;
        const focusDelta = correct ? FOCUS_GAIN[currentAction] : 0;

        if (correct) {
          sfxStreak(nextMom);
          if (nextMom > 0 && nextMom % comboThreshold === 0) {
            addLog({
              actor: "system",
              actionType: "combo",
              result: `COMBO x${Math.floor(nextMom / comboThreshold)} - ${scoreMult.toFixed(2)}x score!`,
            });
            fireComboBurst(Math.floor(nextMom / comboThreshold), scoreMult);
            sfxCombo();
          }

          if (currentAction === "defend") {
            heal =
              arch.healAmount === null
                ? 0
                : Math.min(arch.healAmount, playerRef.current.maxHp - playerRef.current.hp);
          } else if (currentAction === "ultimate") {
            // The ultimate resolves locally and writes HP/effects itself; the
            // damage and heal it reports go on the wire so the opponent's client
            // mirrors the same numbers.
            const ult = getUltimate(ecliptarRef.current);
            if (ult) {
              const before = opponentRef.current.hp;
              const beforeSelf = playerRef.current.hp;
              const { extraTurn } = castUltimate(ult, "player");
              damage = Math.max(0, before - opponentRef.current.hp);
              heal = Math.max(0, playerRef.current.hp - beforeSelf);
              if (extraTurn) extraTurnRef.current = true;
            }
          } else {
            const hit = damageWithEffects(
              arch,
              playerEffectsRef.current,
              playerBonusDamageRef.current,
              {
                action: currentAction,
                timeSpent,
                maxTime,
                correctCount: priorCorrect,
                currentHp: playerRef.current.hp,
                copied,
              },
            );
            damage = defendWithEffects(hit.damage, oppArchNow, opponentEffectsRef.current);
            for (const kind of hit.consumed) {
              playerEffectsRef.current = consumeUse(playerEffectsRef.current, kind);
            }
            setPlayerEffects(playerEffectsRef.current);
          }
          // God's every-third-answer restore rides on top of whatever was
          // chosen, clamped so the reported heal never overshoots the HP bar.
          heal = Math.min(
            heal + getStreakHeal(arch, correctCountRef.current, copied),
            playerRef.current.maxHp - playerRef.current.hp,
          );
        } else {
          sfxBreak();
          selfDamage = applyDefense(rollMissPenalty(), arch, copied);
        }

        liveActionLockedRef.current = true;
        livePendingActionRef.current = {
          actor_id: myUserIdRef.current ?? "",
          action: currentAction,
          correct,
          damage,
          self_damage: selfDamage,
          heal,
          focus_delta: focusDelta,
          momentum: nextMom,
          time_spent: timeSpent,
          question,
        };
        setLiveActionLocked(true);
        setPhase("select");
        addLog({
          actor: "system",
          actionType: "info",
          result: `Action locked for turn ${liveTurnNumberRef.current}. ${liveOpponentLockedRef.current ? "Resolving..." : `Waiting for ${opponentRef.current.name}.`}`,
        });

        void (async () => {
          const battleId = pvpBattleIdRef.current;
          if (!battleId) return;
          const challengeId = liveChallengeIdRef.current;
          const answer = liveChallengeAnswerRef.current;
          if (!challengeId || answer === null) {
            liveActionLockedRef.current = false;
            setLiveActionLocked(false);
            toast.error("Missing secure battle challenge.");
            return;
          }
          const { data, error } = await supabase.rpc("submit_authoritative_pvp_turn_action", {
            p_battle_id: battleId,
            p_turn_number: liveTurnNumberRef.current,
            p_action: currentAction,
            p_challenge_id: challengeId,
            p_answer: answer,
            p_time_spent: timeSpent,
          });
          if (error) {
            liveActionLockedRef.current = false;
            setLiveActionLocked(false);
            toast.error("Couldn't lock PvP action - try again.");
            return;
          }
          if (data?.ready) {
            liveResolutionRef.current(data.actions ?? [], liveTurnNumberRef.current);
          } else {
            // Polling fallback: realtime INSERT events on pvp_turn_actions are
            // the primary path that wakes the resolver, but if the websocket
            // hiccups (mobile background tab, transient disconnect, replication
            // lag) the turn would stall forever with both clients showing
            // "Waiting for opponent". Poll get_pvp_turn_resolution every 1.5s
            // until both actions are recorded or the turn moves on.
            const turnAtSubmit = liveTurnNumberRef.current;
            const battleIdAtSubmit = pvpBattleIdRef.current;
            const poll = setInterval(async () => {
              if (
                !battleIdAtSubmit ||
                liveTurnNumberRef.current !== turnAtSubmit ||
                liveResolvedTurnsRef.current.has(turnAtSubmit) ||
                liveResolvingRef.current ||
                battleFinishedRef.current
              ) {
                clearInterval(poll);
                return;
              }
              const { data: res } = await supabase.rpc("get_pvp_turn_resolution" as any, {
                p_battle_id: battleIdAtSubmit,
                p_turn_number: turnAtSubmit,
              });
              if (res?.ready) {
                clearInterval(poll);
                liveResolutionRef.current(res.actions ?? [], turnAtSubmit);
              }
            }, 1500);
          }
        })();
        return;
      }

      setPhase("animate");

      if (correct) {
        const newMom = momentum + 1;
        setMomentum(newMom);
        if (newMom > longestStreak) setLongestStreak(newMom);
        sfxStreak(newMom);

        // Announce combo activations - momentum pays out in score, not damage.
        if (newMom > 0 && newMom % comboThreshold === 0) {
          addLog({
            actor: "system",
            actionType: "combo",
            result: `COMBO x${Math.floor(newMom / comboThreshold)} - ${scoreMult.toFixed(2)}x score!`,
          });
          fireComboBurst(Math.floor(newMom / comboThreshold), scoreMult);
          sfxCombo();
        }

        if (currentAction === "defend") {
          const gain = FOCUS_GAIN.defend;
          if (arch.healAmount !== null) {
            // In an HP mode the restore is capped by the missing health; in a
            // bar/grid mode there is no HP to be missing, so the class's full
            // heal is what gets spent on the resource.
            const heal = modeUsesHp()
              ? Math.min(arch.healAmount, player.maxHp - player.hp)
              : arch.healAmount;
            const hpHeal = spendHeal("player", heal);
            // Healer (or Fulcrum borrowing it) banks an absorb shield on top.
            const shieldBefore = playerRef.current.shield ?? 0;
            const shieldAfter = getHealShield(arch, shieldBefore, copied);
            setPlayer((prev) => ({
              ...prev,
              hp: Math.min(prev.maxHp, prev.hp + hpHeal),
              shield: getHealShield(arch, prev.shield ?? 0, copied),
              focus: Math.min(prev.maxFocus, prev.focus + gain),
            }));
            setShowPlayerHeal(true);
            const shieldNote =
              shieldAfter > shieldBefore ? ` +${shieldAfter - shieldBefore} shield.` : "";
            addLog({
              actor: "player",
              actionType: "heal",
              result: `Defend: ${modeRestoreLabel(heal)}, +${gain} Focus.${shieldNote}`,
              value: heal,
            });
          } else {
            setPlayer((prev) => ({ ...prev, focus: Math.min(prev.maxFocus, prev.focus + gain) }));
            addLog({
              actor: "player",
              actionType: "heal",
              result: `Defend: +${gain} Focus (this class cannot heal).`,
              value: gain,
            });
          }
        } else if (currentAction === "ultimate") {
          // The whole effect is data-driven; castUltimate commits HP, shields,
          // effects, timers and charge, and tells us if it granted a free turn.
          const ult = getUltimate(ecliptarRef.current);
          if (ult) {
            const { extraTurn } = castUltimate(ult, "player");
            if (extraTurn) extraTurnRef.current = true;
          } else {
            addLog({
              actor: "system",
              actionType: "info",
              result: `No Ecliptar equipped - the ultimate fizzles.`,
            });
          }
        } else {
          const hit = damageWithEffects(
            arch,
            playerEffectsRef.current,
            playerBonusDamageRef.current,
            {
              action: currentAction,
              timeSpent,
              maxTime,
              correctCount: priorCorrect,
              currentHp: playerRef.current.hp,
              copied,
            },
          );
          for (const kind of hit.consumed) {
            playerEffectsRef.current = consumeUse(playerEffectsRef.current, kind);
          }
          setPlayerEffects(playerEffectsRef.current);
          // Velocity Break: the pinned clock pays out for every unused second.
          let bonus = 0;
          if (nextTimerOverrideRef.current) {
            const unused = Math.max(0, maxTime - Math.ceil(timeSpent));
            bonus = unused * nextTimerOverrideRef.current.damagePerUnusedSecond;
            nextTimerOverrideRef.current = null;
            if (bonus > 0) {
              addLog({
                actor: "player",
                actionType: "info",
                result: `Velocity Break: ${unused}s unused -> +${bonus} damage.`,
              });
            }
          }
          const dmg = defendWithEffects(hit.damage + bonus, oppArchNow, opponentEffectsRef.current);
          const hpDmg = spendDamage("player", dmg);
          setOpponent((prev) => ({ ...prev, hp: Math.max(0, prev.hp - hpDmg) }));
          const focusGain = FOCUS_GAIN[currentAction];
          if (focusGain > 0) {
            setPlayer((prev) => ({
              ...prev,
              focus: Math.min(prev.maxFocus, prev.focus + focusGain),
            }));
          }
          setShowOpponentHit(true);
          const focusNote = focusGain > 0 ? ` +${focusGain} Focus.` : "";
          const critNote = hit.crit ? " CRIT!" : "";
          const rageNote =
            arch.ragesWhenLow && playerRef.current.hp < DAMAGE_TUNING.apex.rageHpThreshold
              ? " RAGE!"
              : "";
          addLog({
            actor: "player",
            actionType: currentAction,
            result: `${ACTIONS[currentAction].label}: ${modeDamageLabel(dmg)}!${critNote}${rageNote}${focusNote}`,
            value: dmg,
          });
        }

        // God (or Fulcrum borrowing it): a free restore every third correct answer.
        const divineHeal = getStreakHeal(arch, correctCountRef.current, copied);
        if (divineHeal > 0) {
          const hpDivine = spendHeal("player", divineHeal);
          setPlayer((prev) => ({ ...prev, hp: Math.min(prev.maxHp, prev.hp + hpDivine) }));
          setShowPlayerHeal(true);
          addLog({
            actor: "system",
            actionType: "heal",
            result: `${arch.name}'s passive: ${modeRestoreLabel(divineHeal)}.`,
            value: divineHeal,
          });
        }

        setTotalScore(
          (prev) =>
            prev +
            (currentAction === "charge" ? 150 : currentAction === "attack" ? 100 : 75) * scoreMult,
        );
      } else {
        setMomentum(0);
        sfxBreak();
        // The miss penalty runs through DEF like any other incoming damage -
        // the maxHp-derived self-damage curve went with the multiplier stat.
        const counterDmg = applyDefense(rollMissPenalty(), arch, copied);
        const { hpLoss, shieldLeft } = absorbWithShield(counterDmg, playerRef.current.shield ?? 0);
        const hpMiss = spendMiss("player", hpLoss);
        setPlayer((prev) => ({ ...prev, hp: Math.max(0, prev.hp - hpMiss), shield: shieldLeft }));
        setShowPlayerHit(true);
        const absorbedNote = hpLoss < counterDmg ? ` Shield absorbed ${counterDmg - hpLoss}.` : "";
        const costNote = modeUsesHp()
          ? `-${hpLoss} HP`
          : GAME_MODES[gameModeRef.current].resource === "bar"
            ? `gave up ${hpLoss} ground`
            : `no flag this round`;
        addLog({
          actor: "player",
          actionType: "miss",
          result: `${timeSpent >= maxTime ? "Time's up!" : "Wrong!"} ${costNote}. Streak reset.${absorbedNote}`,
          value: hpLoss,
        });
      }

      setTimeout(() => {
        setShowPlayerHit(false);
        setShowOpponentHit(false);
        setShowPlayerHeal(false);

        if (pendingPlacementRef.current) {
          // Territory: waiting on the player to tap a tile - resolvePendingPlacement continues the loop.
          return;
        }

        const curOpp = opponentRef.current;
        const curPlayer = playerRef.current;
        const modeOutcome = resolveModeOutcome(curPlayer.hp, curOpp.hp);

        if (modeOutcome === "ended") {
          // finishBattle already ran.
        } else if (modeOutcome === "passthrough" && curOpp.hp <= 0) {
          finishBattle(true);
        } else if (modeOutcome === "passthrough" && curPlayer.hp <= 0) {
          finishBattle(false);
        } else if (extraTurnRef.current) {
          // Time Fracture / Wheel of Fortune: act again without ceding the turn.
          extraTurnRef.current = false;
          addLog({ actor: "system", actionType: "info", result: `Another turn - go again!` });
          setPhase("select");
        } else {
          aiTurn();
        }
      }, 800);
    },
    [
      currentAction,
      momentum,
      player,
      totalScore,
      timeLeft,
      maxTime,
      question,
      archetype,
      longestStreak,
      fastestAnswer,
    ],
  );

  const handleQuestionAnswer = useCallback(
    async (answer: number, timeSpent: number): Promise<{ correct: boolean; answer?: number }> => {
      const localCorrect = answer === question?.answer;
      if (!questionChallengeId) {
        const result =
          question?.answer === undefined
            ? { correct: localCorrect }
            : { correct: localCorrect, answer: question.answer };
        setTimeout(() => handleAnswer(result.correct, timeSpent), result.correct ? 600 : 1900);
        return result;
      }

      if (opponentTypeRef.current === "live") {
        liveChallengeAnswerRef.current = answer;
        setTimeout(() => handleAnswer(false, timeSpent), 600);
        return { correct: false };
      }

      const { data, error } = await supabase.rpc("submit_battle_answer", {
        p_challenge_id: questionChallengeId,
        p_answer: answer,
      });
      if (error || !data) {
        toast.error("Couldn't verify that answer. Please try again.");
        return { correct: false };
      }
      answeredChallengeIdsRef.current.push(questionChallengeId);
      const correct = data.correct;
      setTimeout(() => handleAnswer(correct, timeSpent), correct ? 600 : 1900);
      return { correct, answer: data.answer };
    },
    [handleAnswer, question?.answer, questionChallengeId],
  );

  const finishBattle = useCallback(
    (won: boolean) => {
      if (battleFinishedRef.current) return;
      battleFinishedRef.current = true;
      // Assertive: the match is over, which the user needs to hear now rather
      // than after whatever the reader is currently working through.
      announce(won ? t("battle.victoryAnnouncement") : t("battle.defeatAnnouncement"), "assertive");
      const winnerId = won ? myUserIdRef.current : opponentUserIdRef.current;
      if (opponentTypeRef.current === "live" && pvpChannelRef.current && winnerId) {
        pvpChannelRef.current.send({
          type: "broadcast",
          event: "battle_end",
          payload: { winner_id: winnerId },
        });
      }

      // The report mirrors the verified-question award path. Battle outcomes
      // are presentation state; only server-checked answers earn XP.
      const finalRecords = recordsRef.current;
      const finalStreak = longestStreakRef.current;
      const finalFastest = fastestAnswerRef.current;
      const finalScore = totalScoreRef.current;
      const totalQuestions = finalRecords.length;
      const correctAnswers = finalRecords.filter((r) => r.correct).length;
      const xp = correctAnswers * 15;
      setBattleStats({
        totalQuestions,
        correctAnswers,
        longestStreak: finalStreak,
        fastestAnswer: finalFastest,
        records: [...finalRecords],
        archetype,
        won,
        score: Math.floor(finalScore),
        xp,
        opponentType: opponentTypeRef.current,
      });
      // Cinematic KO beat: hold on a VICTORY / DEFEAT banner before the report.
      // Guard the delayed phase change so a battle that restarts in the gap
      // (live rematch auto-start) can't get yanked back to the result screen.
      setKoBanner(won ? "victory" : "defeat");
      if (won) sfxVictory();
      else sfxDefeat();
      setTimeout(() => {
        setKoBanner(null);
        if (battleFinishedRef.current) setPhase("result");
      }, 1700);

      // Persist battle to learning_history + increment daily challenge on win
      (async () => {
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) return;

          // Feed every answered question into the shared concept-mastery store so
          // Practice Weak Spots (and the Courses readiness engine) can use it.
          // Best-effort - a missing table never affects the battle result.
          void recordOutcomes(
            user.id,
            finalRecords.map((r) => ({
              concept: r.question.topic,
              subject: "Mathematics",
              difficulty: r.question.difficulty,
              correct: r.correct,
              timeSpent: r.timeSpent,
            })),
          );

          // Award XP here - at the guaranteed battle-end hook - rather than relying
          // on the result screen mounting (which a live rematch or an early exit can
          // skip). Server computes the amount from correct/total/won.
          await awardVerifiedBattleXp(answeredChallengeIdsRef.current);

          // Count today toward the daily-practice streak (server-authoritative,
          // idempotent per day). Fires the milestone celebration when crossed.
          await recordDailyPractice();

          await supabase.rpc("log_learning_history", {
            p_session_type: "battle",
            p_topic: ARCHETYPES[archetype].name,
            p_question_text: null,
            p_was_correct: won,
            p_response_time_ms: null,
            p_hint_level_used: 0,
            p_luna_summary: `${won ? "Victory" : "Defeat"} as ${ARCHETYPES[archetype].name} | score ${Math.floor(finalScore)} | streak ${finalStreak}`,
          });
          if (won) {
            // Server-side atomic increment; clients can no longer set wins directly.
            await supabase.rpc("increment_daily_challenge_win");
            window.dispatchEvent(new Event("daily-challenge-updated"));
          }

          // Browser-reported battle sessions are not durable evidence, so no
          // session id is minted client-side and the bot branch below stays
          // inert until it has a server-side resolver.
          const sessionId = null;

          // Update competitive rating. Live PvP completes on the server once per battle.
          if (opponentTypeRef.current === "live" && pvpBattleIdRef.current && winnerId) {
            const { data, error } = await supabase.rpc("complete_authoritative_pvp_battle", {
              p_battle_id: pvpBattleIdRef.current,
            });
            if (error) {
              console.error("complete_pvp_battle failed", error);
              toast.error("Couldn't record this battle's rating change.");
            } else {
              const nextRating = iAmChallengerRef.current
                ? data?.challenger_rating_after
                : data?.opponent_rating_after;
              if (typeof nextRating === "number") {
                setRatingChange(nextRating - playerRatingRef.current);
                setPlayerRating(nextRating);
                playerRatingRef.current = nextRating;
                window.dispatchEvent(new Event("pvp-leaderboard-updated"));
              }
            }
          } else if (opponentTypeRef.current === "bot" && sessionId) {
            // Bot battles count too, at a reduced rating change (server-enforced),
            // and update the W/L record via the same applied-session truth model.
            const { data, error } = await supabase.rpc("complete_bot_battle", {
              p_session_id: sessionId,
            });
            if (error) {
              console.error("complete_bot_battle failed", error);
              toast.error("Couldn't record this battle's rating change.");
            } else if (typeof data?.rating_after === "number") {
              setRatingChange(data.rating_delta ?? 0);
              setPlayerRating(data.rating_after);
              playerRatingRef.current = data.rating_after;
              window.dispatchEvent(new Event("pvp-leaderboard-updated"));
            }
          }
        } catch (error) {
          console.error("Post-battle persistence (XP/streak/rating) failed", error);
          toast.error("Some of this battle's results may not have saved.");
        }
      })();
    },
    [archetype],
  );

  const handleLiveRematch = useCallback(async () => {
    const battleId = pvpBattleIdRef.current;
    if (!battleId) return;
    if (liveRematchStateRef.current !== "idle") return;
    setLiveRematchState("waiting");
    // Don't strand the player on "WAITING FOR OPPONENT...": if the opponent never
    // accepts, reset to idle so QUICK REMATCH is clickable again.
    if (rematchTimeoutRef.current) clearTimeout(rematchTimeoutRef.current);
    rematchTimeoutRef.current = setTimeout(() => {
      if (liveRematchStateRef.current === "waiting") {
        setLiveRematchState("idle");
        toast("Rematch timed out - your opponent didn't accept.");
      }
    }, 30000);
    try {
      const { data, error } = await supabase.rpc("request_pvp_rematch", {
        p_battle_id: battleId,
        p_archetype: archetype,
      });
      if (error) throw error;
      const d = data as { ready?: boolean; battle_id?: string | null } | null;
      // Both players already requested -> the realtime UPDATE will arrive and
      // trigger startLiveBattleFromId, but kick it off directly too in case
      // the broadcast was dropped between RPC return and channel delivery.
      if (d?.ready && d.battle_id && !rematchStartedRef.current) {
        rematchStartedRef.current = true;
        setLiveRematchState("starting");
        await startLiveBattleFromId(d.battle_id);
      }
    } catch (err) {
      console.error("rematch failed", err);
      toast.error("Couldn't queue rematch - try again.");
      setLiveRematchState("idle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archetype]);

  const aiTurn = useCallback(() => {
    const oppArch = getArch(opponentArchetype);
    const personality = AI_PERSONALITIES[opponentArchetype];
    const memory = battleMemoryRef.current;

    setTimeout(
      () => {
        // Poison/regen/freeze resolve before the bot chooses - a frozen turn is
        // skipped outright, and a poison that kills ends the match here.
        const oppTick = runEffectTick("opponent");
        if (oppTick.died) {
          finishBattle(true);
          return;
        }
        if (oppTick.frozen) {
          setTimeout(() => setPhase("select"), 600);
          return;
        }

        actingSideRef.current = "opponent";
        const prevOpp = opponentRef.current;
        const prevPlayer = playerRef.current;
        // In a bar/grid mode these describe the bot's standing on the rope or the
        // board rather than a health bar that never moves, so the AI brain keeps
        // reading a meaningful "how am I doing" without being changed at all.
        const oppHpPct = modeStanding("opponent", prevOpp);
        const playerHpPct = modeStanding("player", prevPlayer);
        const mem = memory ?? createBattleMemory();

        const oppUltimate = getUltimate(opponentEcliptarRef.current);
        const oppUltimateReady =
          Boolean(oppUltimate) &&
          opponentChargeRef.current >= 1 &&
          opponentCooldownRef.current <= 0;

        const choice = pickAiAction(
          mem,
          personality,
          {
            hp: Math.round(oppHpPct * prevOpp.maxHp),
            maxHp: prevOpp.maxHp,
            focus: prevOpp.focus,
            maxFocus: prevOpp.maxFocus,
            canHeal: oppArch.healAmount !== null,
            ultimateReady: oppUltimateReady,
          },
          {
            hp: Math.round(playerHpPct * prevPlayer.maxHp),
            maxHp: prevPlayer.maxHp,
            momentum: opponentMomentum,
          },
        );

        const success =
          Math.random() <
          computeAiAccuracy(
            oppArch,
            personality,
            mem,
            oppHpPct,
            playerHpPct,
            ratingSkillAdjustment(playerRatingRef.current, opponentRatingRef.current),
          );

        // Narrative pressure line - appears at meaningful moments only
        const hasData = mem.playerTurnCount >= 4;
        const strongPattern = mem.patternConfidence >= personality.counterPlaySensitivity;
        const pressureLine = getPressureLogLine(
          mem,
          personality,
          prevOpp.name,
          oppHpPct,
          hasData && strongPattern,
        );
        if (pressureLine) addLog({ actor: "system", actionType: "info", result: pressureLine });

        let newPlayerHp = prevPlayer.hp;
        let newPlayerShield = prevPlayer.shield ?? 0;
        let newOppHp = prevOpp.hp;
        let newOppFocus = prevOpp.focus;
        let nextOppMom = opponentMomentum;

        const playerArch = getArch(archetypeRef.current);
        /** True while the resolver already committed both sides (bot ultimate). */
        let ultimateHandled = false;
        /**
         * Route incoming damage through the player's DEF and any damageReduction
         * effect, then their shield, then pay back a reflect share.
         */
        const hitPlayer = (raw: number): number => {
          const after = defendWithEffects(
            raw,
            playerArch,
            playerEffectsRef.current,
            copiedPassiveRef.current,
          );
          const { hpLoss, shieldLeft } = absorbWithShield(after, newPlayerShield);
          newPlayerShield = shieldLeft;
          // DEF and the shield have already shrunk this number; spendDamage only
          // decides where what is left goes, and returns 0 outside an HP mode.
          newPlayerHp = Math.max(0, newPlayerHp - spendDamage("opponent", hpLoss));
          const reflect = totalOf(playerEffectsRef.current, "reflect");
          if (reflect > 0 && after > 0) {
            const back = Math.max(1, Math.floor(after * reflect));
            newOppHp = Math.max(0, newOppHp - spendDamage("player", back));
            addLog({
              actor: "player",
              actionType: "attack",
              result: `Reflected ${modeDamageLabel(back)} back.`,
              value: back,
            });
          }
          return hpLoss;
        };

        if (success) {
          nextOppMom = opponentMomentum + 1;
          // The bot's correct-answer count drives its Accelerator ramp / God heal.
          const oppCorrect = mem.turnNumber;

          if (choice === "defend") {
            newOppFocus = Math.min(prevOpp.maxFocus, prevOpp.focus + FOCUS_GAIN.defend);
            if (oppArch.healAmount !== null) {
              newOppHp = Math.min(
                prevOpp.maxHp,
                prevOpp.hp + spendHeal("opponent", oppArch.healAmount),
              );
              addLog({
                actor: "opponent",
                actionType: "heal",
                result: `${prevOpp.name} heals: ${modeRestoreLabel(oppArch.healAmount)}, +${FOCUS_GAIN.defend} Focus.`,
                value: oppArch.healAmount,
              });
            } else {
              addLog({
                actor: "opponent",
                actionType: "heal",
                result: `${prevOpp.name} defends: +${FOCUS_GAIN.defend} Focus.`,
                value: FOCUS_GAIN.defend,
              });
            }
          } else if (choice === "ultimate" && oppUltimate) {
            // The bot's ultimate goes through the same resolver, which commits
            // both sides itself - including routing its damage to whatever this
            // mode is fought over - so this branch skips the local bookkeeping.
            castUltimate(oppUltimate, "opponent");
            newPlayerHp = playerRef.current.hp;
            newPlayerShield = playerRef.current.shield ?? 0;
            newOppHp = opponentRef.current.hp;
            ultimateHandled = true;
          } else {
            const hit = damageWithEffects(
              oppArch,
              opponentEffectsRef.current,
              opponentBonusDamageRef.current,
              { action: choice, correctCount: oppCorrect, currentHp: prevOpp.hp },
            );
            for (const kind of hit.consumed) {
              opponentEffectsRef.current = consumeUse(opponentEffectsRef.current, kind);
            }
            setOpponentEffects(opponentEffectsRef.current);
            const dmg = hitPlayer(hit.damage);
            const cost = ACTIONS[choice].focusCost;
            if (cost > 0) newOppFocus = Math.max(0, prevOpp.focus - cost);
            const gain = FOCUS_GAIN[choice];
            if (gain > 0) newOppFocus = Math.min(prevOpp.maxFocus, newOppFocus + gain);
            setShowPlayerHit(true);
            const critNote = hit.crit ? " CRIT!" : "";
            addLog({
              actor: "opponent",
              actionType: choice,
              result: `${prevOpp.name} ${ACTIONS[choice].label}: ${modeDamageLabel(dmg)}.${critNote}`,
              value: dmg,
            });
          }

          // The opponent's own every-third-answer restore (God, or a Fulcrum bot).
          const oppDivine = getStreakHeal(oppArch, oppCorrect + 1);
          if (oppDivine > 0) {
            newOppHp = Math.min(prevOpp.maxHp, newOppHp + spendHeal("opponent", oppDivine));
            addLog({
              actor: "opponent",
              actionType: "heal",
              result: `${prevOpp.name}'s passive: ${modeRestoreLabel(oppDivine)}.`,
              value: oppDivine,
            });
          }
        } else {
          nextOppMom = 0;
          const flub = applyDefense(Math.floor(Math.random() * 6) + 4, oppArch);
          newOppHp = Math.max(0, prevOpp.hp - spendMiss("opponent", flub));
          addLog({
            actor: "opponent",
            actionType: "miss",
            result: `${prevOpp.name} fluffs ${ACTIONS[choice].label}${modeUsesHp() ? `: -${flub} HP` : ""}.`,
            value: flub,
          });
        }

        if (memory) updateBattleMemoryAiTurn(memory, success);
        if (success) opponentCorrectRef.current += 1;
        modeTurnsRef.current += 1;
        setOpponentMomentum(nextOppMom);
        if (!ultimateHandled) {
          setPlayer((p) => ({ ...p, hp: newPlayerHp, shield: newPlayerShield }));
          setOpponent((o) => ({ ...o, hp: newOppHp, focus: newOppFocus }));
        } else {
          setOpponent((o) => ({ ...o, focus: newOppFocus }));
        }
        // A correct bot answer builds its ultimate charge the same way ours does.
        if (success) {
          const nextCharge = Math.min(
            1,
            opponentChargeRef.current + ULTIMATE_TUNING.chargePerCorrectAnswer,
          );
          opponentChargeRef.current = nextCharge;
          setOpponentCharge(nextCharge);
        }
        if (opponentCooldownRef.current > 0) opponentCooldownRef.current -= 1;

        setTimeout(() => {
          setShowPlayerHit(false);

          if (pendingPlacementRef.current) {
            // Territory: waiting on the player to tap a tile - resolvePendingPlacement continues the loop.
            return;
          }

          const modeOutcome = resolveModeOutcome(newPlayerHp, newOppHp);
          if (modeOutcome === "ended") {
            // finishBattle already ran.
          } else if (modeOutcome === "passthrough" && newPlayerHp <= 0) {
            finishBattle(false);
          } else if (modeOutcome === "passthrough" && newOppHp <= 0) {
            finishBattle(true);
          } else {
            setPhase("select");
          }
        }, 600);
        // Variable, right-skewed, and occasionally hesitant - see botThinkDelayMs.
        // A flat delay here was the loudest remaining tell: nothing else in the
        // match is metronomic, so a perfectly regular opponent stands out inside
        // a few turns.
      },
      botThinkDelayMs(battleMemoryRef.current?.turnNumber ?? 0),
    );
  }, [addLog, finishBattle, opponentArchetype, opponentMomentum, getArch]);

  const selectAction = async (action: Action) => {
    if (opponentTypeRef.current === "live" && liveActionLockedRef.current) {
      addLog({
        actor: "system",
        actionType: "info",
        result: `Action already locked for this turn.`,
      });
      return;
    }

    // Start-of-turn effects resolve before the question is drawn: poison can
    // end the match, and a freeze costs the turn outright.
    const tick = runEffectTick("player");
    if (tick.died) {
      finishBattle(false);
      return;
    }
    if (tick.frozen) {
      addLog({
        actor: "system",
        actionType: "info",
        result: `You are frozen - the turn is skipped.`,
      });
      setTimeout(() => {
        aiTurn();
      }, 700);
      return;
    }

    if (action === "ultimate" && !ultimateReady) {
      addLog({
        actor: "system",
        actionType: "info",
        result:
          ultimateCooldownRef.current > 0
            ? `Ultimate cooling down for ${ultimateCooldownRef.current} more turn(s).`
            : `Ultimate not charged yet.`,
      });
      return;
    }

    const cost = ACTIONS[action].focusCost;
    if (cost > 0 && player.focus < cost) {
      addLog({ actor: "system", actionType: "info", result: `Need ${cost} Focus!` });
      return;
    }
    setCurrentAction(action);
    if (cost > 0) setPlayer((prev) => ({ ...prev, focus: Math.max(0, prev.focus - cost) }));
    addLog({
      actor: "player",
      actionType: "info",
      result: `You ${ACTIONS[action].label.toLowerCase()}...`,
    });

    const arch = getArch(archetype);

    // Fulcrum borrows a fresh passive at the top of every round, at reduced strength.
    if (arch.copiesPassive) {
      const borrowed = rollCopiedPassive();
      copiedPassiveRef.current = borrowed;
      setCopiedPassive(borrowed);
      addLog({
        actor: "system",
        actionType: "info",
        result: `Fulcrum copies ${ARCHETYPES[borrowed].name}'s passive this round (reduced).`,
      });
    }

    const level = getActionDifficultyLevel(arch, action);
    const category = levelToCategory(level);
    let q = generateQuestion(category);
    let challengeId: string | null = null;
    liveChallengeIdRef.current = null;
    liveChallengeAnswerRef.current = null;
    {
      const { data, error } = await supabase.rpc("issue_battle_question", {
        p_difficulty: category,
        p_battle_id: opponentTypeRef.current === "live" ? pvpBattleIdRef.current : null,
      });
      if (error || !data) {
        if (cost > 0)
          setPlayer((prev) => ({ ...prev, focus: Math.min(prev.maxFocus, prev.focus + cost) }));
        toast.error("Couldn't prepare a secure battle question.");
        return;
      }
      const challenge = data as {
        challenge_id: string;
        prompt: string;
        options: number[];
        topic: string;
        difficulty: Difficulty;
      };
      q = {
        q: challenge.prompt,
        options: challenge.options,
        topic: challenge.topic,
        difficulty: challenge.difficulty,
      };
      challengeId = challenge.challenge_id;
      if (opponentTypeRef.current === "live") liveChallengeIdRef.current = challengeId;
    }
    setQuestion(q);
    setQuestionChallengeId(challengeId);
    // Base clock, then Velocity Break's pin, then any delta an ultimate left on
    // us - floored so a stacked debuff can never make a question unanswerable.
    let t = nextTimerOverrideRef.current
      ? nextTimerOverrideRef.current.seconds
      : getQuestionTime(arch, category);
    if (pendingTimerDeltaRef.current !== 0) {
      t += pendingTimerDeltaRef.current;
      addLog({
        actor: "system",
        actionType: "info",
        result: `Your clock is ${pendingTimerDeltaRef.current < 0 ? "cut" : "extended"} by ${Math.abs(pendingTimerDeltaRef.current)}s.`,
      });
      pendingTimerDeltaRef.current = 0;
    }
    t = Math.max(ULTIMATE_TUNING.minTimerSeconds, Math.round(t));
    setMaxTime(t);
    setTimeLeft(t);
    setPhase("question");
  };

  const [ecliptar, setEcliptar] = useState<Ecliptar | null>(null);

  const startBattle = (selection?: ClassSelection) => {
    const cls = selection?.archetype || archetype;
    const eclip = selection?.ecliptar ?? ecliptar;
    if (selection?.archetype) setArchetype(selection.archetype);
    if (selection?.ecliptar) {
      setEcliptar(selection.ecliptar);
      setEcliptarSlug(selection.ecliptar.slug);
      ecliptarRef.current = selection.ecliptar.slug;
    }

    const rolledGambler = cls === "gambler" ? rollGamblerStats() : null;
    setGamblerStats(rolledGambler);
    setRatingChange(null);
    setKoBanner(null);
    setPhase("searching");

    pvpChannelRef.current = null;
    setPvpBattleId(null);
    battleFinishedRef.current = false;
    answeredChallengeIdsRef.current = [];
    rematchStartedRef.current = false;
    setLiveRematchState("idle");

    // Reset mode state. Draft's player team was already picked in DraftDialog
    // and set on gameModeRef before this ran - everything else starts fresh.
    tugStateRef.current = initialTugState();
    setTugState(tugStateRef.current);
    territoryGridRef.current = startingGrid();
    territoryWeightsRef.current = initialWeights();
    setTerritoryGrid(territoryGridRef.current);
    setTerritoryFlipped([]);
    pendingPlacementRef.current = null;
    setPlacementWeight(0);
    modeTurnsRef.current = 0;
    opponentCorrectRef.current = 0;
    actingSideRef.current = "player";
    if (gameModeRef.current !== "draft") {
      playerDraftTeamRef.current = null;
    }
    opponentDraftTeamRef.current = null;

    // Run full Tier 1->2 matchmaking asynchronously. Non-Battle modes have no
    // realtime sync yet, so they skip straight past the live tier they don't
    // support - see GAME_MODES.
    void (async () => {
      try {
        const match: MatchResult = await findMatch(
          cls,
          playerRatingRef.current,
          playerUsername,
          (msg) => setMatchStatus(msg),
          { allowLive: gameModeRef.current === "battle" },
        );

        // Resolve opponent from match result
        let oppArchetype: ArchetypeId;
        let oppName: string;
        let oppSlug: string | undefined; // opponent's ecliptar (for its battle sprite)

        if (match.opponentArchetype) {
          oppArchetype = match.opponentArchetype;
          oppName = match.opponentName;

          // A live opponent arrives as an archetype, so it would otherwise
          // fight with no Ecliptar at all - no sprite, and no ultimate, since
          // ultimates are keyed by Ecliptar slug. That would make it strictly
          // weaker than a bot, so derive a stable stand-in from the archetype,
          // keyed on the opponent's identity so the same rival always brings the
          // same creature rather than a new one each encounter.
          oppSlug = ecliptarForArchetype(oppArchetype, match.opponentUserId ?? oppName)?.slug;
        } else if (gameModeRef.current === "draft") {
          // Draft Battle: the bot drafts its own team the same way the player
          // just did; its first pick opens the match like any other bot fight.
          const oppTeam = startingTeam(autoDraftTeam());
          opponentDraftTeamRef.current = oppTeam;
          const oppEclip = activeMember(oppTeam) ?? pickOpponent(cls);
          oppArchetype = oppEclip.archetype;
          oppName = oppEclip.name;
          oppSlug = oppEclip.slug;
        } else {
          // Bot: pick a real ecliptar for the creature, sprite and archetype,
          // but show the *handle* matchmaking chose rather than the creature's
          // name. A real opponent is displayed as a username, so naming a bot
          // "Vulpix" while the player next to it is "quanta_47" would announce
          // which is which through the name alone.
          const oppEclip = pickOpponent(cls);
          oppArchetype = oppEclip.archetype;
          oppName = match.opponentName;
          oppSlug = oppEclip.slug;
        }
        // Always use the archetype's icon so bot / live opponents visually
        // reflect their build instead of a generic robot.
        const oppIcon = ARCHETYPES[oppArchetype].icon;

        // Live: store battle ID so the Realtime useEffect subscribes
        if (match.type === "live" && match.pvpBattleId) {
          setPvpBattleId(match.pvpBattleId);
        }

        if (match.type === "live") {
          iAmChallengerRef.current = match.iAmChallenger === true;
          opponentUserIdRef.current = match.opponentUserId ?? null;
          liveResolvedTurnsRef.current = new Set();
        }
        resetLiveTurnLocks(1);

        // Sync refs for async-safe use inside callbacks
        setOpponentType(match.type);
        opponentTypeRef.current = match.type;
        setOpponentRating(match.opponentRating);
        opponentRatingRef.current = match.opponentRating;

        const baseArch = ARCHETYPES[cls];
        const effectiveArch = rolledGambler ? { ...baseArch, ...rolledGambler } : baseArch;
        const playerName = eclip?.name ?? "You";
        const playerIcon = eclip?.icon ?? User;
        const oppArch = ARCHETYPES[oppArchetype];

        setPlayer({
          name: playerName,
          hp: effectiveArch.maxHp,
          maxHp: effectiveArch.maxHp,
          shield: 0,
          focus: baseArch.startFocus,
          maxFocus: baseArch.focusPool,
          icon: playerIcon,
          ...(eclip ? { sprite: ecliptarSpriteUrl(eclip.slug) } : {}),
        });
        setOpponent({
          name: oppName,
          hp: oppArch.maxHp,
          maxHp: oppArch.maxHp,
          focus: oppArch.startFocus,
          maxFocus: oppArch.focusPool,
          icon: oppIcon,
          ...(oppSlug ? { sprite: ecliptarSpriteUrl(oppSlug) } : {}),
        });
        setOpponentArchetype(oppArchetype);
        opponentEcliptarRef.current = oppSlug ?? null;
        battleMemoryRef.current = createBattleMemory();
        setMomentum(0);
        setOpponentMomentum(0);
        setLogs([]);
        setTotalScore(0);
        setRecords([]);
        correctCountRef.current = 0;
        setCorrectCount(0);
        copiedPassiveRef.current = null;
        setCopiedPassive(null);
        resetUltimateState();
        setLongestStreak(0);
        setFastestAnswer(Infinity);
        setBattleStats(null);

        if (rolledGambler) {
          setPhase("gamblerReveal");
        } else {
          setPhase("select");
          addLog({
            actor: "system",
            actionType: "info",
            result: `${playerName} (${baseArch.name}) vs ${oppName} (${oppArch.name})`,
          });
        }
      } catch (error) {
        console.error("Matchmaking failed", error);
        toast.error("Couldn't find a match. Please try again.");
        setPhase("idle");
      }
    })();
  };

  /** Draft Battle: the pre-match team was just picked in DraftDialog - kick
   *  off an ordinary bot match with its first member, same as any other
   *  archetype selection. Team-swap-on-KO takes over from there via
   *  resolveModeOutcome. */
  const startDraftBattle = (team: Ecliptar[]) => {
    const draft = startingTeam(team);
    playerDraftTeamRef.current = draft;
    const first = activeMember(draft);
    if (!first) return;
    startBattle({ archetype: first.archetype, ecliptar: first });
  };

  const reset = () => {
    setGameMode("battle");
    gameModeRef.current = "battle";
    setPhase("idle");
    setBattleStats(null);
    setKoBanner(null);
    setPvpBattleId(null);
    setOpponentType("bot");
    setRatingChange(null);
    pvpChannelRef.current = null;
    battleFinishedRef.current = false;
    rematchStartedRef.current = false;
    setLiveRematchState("idle");
    resetLiveTurnLocks(1);
  };

  // Direct PvP challenge: bypass matchmaking and drop straight into a live
  // battle using a pre-created pvp_battles row. Triggered by ChallengeInbox
  // and the challenger-side realtime "accepted" listener.
  const startDirectBattle = useCallback(
    (opts: {
      battleId: string;
      myArchetype: ArchetypeId;
      opponentArchetype: ArchetypeId;
      opponentName: string;
      opponentRating?: number;
      iAmChallenger?: boolean;
      opponentUserId?: string;
    }) => {
      setArchetype(opts.myArchetype);
      setRatingChange(null);
      setKoBanner(null);
      battleFinishedRef.current = false;
      rematchStartedRef.current = false;
      setLiveRematchState("idle");
      pvpChannelRef.current = null;
      const rolledGambler = opts.myArchetype === "gambler" ? rollGamblerStats() : null;
      setGamblerStats(rolledGambler);

      setOpponentType("live");
      opponentTypeRef.current = "live";
      setOpponentRating(opts.opponentRating ?? 1000);
      opponentRatingRef.current = opts.opponentRating ?? 1000;
      setPvpBattleId(opts.battleId);

      iAmChallengerRef.current = opts.iAmChallenger === true;
      opponentUserIdRef.current = opts.opponentUserId ?? null;
      liveResolvedTurnsRef.current = new Set();
      resetLiveTurnLocks(1);

      const baseArch = ARCHETYPES[opts.myArchetype];
      const oppArch = ARCHETYPES[opts.opponentArchetype];
      const playerName = ecliptar?.name ?? "You";
      const playerIcon = ecliptar?.icon ?? User;
      const effectiveArch = rolledGambler ? { ...baseArch, ...rolledGambler } : baseArch;

      setPlayer({
        name: playerName,
        hp: effectiveArch.maxHp,
        maxHp: effectiveArch.maxHp,
        shield: 0,
        focus: baseArch.startFocus,
        maxFocus: baseArch.focusPool,
        icon: playerIcon,
        ...(ecliptar ? { sprite: ecliptarSpriteUrl(ecliptar.slug) } : {}),
      });
      setOpponent({
        name: opts.opponentName,
        hp: oppArch.maxHp,
        maxHp: oppArch.maxHp,
        focus: oppArch.startFocus,
        maxFocus: oppArch.focusPool,
        icon: oppArch.icon,
      });
      setOpponentArchetype(opts.opponentArchetype);
      battleMemoryRef.current = createBattleMemory();
      setMomentum(0);
      setOpponentMomentum(0);
      setLogs([]);
      setTotalScore(0);
      setRecords([]);
      correctCountRef.current = 0;
      setCorrectCount(0);
      copiedPassiveRef.current = null;
      setCopiedPassive(null);
      resetUltimateState();
      setLongestStreak(0);
      setFastestAnswer(Infinity);
      setBattleStats(null);
      if (rolledGambler) {
        setPhase("gamblerReveal");
      } else {
        setPhase("select");
        addLog({
          actor: "system",
          actionType: "info",
          result: `Direct challenge - ${playerName} (${baseArch.name}) vs ${opts.opponentName} (${oppArch.name}) | LIVE`,
        });
      }
    },
    [ecliptar],
  );

  // Listen for direct-challenge events fired by ChallengeInbox / accepted
  // notifications elsewhere on the page.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | {
            battleId: string;
            myArchetype: ArchetypeId;
            opponentArchetype: ArchetypeId;
            opponentName: string;
            opponentRating?: number;
            iAmChallenger?: boolean;
          }
        | undefined;
      if (!detail) return;
      startDirectBattle(detail);
    };
    window.addEventListener("eclipta:direct-battle", handler);
    return () => window.removeEventListener("eclipta:direct-battle", handler);
  }, [startDirectBattle]);

  // -- Idle --
  if (phase === "idle") {
    if (showPractice) {
      return (
        <WeakSpotPractice
          initialConcept={practiceConcept}
          onClose={() => {
            setShowPractice(false);
            setPracticeConcept(null);
          }}
          onBattle={() => {
            setShowPractice(false);
            setPracticeConcept(null);
            setGameMode("battle");
            gameModeRef.current = "battle";
            setPhase("classSelect");
          }}
        />
      );
    }
    return (
      <motion.div
        className="btt-card text-center py-16 px-10 relative overflow-hidden"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <div className="btt-idle-glow" aria-hidden />
        <motion.div
          className="btt-idle-emblem w-24 h-24 mx-auto mb-8 flex items-center justify-center"
          animate={{ rotate: [0, 5, -5, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        >
          <Swords className="w-12 h-12 text-neon-pink" />
        </motion.div>
        <h3 className="btt-shout text-5xl mb-3">Enter the Arena</h3>
        <p className="btt-mono-text text-[12px] text-muted-foreground mb-8 max-w-sm mx-auto leading-relaxed">
          Pick a format, choose your archetype, and solve equations under pressure.
          <br />
          Build combos. Destroy your opponent.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <motion.button
            onClick={() => setPhase("modeSelect")}
            className="btt-idle-cta btt-mono-text inline-flex items-center gap-3 px-10 py-4 font-bold text-[12px] tracking-widest"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
          >
            <Zap className="w-4 h-4" />
            SELECT MODE
          </motion.button>
          <button
            onClick={() => setShowPractice(true)}
            className="btt-mono-text inline-flex items-center gap-2 px-6 py-4 font-bold text-[11px] tracking-widest text-muted-foreground hover:text-foreground border border-border hover:border-foreground/30 transition-colors active:scale-[0.97]"
          >
            <Target className="w-4 h-4" />
            PRACTICE WEAK SPOTS
          </button>
        </div>
      </motion.div>
    );
  }

  // -- Mode Select --
  if (phase === "modeSelect") {
    return (
      <GameModeSelectDialog
        onSelect={(mode) => {
          setGameMode(mode);
          gameModeRef.current = mode;
          setPhase(mode === "draft" ? "draft" : "classSelect");
        }}
      />
    );
  }

  // -- Draft --
  if (phase === "draft") {
    return <DraftDialog onComplete={(team) => startDraftBattle(team)} />;
  }

  // -- Class Select --
  if (phase === "classSelect") {
    return <ClassSelectDialog onSelect={(sel) => startBattle(sel)} />;
  }

  // -- Searching --
  if (phase === "searching") {
    // Cinematic "Eclipse Alignment" intro (docs/battle-redesign loading redesign).
    // Original spinner-style loader is in git history prior to the Eclipse Alignment redesign.
    return <BattleIntro archetype={archetype} matchStatus={matchStatus} />;
  }

  // -- Gambler Reveal --
  if (phase === "gamblerReveal" && gamblerStats) {
    const baseArch = ARCHETYPES[archetype];
    return (
      <GamblerRevealScreen
        stats={gamblerStats}
        opponentName={opponent.name}
        onComplete={() => {
          setPhase("select");
          addLog({
            actor: "system",
            actionType: "info",
            result: `${player.name} (${baseArch.name}) vs ${opponent.name} (${ARCHETYPES[opponentArchetype].name})!`,
          });
        }}
      />
    );
  }

  // -- Result --
  if (phase === "result" && battleStats) {
    return (
      <BattleReport
        stats={battleStats}
        onRematch={() => setPhase(gameMode === "draft" ? "draft" : "classSelect")}
        {...(ecliptar && gameMode !== "draft"
          ? { onContinueWithEcliptar: () => startBattle({ archetype, ecliptar }) }
          : {})}
        onBack={reset}
        ratingChange={ratingChange}
        opponentType={opponentType}
        {...(opponentType === "live" ? { onLiveRematch: () => void handleLiveRematch() } : {})}
        liveRematchState={liveRematchState}
        onPracticeWeakSpots={(topic) => {
          // Practice lives on the idle screen, so returning there is what makes
          // "Back to arena" land somewhere sensible afterwards.
          setPracticeConcept(topic);
          setShowPractice(true);
          reset();
        }}
      />
    );
  }

  // -- Battle --
  const playerCritical = player.hp > 0 && player.hp <= player.maxHp * 0.25;
  return (
    <div className={`relative ${showPlayerHit ? "btt-shake" : ""}`}>
      {/* Directional impact flashes - pink when you're hit, cyan when your hit lands */}
      <AnimatePresence>
        {showPlayerHit && (
          <motion.div
            key="impact-left"
            aria-hidden
            data-decorative="motion"
            className="btt-impact-flash btt-impact-flash--left"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          />
        )}
        {showOpponentHit && (
          <motion.div
            key="impact-right"
            aria-hidden
            data-decorative="motion"
            className="btt-impact-flash btt-impact-flash--right"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          />
        )}
      </AnimatePresence>

      {/* Critical-HP danger framing */}
      {playerCritical && !koBanner && (
        <div className="btt-danger-vignette" aria-hidden data-decorative="motion" />
      )}

      {/* Battle-start stinger */}
      <AnimatePresence>
        {showFight && (
          <motion.div
            key="fight"
            className="btt-stinger"
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.p
              className="btt-stinger-word text-7xl sm:text-8xl md:text-9xl text-foreground"
              style={{
                textShadow:
                  "0 0 70px oklch(0.60 0.17 255 / 0.55), 0 0 160px oklch(0.58 0.17 252 / 0.35)",
              }}
              initial={{ scale: 2.3, opacity: 0, letterSpacing: "0.45em" }}
              animate={{ scale: 1, opacity: 1, letterSpacing: "0.06em" }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            >
              FIGHT
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* KO banner - holds the moment before the battle report */}
      <AnimatePresence>
        {koBanner && (
          <motion.div
            key="ko"
            className="btt-stinger btt-stinger--ko"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="text-center px-6" role="alert">
              {/* Icon, not colour alone: Trophy for a win, Skull for a loss. */}
              {koBanner === "victory" ? (
                <Trophy className="w-12 h-12 mx-auto mb-3 text-primary" aria-hidden="true" />
              ) : (
                <Skull className="w-12 h-12 mx-auto mb-3 text-neon-pink" aria-hidden="true" />
              )}
              <motion.p
                aria-label={
                  koBanner === "victory"
                    ? t("battle.victoryAnnouncement")
                    : t("battle.defeatAnnouncement")
                }
                className={`btt-stinger-word text-7xl sm:text-8xl md:text-9xl ${koBanner === "victory" ? "text-primary" : "text-neon-pink"}`}
                style={{
                  textShadow:
                    koBanner === "victory"
                      ? "0 0 80px oklch(0.78 0.13 88 / 0.6), 0 0 200px oklch(0.78 0.13 88 / 0.3)"
                      : "0 0 80px oklch(0.60 0.17 255 / 0.6), 0 0 200px oklch(0.60 0.17 255 / 0.3)",
                }}
                initial={{ scale: 0.55, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              >
                {koBanner === "victory" ? "VICTORY" : "DEFEAT"}
              </motion.p>
              <motion.p
                className="btt-mono-text text-[11px] tracking-[0.4em] text-muted-foreground mt-5"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.4 }}
              >
                {koBanner === "victory"
                  ? "OPPONENT ELIMINATED"
                  : `${opponent.name.toUpperCase()} TAKES THE ROUND`}
              </motion.p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Combo burst - the payoff moment, front and center */}
      <AnimatePresence>
        {comboBurst && (
          <motion.div
            key={comboBurst.id}
            aria-hidden
            className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 1, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.1, times: [0, 0.1, 0.7, 1] }}
          >
            <motion.div
              className="text-center"
              initial={{ scale: 0.4, rotate: -5 }}
              animate={{ scale: [0.4, 1.16, 1], rotate: [-5, 2, 0] }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              <p
                className="btt-shout text-6xl sm:text-7xl md:text-8xl text-neon-pink px-4"
                style={{
                  textShadow:
                    "0 0 44px oklch(0.60 0.17 255 / 0.8), 0 0 120px oklch(0.60 0.17 255 / 0.4)",
                }}
              >
                COMBO x{comboBurst.combo}
              </p>
              <p className="btt-mono-text text-[12px] tracking-[0.34em] text-neon-pink/80 mt-2">
                {comboBurst.mult.toFixed(2)}x SCORE
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Wild event overlay - appears on the battle field, not inside the question panel */}
      <AnimatePresence>
        {ultimateCast && <UltimateCastOverlay cast={ultimateCast} />}
      </AnimatePresence>

      {/* Forfeit / leave control - confirms, then counts as a loss by abandonment */}
      {(phase === "select" || phase === "question" || phase === "animate" || phase === "placing") &&
        !koBanner && (
          <div className="flex justify-end mb-2">
            <button
              onClick={() => setConfirmExit(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-foreground/15 text-[10px] font-bold tracking-widest uppercase text-muted-foreground hover:text-foreground hover:border-destructive/50 transition-colors active:scale-[0.97]"
              title="Leave the battle (counts as a loss)"
            >
              <X className="w-3 h-3" /> Forfeit
            </button>
          </div>
        )}

      {/* Tug-of-War: the shared bar sits above the fighter cards, alongside
          HP rather than replacing it - stats/ultimates still change HP, the
          bar is just what decides the match in this mode. */}
      {gameMode === "tugofwar" &&
        (phase === "select" || phase === "question" || phase === "animate") &&
        !koBanner && (
          <div className="mb-3">
            <TugOfWarBar state={tugState} playerName={player.name} opponentName={opponent.name} />
          </div>
        )}

      {gameMode === "territory" &&
        (phase === "select" ||
          phase === "question" ||
          phase === "animate" ||
          phase === "placing") &&
        !koBanner && (
          <div className="mb-3">
            <TerritoryGridView
              grid={territoryGrid}
              awaitingPlacement={phase === "placing"}
              onPlace={resolvePendingPlacement}
              lastFlipped={territoryFlipped}
              placementWeight={placementWeight}
              score={scoreGrid(territoryGrid, territoryWeightsRef.current)}
            />
          </div>
        )}

      <div className="flex gap-3 mb-4">
        <FighterCard
          fighter={player}
          side="left"
          momentum={momentum}
          archetype={archetype}
          effects={playerEffects}
          showHit={showPlayerHit}
          showHeal={showPlayerHeal}
          // Charge is only genuinely "ready" when the player can actually click
          // it this very moment: in select phase, no action locked, and enough
          // focus. Mirrors the disabled logic on the Charge action button.
          canCharge={
            phase === "select" && !liveActionLocked && player.focus >= ACTIONS.charge.focusCost
          }
          showHp={GAME_MODES[gameMode].resource === "hp"}
        />
        <div className="flex flex-col items-center justify-center px-2 gap-1">
          <motion.div
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Swords className="w-6 h-6 text-neon-pink" />
          </motion.div>
          <span className="text-[10px] font-bold tracking-widest text-muted-foreground">VS</span>
        </div>
        <FighterCard
          fighter={opponent}
          side="right"
          momentum={opponentMomentum}
          archetype={opponentArchetype}
          showHit={showOpponentHit}
          showHeal={false}
          effects={opponentEffects}
          showHp={GAME_MODES[gameMode].resource === "hp"}
        />
      </div>

      <div className="space-y-3">
        {/* Momentum bar with near-miss telegraphing and live multiplier readout */}
        {(() => {
          // How far into the current combo cycle are we?
          // At threshold multiples (3, 6, 9...) show the bar fully filled.
          const comboProgress =
            momentum > 0 && momentum % comboThreshold === 0
              ? comboThreshold
              : momentum % comboThreshold;
          // One pip away from next combo activation
          const isNearMiss = momentum > 0 && momentum % comboThreshold === comboThreshold - 1;
          const comboActive = momentum >= comboThreshold;
          const arch = getArch(archetype);
          // Momentum pays out in SCORE only - it no longer touches damage.
          const activeMult = getScoreMultiplier(arch, momentum, correctCount, copiedPassive);

          return (
            <div className="btt-card p-3">
              {/* Top row: label + live multiplier + COMBO badge */}
              <div className="flex items-center gap-2 mb-2">
                <motion.div
                  animate={isNearMiss ? { scale: [1, 1.25, 1] } : {}}
                  transition={{
                    duration: 0.55,
                    repeat: isNearMiss ? Infinity : 0,
                    repeatDelay: 0.35,
                  }}
                >
                  <Flame
                    className={`w-4 h-4 transition-colors ${
                      comboActive
                        ? "text-neon-pink"
                        : momentum > 0
                          ? "text-neon-pink/60"
                          : "text-muted-foreground"
                    }`}
                  />
                </motion.div>
                <span className="text-[10px] font-bold tracking-widest text-muted-foreground">
                  MOMENTUM
                </span>
                <div className="flex-1" />
                {momentum > 0 && (
                  <motion.span
                    key={momentum}
                    className={`text-[11px] font-bold font-display tabular-nums ${
                      comboActive ? "text-neon-pink" : "text-foreground"
                    }`}
                    initial={{ scale: comboProgress === 0 ? 1.4 : 1.1, opacity: 0.7 }}
                    animate={{ scale: 1, opacity: 1 }}
                  >
                    {activeMult.toFixed(2)}x
                  </motion.span>
                )}
                {comboActive && (
                  <motion.span
                    key={`combo-${Math.floor(momentum / comboThreshold)}`}
                    className="text-[9px] font-bold text-neon-pink tracking-widest bg-neon-pink/10 border border-neon-pink/30 px-1.5 py-0.5"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                  >
                    COMBO
                  </motion.span>
                )}
              </div>

              {/* Pip bar - next empty pip pulses when one away from activation */}
              <div className="flex gap-1">
                {Array.from({ length: comboThreshold }).map((_, i) => {
                  const isFilled = i < comboProgress;
                  // The first empty pip when one away from combo
                  const isPulse = isNearMiss && i === comboProgress;
                  return (
                    <motion.div
                      key={i}
                      className={`h-2 flex-1 ${isFilled ? "bg-neon-pink" : "bg-secondary/40"}`}
                      animate={
                        isPulse
                          ? {
                              backgroundColor: [
                                "oklch(0.60 0.17 255 / 0.15)",
                                "oklch(0.60 0.17 255 / 0.60)",
                                "oklch(0.60 0.17 255 / 0.15)",
                              ],
                              boxShadow: [
                                "0 0 0px oklch(0.60 0.17 255 / 0)",
                                "0 0 7px oklch(0.60 0.17 255 / 0.55)",
                                "0 0 0px oklch(0.60 0.17 255 / 0)",
                              ],
                            }
                          : {}
                      }
                      transition={
                        isPulse ? { duration: 0.75, repeat: Infinity, ease: "easeInOut" } : {}
                      }
                    />
                  );
                })}
              </div>

              {/* Near-miss cue label - subtle, disappears once threshold is hit */}
              <AnimatePresence>
                {isNearMiss && (
                  <motion.p
                    key="near-miss"
                    className="text-[9px] font-bold text-neon-pink/60 tracking-widest text-right mt-1"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    ONE MORE -&gt;
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          );
        })()}

        {/* -- Accelerator Power-Scaling HUD -------------------------------
            Only visible when playing as Accelerator. Communicates the
            core USP: sustained correct answers directly compound combat
            power. Every question answered is ammunition for the future. */}
        {archetype === "accelerator" &&
          (() => {
            const arch = getArch("accelerator");
            const { damagePerAnswer, damageCap, scorePerAnswer, scoreCap } =
              DAMAGE_TUNING.accelerator;
            // The ramp caps at +16 DMG (8 answers) and +35% score (18 answers) -
            // the bar tracks the slower of the two so it fills as the class matures.
            const answersToCap = Math.ceil(scoreCap / scorePerAnswer);
            const scalePct = Math.min(correctCount / answersToCap, 1);
            const effectiveDmg =
              arch.baseDamage + Math.min(correctCount * damagePerAnswer, damageCap);
            const effectiveScore = Math.round(
              Math.min(correctCount * scorePerAnswer, scoreCap) * 100,
            );

            // Stage labels communicate qualitative feel, not just a number
            const stage =
              scalePct >= 0.9
                ? { label: "MAXIMUM POWER", color: "text-neon-pink", bar: "bg-neon-pink" }
                : scalePct >= 0.6
                  ? { label: "SURGING", color: "text-tier-platinum", bar: "bg-tier-platinum" }
                  : scalePct >= 0.3
                    ? { label: "ASCENDING", color: "text-tier-gold", bar: "bg-tier-gold" }
                    : scalePct > 0
                      ? { label: "AWAKENING", color: "text-neon-cyan", bar: "bg-neon-cyan" }
                      : { label: "DORMANT", color: "text-muted-foreground", bar: "bg-neon-cyan" };

            return (
              <div className="btt-card p-3 border-l-2 border-tier-platinum/50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <FastForward className="w-3.5 h-3.5 text-tier-platinum" />
                    <span className="text-[10px] font-bold tracking-widest text-tier-platinum">
                      POWER SCALING
                    </span>
                  </div>
                  <motion.span
                    key={stage.label}
                    className={`text-[9px] font-bold tracking-widest ${stage.color}`}
                    initial={{ opacity: 0.6, scale: 1.1 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    {stage.label}
                  </motion.span>
                </div>

                {/* Scaling progress bar */}
                <div className="h-2 bg-secondary/40 overflow-hidden rounded-sm mb-2">
                  <motion.div
                    className={`h-full rounded-sm ${stage.bar}`}
                    animate={{
                      width: `${scalePct * 100}%`,
                      // Pulse at maximum to signal explosive potential
                      opacity: scalePct >= 0.9 ? [1, 0.65, 1] : 1,
                    }}
                    transition={{
                      width: { duration: 0.7, ease: "easeOut" },
                      opacity: scalePct >= 0.9 ? { duration: 0.9, repeat: Infinity } : {},
                    }}
                  />
                </div>

                {/* Live stat readout - the educational feedback loop made visible */}
                <div className="flex items-center justify-between text-[9px] font-bold tabular-nums">
                  <span className="text-muted-foreground">
                    DMG{" "}
                    <span className={scalePct >= 0.6 ? "text-neon-pink" : "text-foreground"}>
                      {effectiveDmg}
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    SCORE{" "}
                    <span className={scalePct >= 0.6 ? "text-neon-pink" : "text-foreground"}>
                      +{effectiveScore}%
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    ✓{" "}
                    <span className="text-foreground">
                      {Math.min(correctCount, answersToCap)}/{answersToCap}
                    </span>
                  </span>
                </div>
              </div>
            );
          })()}

        {liveActionLocked && phase === "select" && (
          <motion.div
            className="glass-panel p-3 border border-neon-cyan/40 bg-neon-cyan/5 text-center"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <motion.span
              className="text-[11px] font-bold tracking-widest text-neon-cyan"
              animate={{ opacity: [0.55, 1, 0.55] }}
              transition={{ duration: 1.4, repeat: Infinity }}
            >
              {liveResolvingTurn
                ? "RESOLVING TURN..."
                : liveOpponentLocked
                  ? "BOTH ACTIONS LOCKED..."
                  : `ACTION LOCKED | WAITING FOR ${opponent.name.toUpperCase()}`}
            </motion.span>
          </motion.div>
        )}
        {/* Ultimate charge - the resource that gates the Ecliptar's signature move.
            Shown whenever an Ecliptar is equipped so the player can see it fill. */}
        {playerUltimate && (
          <div
            className={`btt-card p-3 border-l-2 ${ultimateReady ? "border-neon-purple" : "border-neon-purple/40"}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Sparkles
                  className={`w-3.5 h-3.5 shrink-0 ${ultimateReady ? "text-neon-purple" : "text-neon-purple/50"}`}
                />
                <span className="text-[10px] font-bold tracking-widest text-neon-purple truncate">
                  {playerUltimate.name.toUpperCase()}
                </span>
              </div>
              <motion.span
                key={ultimateReady ? "ready" : `charging-${Math.round(ultimateCharge * 100)}`}
                className={`text-[9px] font-bold tracking-widest shrink-0 ${
                  ultimateReady ? "text-neon-purple" : "text-muted-foreground"
                }`}
                initial={{ opacity: 0.6, scale: 1.1 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                {ultimateCooldown > 0
                  ? `COOLDOWN ${ultimateCooldown}`
                  : ultimateReady
                    ? "READY"
                    : `${Math.round(ultimateCharge * 100)}%`}
              </motion.span>
            </div>
            <div
              className="h-2 bg-secondary/40 overflow-hidden rounded-sm mb-2"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(ultimateCharge * 100)}
              aria-valuetext={
                ultimateCooldown > 0
                  ? t("battle.ultimateCooldown", { turns: ultimateCooldown })
                  : ultimateReady
                    ? `${playerUltimate.name}: ${t("battle.ultimateReady")}`
                    : `${playerUltimate.name}: ${t("battle.ultimateCharging", { percent: Math.round(ultimateCharge * 100) })}`
              }
            >
              <motion.div
                className="h-full rounded-sm bg-neon-purple"
                animate={{
                  width: `${ultimateCharge * 100}%`,
                  opacity: ultimateReady ? [1, 0.6, 1] : 1,
                }}
                transition={{
                  width: { duration: 0.5, ease: "easeOut" },
                  opacity: ultimateReady ? { duration: 1.1, repeat: Infinity } : {},
                }}
              />
            </div>
            <p className="text-[9px] leading-snug text-muted-foreground">
              {playerUltimate.description}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(Object.entries(ACTIONS) as [Action, ActionConfig][]).map(([key, act]) => {
            const Icon = act.icon;
            const cost = act.focusCost;
            const cannotHeal = key === "defend" && getArch(archetype).healAmount === null;
            const ultimateBlocked = key === "ultimate" && !ultimateReady;
            const disabled =
              phase !== "select" ||
              (cost > 0 && player.focus < cost) ||
              cannotHeal ||
              ultimateBlocked ||
              liveActionLocked;
            return (
              <motion.button
                key={key}
                onClick={() => selectAction(key)}
                disabled={disabled}
                className={`btt-action btt-action--${key}`}
                whileHover={!disabled ? { scale: 1.02, y: -2 } : {}}
                whileTap={!disabled ? { scale: 0.97 } : {}}
              >
                <Icon
                  className={`w-8 h-8 mx-auto mb-2 ${key === "charge" ? "text-neon-pink" : key === "defend" ? "text-neon-cyan" : key === "ultimate" ? "text-neon-purple" : "text-foreground/80"}`}
                />
                <div className="btt-shout text-lg tracking-wider">
                  {key === "ultimate" && playerUltimate
                    ? playerUltimate.name.toUpperCase()
                    : act.label.toUpperCase()}
                </div>
                <div className="btt-mono-text text-[9px] text-muted-foreground mt-1 leading-tight">
                  {/* getActionDesc returns "Can't heal | builds Focus" for any no-heal
                      class (Tank and now God), so this stays correct without hardcoding a name. */}
                  {getActionDesc(key, getArch(archetype), correctCount, playerUltimate)}
                </div>
                {cost > 0 && (
                  <div className="absolute top-2 right-2 btt-mono-text text-[8px] font-bold text-neon-purple border border-neon-purple/30 px-1">
                    -{cost}
                  </div>
                )}
                {key === "ultimate" && (
                  <div
                    className={`absolute top-2 right-2 btt-mono-text text-[8px] font-bold px-1 border ${
                      ultimateReady
                        ? "text-neon-purple border-neon-purple/50"
                        : "text-muted-foreground border-border/50"
                    }`}
                  >
                    {ultimateCooldown > 0
                      ? `CD ${ultimateCooldown}`
                      : `${Math.round(ultimateCharge * 100)}%`}
                  </div>
                )}
                {FOCUS_GAIN[key] > 0 && (
                  <div className="absolute top-2 right-2 btt-mono-text text-[8px] font-bold text-neon-cyan border border-neon-cyan/30 px-1">
                    +{FOCUS_GAIN[key]}
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>

        <BattleChat
          pvpChannelRef={pvpChannelRef}
          opponentType={opponentType}
          opponentName={opponent.name}
          playerName={player.name}
          phase={phase}
          incomingItems={incomingChats}
        />

        <BattleLog logs={logs} />
      </div>

      <AnimatePresence>
        {phase === "question" && question && (
          <QuestionOverlay
            question={question}
            timeLeft={timeLeft}
            maxTime={maxTime}
            onAnswer={handleQuestionAnswer}
          />
        )}
      </AnimatePresence>

      {/* Forfeit confirmation - leaving counts as a loss by abandonment */}
      <Dialog open={confirmExit} onOpenChange={setConfirmExit}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-xl flex items-center gap-2">
              <X className="w-5 h-5 text-destructive" /> Leave this battle?
            </DialogTitle>
            <DialogDescription>
              Leaving now counts as a{" "}
              <span className="text-foreground font-bold">loss by abandonment</span>. You'll forfeit
              the match{opponentType !== "bot" ? " and lose rating, just like a defeat" : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end mt-2">
            <button
              onClick={() => setConfirmExit(false)}
              className="px-4 py-2 text-xs font-bold tracking-widest rounded-md border border-border hover:border-foreground/30 transition-colors active:scale-[0.97]"
            >
              KEEP FIGHTING
            </button>
            <button
              onClick={() => {
                setConfirmExit(false);
                finishBattle(false);
              }}
              className="px-4 py-2 text-xs font-bold tracking-widest rounded-md bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity active:scale-[0.97]"
            >
              FORFEIT (LOSS)
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- Leaderboard -----------------------------------------------------
// A cinematic, game-style ranking board: a top-3 medal podium over a clean
// ranked list. Both tabs (PvP Rating / XP) share one normalised row shape so
// the podium + list render identically. The signed-in player is detected by
// user_id and highlighted - and pinned to the foot of the board if they rank
// outside the visible top 10, so "where do I stand" is always answerable.
interface LbRow {
  rank: number;
  userId: string;
  name: string;
  isUser: boolean;
  tier: string;
  score: number;
  wins?: number;
  losses?: number;
  /**
   * Rated but hasn't finished a match yet. Shown rather than hidden - the old
   * board dropped these players entirely - but marked, because a starting 1000
   * and an earned 1000 are not the same claim.
   */
  provisional?: boolean;
}

const MEDAL: Record<1 | 2 | 3, { color: string; label: string; Icon: typeof Crown }> = {
  1: { color: "#e9c558", label: "Champion", Icon: Crown },
  2: { color: "#c4c9d4", label: "Runner-up", Icon: Medal },
  3: { color: "#cc8a4e", label: "Third", Icon: Medal },
};

const winRate = (w?: number, l?: number) => {
  const total = (w ?? 0) + (l ?? 0);
  return total > 0 ? Math.round(((w ?? 0) / total) * 100) : null;
};
const initialOf = (name: string) => (name.trim()[0] ?? "?").toUpperCase();
const isUsername = (name: string) => /^[a-zA-Z0-9_]{3,20}$/.test(name);

function LbName({ row, className }: { row: LbRow; className?: string }) {
  if (isUsername(row.name)) {
    return (
      <a href={`/u/${row.name}`} className={className}>
        {row.name}
      </a>
    );
  }
  return <span className={className}>{row.name}</span>;
}

function LeaderboardCard() {
  const [tab, setTab] = useState<"rating" | "xp">("rating");
  const [xpEntries, setXpEntries] = useState<LbRow[]>([]);
  const [pvpEntries, setPvpEntries] = useState<LbRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const myId = user?.id ?? null;
      const [xpRes, pvpRes] = await Promise.all([
        supabase.rpc("get_leaderboard", { p_limit: 10 }),
        supabase.rpc("get_pvp_leaderboard", { p_limit: 10 }),
      ]);
      if (cancelled) return;
      setXpEntries(
        (
          (xpRes.data ?? []) as { user_id: string; username?: string | null; xp: number | null }[]
        ).map((r, i) => ({
          rank: i + 1,
          userId: r.user_id,
          name: r.username || `learner_${r.user_id.slice(0, 6)}`,
          isUser: r.user_id === myId,
          tier: xpToTier(r.xp ?? 0),
          score: r.xp ?? 0,
        })),
      );
      setPvpEntries(
        (
          (pvpRes.data ?? []) as {
            user_id: string;
            username?: string | null;
            rating: number;
            wins: number;
            losses: number;
            games: number;
          }[]
        ).map((r, i) => ({
          rank: i + 1,
          userId: r.user_id,
          name: r.username || `player_${r.user_id.slice(0, 6)}`,
          isUser: r.user_id === myId,
          tier: ratingToTier(r.rating),
          score: r.rating,
          wins: r.wins,
          losses: r.losses,
          provisional: r.games === 0,
        })),
      );
      setLoading(false);
    };
    void load();

    // Debounced refresh on any XP / rating change anywhere - keeps the board
    // close to live without hammering RPCs on every event.
    let pending: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        void load();
      }, 500);
    };

    const xpChan = supabase
      .channel(`leaderboard-xp:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "user_profiles" },
        scheduleRefresh,
      )
      .subscribe();
    const pvpChan = supabase
      .channel(`leaderboard-pvp:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "player_ratings" },
        scheduleRefresh,
      )
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pvp-leaderboard-updated", scheduleRefresh);

    return () => {
      cancelled = true;
      if (pending) clearTimeout(pending);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pvp-leaderboard-updated", scheduleRefresh);
      supabase.removeChannel(xpChan);
      supabase.removeChannel(pvpChan);
    };
  }, []);

  const entries = tab === "rating" ? pvpEntries : xpEntries;
  const unit = tab === "rating" ? "RATING" : "XP";
  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);
  // The signed-in player, if they fall outside the visible top 10.
  const meInList = entries.some((e) => e.isUser);

  const fmtScore = (n: number) => (tab === "xp" ? n.toLocaleString() : String(n));

  return (
    <motion.div
      className="btt-card btt-lb p-6 md:p-8"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Trophy className="w-5 h-5 text-tier-gold" />
          <div>
            <h3 className="btt-shout text-3xl leading-none">LEADERBOARD</h3>
            <p className="btt-mono-text text-[10px] text-muted-foreground tracking-[0.24em] mt-1">
              {tab === "rating" ? "TOP RANKED | GLOBAL" : "MOST XP | GLOBAL"}
            </p>
          </div>
        </div>
        <div className="btt-lb-tabs">
          {(["rating", "xp"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`btt-lb-tab ${tab === t ? "is-on" : ""} active:scale-[0.97] hover:opacity-90`}
            >
              {t === "rating" ? "PvP Rating" : "XP"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="btt-lb-skeleton">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="btt-lb-skel-row" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="btt-lb-empty">
          <Crown className="w-7 h-7 mx-auto mb-3 text-tier-gold opacity-70" />
          <p className="btt-shout text-2xl mb-1">The throne is empty</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed max-w-xs mx-auto">
            {tab === "rating"
              ? "Finish a live battle to claim the first spot on the rating ladder."
              : "Win battles and earn XP to etch your name into the board first."}
          </p>
        </div>
      ) : (
        <>
          {/* -- Podium (top 3) -- visual order 2 | 1 | 3 -- */}
          {podium.length >= 1 && (
            <div className="btt-lb-podium">
              {[podium[1], podium[0], podium[2]].map((row) => {
                if (!row)
                  return <div key={Math.random()} className="btt-lb-pod-empty" aria-hidden />;
                const m = MEDAL[row.rank as 1 | 2 | 3];
                const wr = winRate(row.wins, row.losses);
                return (
                  <div
                    key={row.userId}
                    className={`btt-lb-pod btt-lb-pod--${row.rank}${row.isUser ? " btt-lb-pod--me" : ""}`}
                    style={{ "--m": m.color } as React.CSSProperties}
                  >
                    <div className="btt-lb-pod-medal">
                      <m.Icon className="w-4 h-4" />
                      <span>{row.rank === 1 ? "1ST" : row.rank === 2 ? "2ND" : "3RD"}</span>
                    </div>
                    <div className="btt-lb-ava">{initialOf(row.name)}</div>
                    <LbName row={row} className="btt-lb-pod-name" />
                    <div className={`btt-lb-pod-tier ${tierColors[row.tier] ?? ""}`}>
                      {row.tier}
                    </div>
                    <div className="btt-lb-pod-score">{fmtScore(row.score)}</div>
                    <div className="btt-lb-pod-sub">
                      {tab === "rating"
                        ? row.provisional
                          ? "Provisional | no matches yet"
                          : wr !== null
                            ? `${row.wins}W ${row.losses}L | ${wr}%`
                            : `${row.wins ?? 0}W ${row.losses ?? 0}L`
                        : unit}
                    </div>
                    {row.isUser && <div className="btt-lb-you">YOU</div>}
                  </div>
                );
              })}
            </div>
          )}

          {/* -- Ranked list (4+) -- */}
          {rest.length > 0 && (
            <div className="btt-lb-rows">
              {rest.map((row) => {
                const wr = winRate(row.wins, row.losses);
                return (
                  <div
                    key={row.userId}
                    className={`btt-lb-row${row.isUser ? " btt-lb-row--me" : ""}`}
                  >
                    <span className="btt-lb-rank">{row.rank}</span>
                    <span className="btt-lb-row-ava">{initialOf(row.name)}</span>
                    <div className="min-w-0">
                      <LbName row={row} className="btt-lb-row-name" />
                      <span
                        className={`btt-lb-row-tier ${tierColors[row.tier] ?? "text-muted-foreground"}`}
                      >
                        {row.tier}
                      </span>
                    </div>
                    <div className="btt-lb-row-score">
                      <div className="btt-lb-row-num">{fmtScore(row.score)}</div>
                      <div className="btt-lb-row-sub">
                        {tab === "rating"
                          ? row.provisional
                            ? "Provisional | no matches yet"
                            : wr !== null
                              ? `${row.wins}W ${row.losses}L | ${wr}%`
                              : `${row.wins ?? 0}W ${row.losses ?? 0}L`
                          : unit}
                      </div>
                    </div>
                    {row.isUser && <span className="btt-lb-you-pill">YOU</span>}
                  </div>
                );
              })}
            </div>
          )}

          {!meInList && (
            <p className="btt-lb-foot">Not on the board yet - win ranked battles to climb in.</p>
          )}
        </>
      )}
    </motion.div>
  );
}

// --- Daily Challenge (live) -------------------------------------------
function DailyChallengeCard() {
  const [wins, setWins] = useState(0);
  const [claimed, setClaimed] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [countdown, setCountdown] = useState("");
  const challenge = getTodayChallenge();

  const refresh = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setAuthed(false);
      return;
    }
    setAuthed(true);
    const today = new Date().toISOString().slice(0, 10);
    const data = await getDailyChallengeProgress(user.id, today);
    setWins(data?.wins ?? 0);
    setClaimed(!!data?.bonus_claimed);
  }, []);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener("daily-challenge-updated", handler);
    return () => window.removeEventListener("daily-challenge-updated", handler);
  }, [refresh]);

  // Countdown to next UTC midnight
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const next = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0),
      );
      const diff = next.getTime() - now.getTime();
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1000);
      setCountdown(`${h}h ${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const target = challenge.target;
  const display = Math.min(wins, target);
  const complete = wins >= target;

  const handleClaim = useCallback(async () => {
    if (claiming || claimed || !complete) return;
    setClaiming(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Sign in to claim your reward");
        return;
      }
      // Server-side atomic claim: validates wins>=target and bonus_claimed=false
      // in a single UPDATE so concurrent clicks can't double-claim.
      const { data: claimedOk, error: claimErr } = await supabase.rpc(
        "claim_daily_challenge_bonus",
        { p_required_wins: target },
      );
      if (claimErr || !claimedOk) {
        toast.error("Couldn't claim - try again");
        return;
      }
      // Award the XP via the rate-limited server RPC. The amount (100) is
      // enforced server-side; the client cannot inflate it.
      await awardXp("daily_challenge", 100);
      setClaimed(true);
      toast.success("Daily Challenge complete!", { description: "+100 XP added to your profile." });
    } catch {
      toast.error("Couldn't claim - try again");
    } finally {
      setClaiming(false);
    }
  }, [claiming, claimed, complete, target]);

  return (
    <motion.div
      className="btt-card btt-card--purple p-5"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.4 }}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-neon-purple/10 border border-neon-purple/30 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-neon-purple" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="btt-shout text-xl">DAILY | {challenge.title.toUpperCase()}</h4>
          <p className="text-[10px] text-muted-foreground">
            {!authed
              ? `Sign in to track today's challenge`
              : claimed
                ? `Reward claimed. Come back tomorrow for a new challenge.`
                : complete
                  ? `Reward ready to claim - +100 XP`
                  : `${challenge.goal} -> +100 XP`}
          </p>
        </div>
        <div
          className={`text-lg font-bold font-display ${complete ? "text-neon-cyan" : "text-neon-purple"}`}
        >
          {display}/{target}
        </div>
      </div>
      {authed && (
        <div className="mt-3 h-1.5 bg-secondary/60 overflow-hidden">
          <motion.div
            className={`h-full ${complete ? "bg-neon-cyan" : "bg-neon-purple"}`}
            animate={{ width: `${(display / target) * 100}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      )}
      {authed && complete && (
        <button
          onClick={handleClaim}
          disabled={claimed || claiming}
          className={`mt-3 w-full px-3 py-2 text-[11px] font-bold tracking-widest rounded-sm transition-colors ${
            claimed
              ? "bg-secondary/40 text-muted-foreground cursor-default"
              : "bg-neon-cyan text-background hover:bg-neon-cyan/90 disabled:opacity-60"
          } active:scale-[0.97]`}
        >
          {claimed ? "✓ CLAIMED" : claiming ? "CLAIMING..." : "CLAIM +100 XP"}
        </button>
      )}
      <div className="mt-3 flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
        <Timer className="w-3 h-3" />
        RESETS IN <span className="text-foreground tabular-nums">{countdown}</span>
      </div>
    </motion.div>
  );
}

// --- Main Export ------------------------------------------------------
export function KnowledgeBattles() {
  const [howOpen, setHowOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  return (
    <section className="btt-shell min-h-screen pt-24 pb-16">
      <div className="btt-bg" aria-hidden>
        <div className="btt-aurora" />
        <div className="btt-grid" />
        <div className="btt-vignette" aria-hidden="true" />
        <div className="btt-noise" />
      </div>
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          className="mb-14"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="btt-arena-label mb-6">
            <Swords className="w-3 h-3 text-neon-pink" />
            CYBER-MATH ARENA
          </div>
          <h1 className="btt-title btt-shout text-7xl md:text-9xl mb-4">
            Knowledge <span className="text-neon-pink">Battles</span>
          </h1>
          <p className="btt-mono-text text-[13px] text-muted-foreground max-w-xl leading-relaxed">
            Choose your archetype. Solve equations under pressure.
            <br className="hidden md:block" />
            Build devastating combos. Review and learn from every fight.
          </p>
        </motion.div>

        <div className="space-y-6">
          <ChallengeInbox />
          <StreakHub />
          <div className="relative">
            <div className="flex items-center justify-end gap-2 mb-3">
              <button
                onClick={() => setSearchOpen(true)}
                className="btt-ghost-btn btt-ghost-btn--cyan active:scale-[0.97] hover:opacity-90"
                aria-label="Find player"
              >
                <Users className="w-3 h-3" /> FIND PLAYER
              </button>
              <button
                onClick={() => setHowOpen(true)}
                className="btt-ghost-btn btt-ghost-btn--purple active:scale-[0.97] hover:opacity-90"
                aria-label="Battle info"
              >
                <Info className="w-3 h-3" /> INFO
              </button>
            </div>
            <BattleArena />
          </div>
          <DailyChallengeCard />
          <LeaderboardCard />
        </div>
      </div>

      <UserSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />

      {/* Floating "How to Play" button */}
      <motion.button
        onClick={() => setHowOpen(true)}
        className="btt-help-btn"
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        aria-label="How to play"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <HelpCircle className="w-5 h-5" />
      </motion.button>

      <Dialog open={howOpen} onOpenChange={setHowOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl flex items-center gap-2">
              <Info className="w-5 h-5 text-neon-purple" />
              How Battles work
            </DialogTitle>
            <DialogDescription>
              Everything you need to know - opponents, combat, and rewards.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 text-sm">
            <section>
              <h4 className="text-xs font-bold tracking-widest text-neon-pink mb-2 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5" /> OPPONENTS
              </h4>
              <ul className="space-y-1.5 text-muted-foreground leading-relaxed list-disc pl-5">
                <li>
                  <span className="text-neon-cyan font-bold">LIVE PvP</span> - the system first
                  scans for a real player currently in queue. If one is found, you battle
                  head-to-head in real time via a live channel. Rating is at stake.
                </li>
                <li>
                  <span className="text-muted-foreground font-bold">AI OPPONENT</span> - if nobody
                  is in queue after 8 seconds, you are matched with an AI opponent rather than left
                  waiting. These earn full XP, but they do not move your rating or your W/L record.
                </li>
                <li>
                  Priority is always{" "}
                  <span className="text-foreground font-bold">Live -&gt; AI</span>. You are never
                  given an AI opponent while a real player is available.
                </li>
                <li>
                  <span className="text-foreground font-bold">
                    We don&apos;t label which one you got.
                  </span>{" "}
                  A match doesn&apos;t tell you whether the name across from you is a person or an
                  AI - playing differently against each is its own kind of spoiler. That&apos;s why
                  it&apos;s written here instead: you always know AI opponents exist and roughly how
                  often you&apos;ll see one, just not which is which in the moment.
                </li>
              </ul>
            </section>

            <section>
              <h4 className="text-xs font-bold tracking-widest text-neon-cyan mb-2 flex items-center gap-1.5">
                <Swords className="w-3.5 h-3.5" /> COMBAT
              </h4>
              <ul className="space-y-1.5 text-muted-foreground leading-relaxed list-disc pl-5">
                <li>
                  Each turn you answer a question, then pick an action.{" "}
                  <span className="text-foreground font-bold">
                    The action sets the question's difficulty
                  </span>{" "}
                  - Heal draws an easy one, Attack a medium one, Charge a hard one. Bigger payoff,
                  harder question.
                </li>
                <li>
                  <span className="text-foreground font-bold">Attack</span> - your class's base
                  damage; builds <span className="text-neon-cyan">+15 Focus</span>. Your
                  bread-and-butter.
                </li>
                <li>
                  <span className="text-foreground font-bold">Heal</span> - restores HP; builds{" "}
                  <span className="text-neon-cyan">+10 Focus</span>.{" "}
                  <span className="text-foreground">
                    The Tank and the God can't Heal - they build Focus instead.
                  </span>
                </li>
                <li>
                  <span className="text-foreground font-bold">Charge</span> - 1.8x your damage, but
                  spends <span className="text-neon-purple">25 Focus</span>. Your finisher.
                </li>
                <li>
                  <span className="text-foreground font-bold">Wild</span> - a chaotic effect for{" "}
                  <span className="text-neon-purple">15 Focus</span>.
                </li>
                <li>
                  <span className="text-foreground font-bold">
                    Every number on the action buttons is YOUR archetype's
                  </span>{" "}
                  - a Speedster's Attack hits harder the faster you answer, an Accelerator's grows
                  each turn, an Apex's is brutal but fragile. Read them before you commit.
                </li>
                <li>
                  <span className="text-neon-purple font-bold">Focus</span> unlocks Charge &amp;
                  Wild - build it with Attack/Heal. Pool size differs by class (Speedster small,
                  Apex huge).
                </li>
                <li>
                  Correct answers grow <span className="text-neon-pink font-bold">Momentum</span>{" "}
                  -&gt; a bigger score bonus. A wrong answer or timeout breaks Momentum and lets
                  your opponent counter.
                </li>
                <li>
                  <span className="text-foreground font-bold">
                    Leaving a battle counts as a loss by abandonment
                  </span>{" "}
                  - finish what you start.
                </li>
              </ul>
            </section>

            <section>
              <h4 className="text-xs font-bold tracking-widest text-neon-purple mb-2 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> ARCHETYPES &amp; REWARDS
              </h4>
              <ul className="space-y-1.5 text-muted-foreground leading-relaxed list-disc pl-5">
                <li>
                  Each archetype tweaks HP, damage, defense, time, heal, crit power, and question
                  difficulty - plus one signature passive. Pick the one that fits your style.
                </li>
                <li>
                  Every battle counts toward your{" "}
                  <span className="text-foreground font-bold">daily practice streak</span>; streak
                  milestones grant bonus XP.
                </li>
                <li>XP earned advances your Trophy Road and unlocks new Ecliptars to claim.</li>
              </ul>
            </section>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={() => setHowOpen(false)} variant="default">
              Got it
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
