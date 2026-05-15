import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Swords, Zap, Trophy, Shield, Flame, Timer, Sparkles,
  Target, Heart, Skull, Dices, User, Bot, HelpCircle, Info, FastForward,
  Users, Ghost, Radio, TrendingUp, TrendingDown, MessageSquare, VolumeX, Volume2,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import type { Phase, Action, ArchetypeId, Archetype, Fighter, MathQuestion, QuestionRecord, BattleStats, ActionConfig, GamblerRoll, LogEntry, LogActionType } from "./battles/types";
import { generateQuestion, TIMER_DURATIONS } from "./battles/questions";
import { levelToCategory, getActionDifficultyLevel, getEffectiveDamage, getEffectiveMultiplierStep, streakToMultiplier, hpToSelfDmgMult } from "./battles/stat-mechanics";
import { createBattleMemory, updateBattleMemoryPlayerTurn, updateBattleMemoryAiTurn, AI_PERSONALITIES, pickAiAction, computeAiAccuracy, getPressureLogLine, type BattleMemory } from "./battles/ai-brain";
import { ARCHETYPES, rollGamblerStats } from "./battles/archetypes";
import { ClassSelectDialog, type ClassSelection } from "./battles/ClassSelectDialog";
import { BattleReport } from "./battles/BattleReport";
import { UserSearchDialog } from "./battles/UserSearchDialog";
import { ChallengeInbox } from "./battles/ChallengeInbox";
import { ECLIPTARS, type Ecliptar } from "@/lib/ecliptars";
import { supabase } from "@/integrations/supabase/client";
import { getTodayChallenge } from "@/lib/daily-challenge";
import { findMatch, leaveQueue, type MatchResult, type OpponentType } from "@/lib/matchmaking";
import { recordBattleSession, type GhostSession } from "@/lib/battle-replay";
import { fetchPlayerRating, updateRating, ratingToTier, formatRatingDelta } from "@/lib/rating";
import { awardXp } from "@/lib/xp-service";
import { toast } from "sonner";

/**
 * Pick a random opponent Ecliptar (excluding the player's own archetype when possible).
 * Rank-based matchmaking has been removed — every battle is a fair random draw.
 */
function pickOpponent(playerArch: ArchetypeId): Ecliptar {
  const candidates = ECLIPTARS.filter((e) => e.archetype !== playerArch);
  const pool = candidates.length > 0 ? candidates : ECLIPTARS;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ─── Action Config ───────────────────────────────────────────────────
// Focus economy: Attack & Defend BUILD focus, Charge & Wild SPEND it.
// This gives Attack a real role (cheap, fast focus build) and makes Charge
// a payoff move that requires setup rather than a strictly-better Attack.
const FOCUS_GAIN: Record<Action, number> = { attack: 15, defend: 10, charge: 0, wild: 0 };

const ACTIONS: Record<Action, ActionConfig> = {
  attack: { label: "Attack", icon: Swords, focusCost: 0,  desc: "Your base DMG · +15 Focus" },
  defend: { label: "Heal",   icon: Heart,  focusCost: 0,  desc: "Restore HP · +10 Focus" },
  charge: { label: "Charge", icon: Zap,    focusCost: 25, desc: "1.8× your DMG · −25 Focus" },
  wild:   { label: "Wild",   icon: Dices,  focusCost: 15, desc: "Chaos effect · −15 Focus" },
};

/**
 * Issue 3: compute action button description from the active archetype's real stats.
 * No hardcoded values — every number comes directly from the archetype definition.
 */
function getActionDesc(action: Action, arch: Archetype, recordCount: number): string {
  switch (action) {
    case "attack": {
      if (arch.damageIsTimeScaled) {
        // Speedster: base + up-to-base speed bonus → show range
        return `${arch.baseDamage}–${arch.baseDamage * 2} DMG · +15 Focus`;
      }
      if (arch.multiplierScales) {
        // Accelerator: damage grows with questions answered (13→27 over 10 Qs)
        const dmg = Math.round(13 + Math.min(recordCount / 10, 1) * 14);
        return `${dmg} DMG ↑ · +15 Focus`;
      }
      return `${arch.baseDamage} DMG · +15 Focus`;
    }
    case "defend": {
      if (arch.healAmount === null) return `+10 Focus only`;
      return `+${arch.healAmount} HP · +10 Focus`;
    }
    case "charge": {
      if (arch.damageIsTimeScaled) {
        const base = Math.floor(arch.baseDamage * 1.8);
        return `${base}–${base * 2} DMG · −25 Focus`;
      }
      if (arch.multiplierScales) {
        const base = Math.round(13 + Math.min(recordCount / 10, 1) * 14);
        return `${Math.floor(base * 1.8)} DMG ↑ · −25 Focus`;
      }
      return `${Math.floor(arch.baseDamage * 1.8)} DMG · −25 Focus`;
    }
    case "wild":
      return `Chaos effect · −15 Focus`;
  }
}

// ─── Chat / Emoji Reaction constants ────────────────────────────────
// Issue 2: preset-only — no free-text chat.
const CHAT_PHRASES = ["hey", "thanks", "lol", "good luck", "nice", "wow"] as const;
const EMOJI_REACTIONS = ["👍", "👎", "😂", "😮", "🔥", "💀"] as const;

interface ChatItem {
  id: number;
  text: string;
  fromPlayer: boolean;  // true = local player sent it
  senderName: string;
  ts: number;           // Date.now() at creation for TTL removal
}

type LeaderboardEntry = { rank: number; name: string; xp: number; tier: string };

// Aligned with Trophy Road tier thresholds in src/lib/trophy-road-data.ts
function xpToTier(xp: number): string {
  if (xp >= 460000) return "God Tier";
  if (xp >= 265000) return "Unreal";
  if (xp >= 145000) return "Champion";
  if (xp >= 78000)  return "Platinum";
  if (xp >= 43000)  return "Diamond";
  if (xp >= 20000)  return "Gold";
  if (xp >= 7500)   return "Silver";
  return "Bronze";
}

const tierColors: Record<string, string> = {
  "God Tier": "text-tier-god",
  Unreal: "text-tier-unreal",
  Champion: "text-tier-champion",
  Platinum: "text-tier-platinum",
  Diamond: "text-tier-diamond",
  Gold: "text-tier-gold",
  Silver: "text-tier-silver",
  Bronze: "text-tier-bronze",
};

// ─── Audio Engine ─────────────────────────────────────────────────────
// Web Audio API tone synthesizer — runs on the main thread, no external deps.
// AudioContext is created lazily on first use (requires prior user gesture).
let _audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!_audioCtx) { try { _audioCtx = new AudioContext(); } catch { return null; } }
  if (_audioCtx.state === "suspended") void _audioCtx.resume();
  return _audioCtx;
}
function playTone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.10) {
  const ctx = getAudioCtx(); if (!ctx) return;
  const osc = ctx.createOscillator(); const gain = ctx.createGain();
  osc.type = type; osc.frequency.setValueAtTime(freq, ctx.currentTime);
  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(ctx.currentTime); osc.stop(ctx.currentTime + dur);
}
// Pitch rises with streak (220 Hz base + 22 Hz per streak hit, capped at 880 Hz)
function sfxStreak(streak: number) { playTone(Math.min(220 + streak * 22, 880), 0.11, "sine", 0.09); }
function sfxBreak()   { playTone(160, 0.22, "triangle", 0.11); setTimeout(() => playTone(110, 0.28, "triangle", 0.07), 90); }
function sfxCombo()   { playTone(660, 0.08, "sine", 0.13); setTimeout(() => playTone(880, 0.14, "sine", 0.10), 80); }
function sfxWild()    { [0, 55, 110].forEach((ms, i) => setTimeout(() => playTone(300 + i * 130, 0.18, "sawtooth", 0.07), ms)); }

// ─── Sub-components ──────────────────────────────────────────────────
function HpBar({ current, max, color, label }: { current: number; max: number; color: string; label: string }) {
  const pct = Math.max(0, (current / max) * 100);
  const isCritical = max > 0 && current / max < 0.20;
  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-1">
        <span className={`text-[10px] font-bold tracking-widest transition-colors ${isCritical ? "text-neon-pink" : "text-muted-foreground"}`}>{label}</span>
        <div className="flex items-center gap-1">
          <motion.span
            animate={isCritical ? { scale: [1, 1.25, 1] } : {}}
            transition={{ repeat: Infinity, duration: 0.65 }}
          >
            <Heart className={`w-3 h-3 ${isCritical ? "text-neon-pink" : "text-neon-pink/70"}`} />
          </motion.span>
          <span className={`text-xs font-bold font-display transition-colors ${isCritical ? "text-neon-pink" : ""}`}>{current}/{max}</span>
        </div>
      </div>
      <motion.div
        className={`h-3 bg-secondary/60 overflow-hidden border transition-colors ${isCritical ? "border-neon-pink/60" : "border-border/50"}`}
        animate={isCritical ? { x: [0, -1.5, 1.5, -1, 0] } : {}}
        transition={isCritical ? { repeat: Infinity, duration: 0.42, ease: "easeInOut" } : {}}
        style={isCritical ? { boxShadow: "0 0 10px oklch(0.6 0.24 350 / 0.45)" } : {}}
      >
        <motion.div
          className={`h-full transition-colors ${isCritical ? "bg-neon-pink" : color}`}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </motion.div>
    </div>
  );
}

function FocusBar({ current, max, isPlayer = false, canAct = false }: { current: number; max: number; isPlayer?: boolean; canAct?: boolean }) {
  const chargeCost = ACTIONS.charge.focusCost;
  const isCharged = current >= chargeCost;
  const isWarm    = current >= chargeCost - 10;
  const fillRatio = max > 0 ? current / max : 0;
  const pulseSpeed = isCharged ? 0.55 : isWarm ? 0.95 : 1.6;
  return (
    <div className="w-full">
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
          const glowAmt = filled ? Math.min(fillRatio * 1.4, 0.85) : 0;
          return (
            <motion.div
              key={i}
              className={`h-2 flex-1 transition-colors duration-300 ${
                filled
                  ? isCharged  ? "bg-neon-pink"
                  : isWarm     ? "bg-neon-purple"
                  :              "bg-neon-purple/60"
                  : "bg-secondary/40"
              }`}
              animate={filled && isCharged ? { opacity: [1, 0.65, 1] } : {}}
              transition={{ repeat: Infinity, duration: pulseSpeed, delay: i * 0.04 }}
              style={filled ? {
                boxShadow: isCharged
                  ? `0 0 5px oklch(0.6 0.24 350 / ${glowAmt})`
                  : isWarm
                  ? `0 0 3px oklch(0.55 0.25 290 / ${glowAmt * 0.6})`
                  : "none",
              } : {}}
            />
          );
        })}
      </div>
      <AnimatePresence>
        {isCharged && isPlayer && canAct && (
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
            CHARGE READY ⚡
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function FighterCard({ fighter, side, momentum, archetype, showHit, showHeal, canAct = false }: {
  fighter: Fighter; side: "left" | "right"; momentum: number; archetype?: ArchetypeId; showHit: boolean; showHeal: boolean; canAct?: boolean;
}) {
  const arch = archetype ? ARCHETYPES[archetype] : null;
  const comboThreshold = archetype === "fulcrum" ? 2 : 3;
  return (
    <motion.div
      className="glass-panel p-5 flex-1 relative overflow-hidden"
      animate={showHit ? { x: side === "left" ? [-8, 8, -4, 0] : [8, -8, 4, 0] } : {}}
      transition={{ duration: 0.4 }}
    >
      <AnimatePresence>
        {showHit && <motion.div className="absolute inset-0 bg-neon-pink/10 z-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} />}
        {showHeal && <motion.div className="absolute inset-0 bg-neon-cyan/10 z-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} />}
      </AnimatePresence>
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-12 h-12 border-2 flex items-center justify-center ${side === "left" ? "border-neon-cyan/50 bg-neon-cyan/5 text-neon-cyan" : "border-neon-pink/50 bg-neon-pink/5 text-neon-pink"}`}>
            <fighter.icon className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-bold font-display text-sm truncate">{fighter.name}</h4>
            {arch && (
              <span className={`inline-flex items-center gap-1 text-[9px] font-bold tracking-widest ${arch.color}`}>
                <arch.icon className="w-3 h-3" /> {arch.name.toUpperCase()}
              </span>
            )}
            {momentum > 0 && (() => {
              const combos = Math.floor(momentum / comboThreshold);
              const isHot  = combos >= 2;
              const isWarm = combos >= 1;
              return (
                <motion.div
                  className={`flex items-center gap-1 ${isHot ? "text-neon-pink" : isWarm ? "text-neon-pink/75" : "text-neon-pink/50"}`}
                  key={momentum}
                  initial={{ scale: 1.35, opacity: 0.7 }}
                  animate={{ scale: 1, opacity: 1 }}
                >
                  <Flame className={isHot ? "w-4 h-4" : "w-3 h-3"} />
                  <span className={`font-bold tracking-widest ${isHot ? "text-[11px]" : "text-[10px]"}`}>
                    {momentum}× STREAK
                  </span>
                </motion.div>
              );
            })()}
          </div>
        </div>
        <HpBar current={fighter.hp} max={fighter.maxHp} color={side === "left" ? "bg-neon-cyan" : "bg-neon-pink"} label="HP" />
        <div className="mt-2"><FocusBar current={fighter.focus} max={fighter.maxFocus} isPlayer={side === "left"} canAct={canAct && side === "left"} /></div>
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

function QuestionOverlay({ question, timeLeft, maxTime, onAnswer }: {
  question: MathQuestion; timeLeft: number; maxTime: number; onAnswer: (correct: boolean, timeSpent: number) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [showReveal, setShowReveal] = useState(false);
  const startTimeRef = useRef(Date.now());
  const pct = (timeLeft / maxTime) * 100;

  const handleSelect = (val: number) => {
    if (selected !== null) return;
    setSelected(val);
    const spent = (Date.now() - startTimeRef.current) / 1000;
    const correct = val === question.answer;
    if (correct) {
      setTimeout(() => onAnswer(true, spent), 600);
    } else {
      // Show correct answer reveal for 1.5s before triggering damage
      setTimeout(() => setShowReveal(true), 300);
      setTimeout(() => onAnswer(false, spent), 1900);
    }
  };

  return (
    <motion.div className="absolute inset-0 z-30 flex items-center justify-center bg-background/80 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="glass-panel p-8 max-w-lg w-full mx-4" initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}>
        <div className="mb-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className={`text-[10px] font-bold tracking-widest ${question.difficulty === "hard" ? "text-neon-pink" : question.difficulty === "medium" ? "text-neon-purple" : "text-neon-cyan"}`}>
              {question.difficulty.toUpperCase()} · {question.topic.toUpperCase()}
            </span>
            <div className="flex items-center gap-1">
              <Timer className={`w-3.5 h-3.5 ${timeLeft <= 3 ? "text-neon-pink" : "text-muted-foreground"}`} />
              <span className={`text-sm font-bold font-display ${timeLeft <= 3 ? "text-neon-pink" : "text-foreground"}`}>{timeLeft}s</span>
            </div>
          </div>
          <div className="h-1.5 bg-secondary/60 overflow-hidden">
            <motion.div className={`h-full ${timeLeft <= 3 ? "bg-neon-pink" : "bg-neon-purple"}`} animate={{ width: `${pct}%` }} transition={{ duration: 0.3 }} />
          </div>
        </div>
        <h3 className="text-3xl font-bold font-display text-center mb-8 text-foreground">{question.q.trimEnd().endsWith("?") ? question.q : `${question.q} = ?`}</h3>
        <div className="grid grid-cols-2 gap-3">
          {question.options.map((opt, i) => {
            let style = "border-border hover:border-neon-purple/60 hover:bg-neon-purple/5";
            if (selected !== null) {
              if (opt === question.answer) style = "border-neon-cyan bg-neon-cyan/10 text-neon-cyan";
              else if (opt === selected) style = "border-neon-pink bg-neon-pink/10 text-neon-pink";
              else style = "border-border opacity-40";
            }
            return (
              <motion.button key={i} onClick={() => handleSelect(opt)} disabled={selected !== null}
                className={`p-4 border text-xl font-bold font-display transition-colors ${style}`}
                whileHover={selected === null ? { scale: 1.03 } : {}} whileTap={selected === null ? { scale: 0.97 } : {}}
              >{opt}</motion.button>
            );
          })}
        </div>

        {/* Correct answer reveal — appears briefly on wrong answer before damage */}
        <AnimatePresence>
          {showReveal && (
            <motion.div
              className="mt-5 flex items-center justify-center gap-2 px-4 py-2.5 border border-neon-cyan/40 bg-neon-cyan/8"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <span className="text-[10px] font-bold tracking-widest text-muted-foreground">{question.topic.toUpperCase()} · CORRECT ANSWER</span>
              <span className="text-xl font-bold font-display text-neon-cyan">{question.answer}</span>
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
 * by React's reconciler. Color derives from actor + actionType — no emoji
 * prefix parsing.
 */
function BattleLog({ logs }: { logs: LogEntry[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollTo(0, ref.current.scrollHeight); }, [logs]);

  function colorFor(e: LogEntry): string {
    if (e.actor === "system") {
      if (e.actionType === "combo")     return "text-neon-pink";
      if (e.actionType === "separator") return "text-muted-foreground";
      if (e.actionType === "info")      return "text-tier-gold";
      return "text-muted-foreground";
    }
    if (e.actor === "player") {
      if (e.actionType === "miss")      return "text-neon-pink/80";
      if (e.actionType === "heal")      return "text-neon-cyan";
      if (e.actionType === "wild")      return "text-neon-purple";
      return "text-foreground";
    }
    // opponent
    if (e.actionType === "miss")        return "text-muted-foreground";
    if (e.actionType === "heal")        return "text-neon-cyan";
    if (e.actionType === "ghost")       return "text-neon-purple/70";
    return "text-neon-pink";
  }

  const turn = logs.filter(e => e.actionType === "separator").length || 1;

  return (
    <div className="glass-panel p-0 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/40 bg-secondary/20">
        <span className="text-[10px] font-bold tracking-widest text-muted-foreground">BATTLE LOG</span>
        <span className="text-[10px] tabular-nums text-muted-foreground">Turn {turn}</span>
      </div>
      <div ref={ref} className="p-3 h-48 overflow-y-auto space-y-1">
        {logs.length === 0 && (
          <p className="text-[10px] text-muted-foreground italic">Battle log will appear here…</p>
        )}
        {logs.map((e) => (
          <motion.p
            key={e.id}
            className={`text-[11px] leading-snug ${colorFor(e)}`}
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

// ─── Wild Event Overlay ───────────────────────────────────────────────
// Each Wild outcome has a distinct visual identity so the event reads as a
// force of nature, not a plain attack. Three event types, three color lanes.
type WildEventType = "chaos" | "mend" | "surge";
const WILD_CONFIGS: Record<WildEventType, { headline: string; color: string; border: string; bg: string }> = {
  chaos: { headline: "CHAOS STRIKE",  color: "text-tier-gold",    border: "border-tier-gold/50",    bg: "bg-tier-gold/10"    },
  mend:  { headline: "WILD MEND",     color: "text-neon-cyan",    border: "border-neon-cyan/50",    bg: "bg-neon-cyan/10"    },
  surge: { headline: "ARCANE SURGE",  color: "text-neon-purple",  border: "border-neon-purple/50",  bg: "bg-neon-purple/10"  },
};

function WildEventOverlay({ event }: { event: { type: WildEventType; sub: string } }) {
  const cfg = WILD_CONFIGS[event.type];
  return (
    <motion.div
      className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, 0] }}
      transition={{ duration: 1.3, times: [0, 0.08, 0.72, 1] }}
    >
      <motion.div
        className={`px-10 py-6 border-2 ${cfg.border} ${cfg.bg} text-center backdrop-blur-sm`}
        initial={{ scale: 0.55, y: 24 }}
        animate={{ scale: [0.55, 1.12, 1], y: [24, -4, 0] }}
        transition={{ duration: 0.38, ease: "easeOut" }}
      >
        <p className={`text-2xl font-bold font-display tracking-widest ${cfg.color}`}>{cfg.headline}</p>
        <p className={`text-sm font-bold mt-1.5 ${cfg.color} opacity-75`}>{event.sub}</p>
      </motion.div>
    </motion.div>
  );
}

// ─── Battle Chat + Emoji Reactions ───────────────────────────────────
// Issue 2: lightweight preset-only expression system. No free-text, no
// gameplay interruption. 3-second cooldown between sends prevents spam.
// Works one-sided for bot/ghost (local display only, no broadcast).

let _chatIdCounter = 0;

function BattleChat({
  pvpChannelRef,
  opponentType,
  opponentName,
  playerName,
  phase,
  incomingItems,
}: {
  pvpChannelRef: React.MutableRefObject<any>;
  opponentType: OpponentType;
  opponentName: string;
  playerName: string;
  phase: Phase;
  incomingItems: ChatItem[];
}) {
  const [sentItems, setSentItems]         = useState<ChatItem[]>([]);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [muted, setMuted]                 = useState(false);
  const [showPanel, setShowPanel]         = useState(false);
  const [tick, setTick]                   = useState(0);

  // Drive cooldown countdown without excessive re-renders
  useEffect(() => {
    if (tick === 0) return;
    const id = setInterval(() => setTick(Date.now()), 200);
    return () => clearInterval(id);
  }, [tick]);

  // Auto-expire displayed items after 4 s
  const allItems = [
    ...sentItems,
    ...(muted ? [] : incomingItems),
  ].sort((a, b) => a.ts - b.ts);

  const visibleItems = allItems.filter((item) => Date.now() - item.ts < 4000);

  // Only visible during active battle phases — zero footprint otherwise
  const isActive =
    phase === "select" || phase === "question" || phase === "animate";
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
      {/* Floating message bubbles — up to 2 visible at once */}
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
      <div className="glass-panel p-2 flex items-center gap-2 flex-wrap">
        {/* Toggle + mute controls */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setShowPanel((v) => !v)}
            title="Quick chat"
            className={`p-1.5 border text-[10px] font-bold transition-colors ${
              showPanel
                ? "border-neon-purple/60 text-neon-purple bg-neon-purple/10"
                : "border-border/40 text-muted-foreground hover:border-border"
            }`}
          >
            <MessageSquare className="w-3 h-3" />
          </button>
          <button
            onClick={() => setMuted((v) => !v)}
            title={muted ? "Unmute opponent" : "Mute opponent"}
            className={`p-1.5 border text-[10px] font-bold transition-colors ${
              muted
                ? "border-neon-pink/60 text-neon-pink bg-neon-pink/10"
                : "border-border/40 text-muted-foreground hover:border-border"
            }`}
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
                  className="px-2 py-1 border border-border/40 hover:border-neon-purple/50 text-[10px] font-bold tracking-wide transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {phrase}
                </button>
              ))}

              <span className="w-px h-4 bg-border/40 shrink-0" />

              {/* Emoji reactions */}
              {EMOJI_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => send(emoji)}
                  disabled={onCooldown}
                  className="px-1.5 py-1 border border-border/40 hover:border-neon-pink/40 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {emoji}
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

// ─── Gambler Reveal ───────────────────────────────────────────────────
// Stat definitions for the slot-machine reveal sequence.
type RevealDef = {
  key: keyof GamblerRoll;
  label: string;
  /** Formatted value shown once locked */
  lockText: (s: GamblerRoll) => string;
  /** Integer range cycled while unlocked (avoids floating-point flicker) */
  cycleRange: [number, number];
  /** Returns a 0–1 score for quality colouring (higher = better) */
  qualityScore: (s: GamblerRoll) => number;
  hasQuality: boolean;
};

const REVEAL_DEFS: RevealDef[] = [
  { key: "maxHp",          label: "HP",    lockText: s => String(s.maxHp),                          cycleRange: [80, 180],  qualityScore: s => (s.maxHp - 80) / 100,                  hasQuality: true  },
  { key: "baseDamage",     label: "DMG",   lockText: s => String(s.baseDamage),                     cycleRange: [8,  28],   qualityScore: s => (s.baseDamage - 8) / 20,               hasQuality: true  },
  { key: "multiplierStep", label: "MULTI", lockText: s => `+${Math.round(s.multiplierStep * 100)}%`, cycleRange: [5,  30],   qualityScore: s => (s.multiplierStep - 0.05) / 0.25,      hasQuality: true  },
  { key: "healAmount",     label: "HEAL",  lockText: s => `+${s.healAmount}`,                       cycleRange: [5,  25],   qualityScore: s => (s.healAmount - 5) / 20,               hasQuality: true  },
  { key: "timeMultiplier", label: "TIME",  lockText: s => `${s.timeMultiplier}×`,                   cycleRange: [75, 125],  qualityScore: s => 1 - (s.timeMultiplier - 0.75) / 0.5,   hasQuality: true  },
  { key: "diffMin",        label: "DIFF",  lockText: s => `${s.diffMin}–${s.diffMax}`,              cycleRange: [2,  9],    qualityScore: () => 0.5,                                  hasQuality: false },
];

type StatQuality = "poor" | "standard" | "good" | "legendary";

function scoreToQuality(score: number): StatQuality {
  if (score < 0.25) return "poor";
  if (score < 0.55) return "standard";
  if (score < 0.82) return "good";
  return "legendary";
}

const QUALITY_STYLE: Record<StatQuality, { label: string; value: string; border: string; bg: string }> = {
  poor:      { label: "LOW",       value: "text-muted-foreground/70", border: "border-border/50",      bg: ""                },
  standard:  { label: "BASE",      value: "text-foreground",          border: "border-border/70",      bg: ""                },
  good:      { label: "HIGH",      value: "text-neon-cyan",           border: "border-neon-cyan/50",   bg: "bg-neon-cyan/5"  },
  legendary: { label: "MAX",       value: "text-neon-pink",           border: "border-neon-pink/60",   bg: "bg-neon-pink/5"  },
};

/** Pre-battle slot-machine reveal for the Gambler archetype. */
function GamblerRevealScreen({ stats, opponentName, onComplete }: {
  stats: GamblerRoll;
  opponentName: string;
  onComplete: () => void;
}) {
  const STAGGER = 1100; // ms between each stat locking

  const [lockedCount, setLockedCount] = useState(0);
  const lockedRef = useRef(0);
  lockedRef.current = lockedCount;

  const [cycleNums, setCycleNums] = useState<number[]>(() =>
    REVEAL_DEFS.map(d => d.cycleRange[0])
  );
  const [allDone, setAllDone] = useState(false);

  useEffect(() => {
    // Cycle all not-yet-locked stats every 80 ms (slot-machine effect)
    const interval = setInterval(() => {
      setCycleNums(
        REVEAL_DEFS.map((d, i) =>
          i < lockedRef.current
            ? 0
            : d.cycleRange[0] + Math.floor(Math.random() * (d.cycleRange[1] - d.cycleRange[0] + 1))
        )
      );
    }, 80);

    // Lock one stat at a time with a staggered sequence
    const lockTimers = REVEAL_DEFS.map((_, i) =>
      setTimeout(() => {
        lockedRef.current = i + 1;
        setLockedCount(i + 1);
      }, STAGGER * (i + 1))
    );

    // Show the CTA once all stats are locked
    const doneTimer = setTimeout(() => {
      clearInterval(interval);
      setAllDone(true);
    }, STAGGER * REVEAL_DEFS.length + 700);

    return () => {
      clearInterval(interval);
      lockTimers.forEach(clearTimeout);
      clearTimeout(doneTimer);
    };
  }, []);

  // Overall build rating — average quality score across stats that have one
  const qualityStats = REVEAL_DEFS.filter(d => d.hasQuality);
  const avgQuality = qualityStats.reduce((s, d) => s + d.qualityScore(stats), 0) / qualityStats.length;

  const runLabel =
    avgQuality >= 0.78 ? "GOD ROLL ⚡"
    : avgQuality >= 0.60 ? "BLESSED RUN"
    : avgQuality >= 0.42 ? "SOLID BUILD"
    : avgQuality >= 0.25 ? "BALANCED ODDS"
    : "GLASS CANNON";

  const runColor =
    avgQuality >= 0.78 ? "text-neon-pink"
    : avgQuality >= 0.60 ? "text-tier-gold"
    : avgQuality >= 0.42 ? "text-neon-cyan"
    : "text-foreground";

  return (
    <motion.div
      className="glass-panel p-6 text-center"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      {/* Header */}
      <div className="mb-5">
        <motion.div
          className="w-14 h-14 mx-auto mb-3 border-2 border-tier-gold/50 bg-tier-gold/10 flex items-center justify-center"
          animate={!allDone ? {
            rotate: [0, 12, -12, 0],
            borderColor: ["oklch(0.8 0.15 80 / 0.5)", "oklch(0.75 0.18 50 / 0.8)", "oklch(0.8 0.15 80 / 0.5)"],
          } : {}}
          transition={{ duration: 1.2, repeat: Infinity }}
        >
          <Dices className="w-7 h-7 text-tier-gold" />
        </motion.div>
        <h3 className="font-display text-xl font-bold tracking-tight mb-0.5">
          {allDone ? "FATE HAS SPOKEN" : "ROLLING FATE…"}
        </h3>
        <p className="text-[10px] text-muted-foreground tracking-widest">
          {allDone ? `vs ${opponentName}` : "YOUR BUILD IS BEING DETERMINED"}
        </p>
      </div>

      {/* 2-column stat grid — each cell cycles then locks with a quality pop */}
      <div className="grid grid-cols-2 gap-2 mb-4 text-left">
        {REVEAL_DEFS.map((def, i) => {
          const isLocked = i < lockedCount;
          const justLocked = i === lockedCount - 1;
          const quality = def.hasQuality
            ? scoreToQuality(def.qualityScore(stats))
            : "standard";
          const qs = QUALITY_STYLE[quality];

          return (
            <motion.div
              key={def.key}
              className={`border p-3 transition-colors duration-300 ${
                isLocked ? `${qs.border} ${qs.bg}` : "border-border/30 bg-secondary/10"
              }`}
              animate={justLocked ? { scale: [1, 1.07, 1] } : {}}
              transition={{ duration: 0.35 }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[9px] font-bold tracking-widest text-muted-foreground">{def.label}</span>
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
              <div className={`text-2xl font-bold font-display tabular-nums ${
                isLocked ? qs.value : "text-foreground/50"
              }`}>
                {isLocked ? def.lockText(stats) : cycleNums[i]}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Overall run rating + CTA — appears after all stats are locked */}
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

// ─── Main Battle Engine ──────────────────────────────────────────────
function BattleArena() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [archetype, setArchetype] = useState<ArchetypeId>("speedster");
  const [opponentArchetype, setOpponentArchetype] = useState<ArchetypeId>("tank");
  const [player, setPlayer] = useState<Fighter>({ name: "You", hp: 100, maxHp: 100, focus: 20, maxFocus: 100, icon: User });
  const [opponent, setOpponent] = useState<Fighter>({ name: "AI Nemesis", hp: 100, maxHp: 100, focus: 20, maxFocus: 100, icon: Bot });
  const [momentum, setMomentum] = useState(0);
  const [opponentMomentum, setOpponentMomentum] = useState(0);
  const [currentAction, setCurrentAction] = useState<Action | null>(null);
  const [question, setQuestion] = useState<MathQuestion | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [maxTime, setMaxTime] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showPlayerHit, setShowPlayerHit] = useState(false);
  const [showOpponentHit, setShowOpponentHit] = useState(false);
  const [showPlayerHeal, setShowPlayerHeal] = useState(false);
  const [totalScore, setTotalScore] = useState(0);
  const [records, setRecords] = useState<QuestionRecord[]>([]);
  const [longestStreak, setLongestStreak] = useState(0);
  const [fastestAnswer, setFastestAnswer] = useState(Infinity);
  const [battleStats, setBattleStats] = useState<BattleStats | null>(null);
  const [gamblerStats, setGamblerStats] = useState<GamblerRoll | null>(null);
  const [wildEvent, setWildEvent] = useState<{ type: WildEventType; sub: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const battleMemoryRef = useRef<BattleMemory | null>(null);
  const [playerXp, setPlayerXp] = useState<number>(0);

  // Issue 1: ref-based log pipeline — prevents React batching from swallowing
  // multiple synchronous addLog calls and eliminates nested-setState side-effects.
  const logCounterRef  = useRef(0);
  const pendingLogsRef = useRef<LogEntry[]>([]);

  // Issue 1: snapshot refs so aiTurn/ghostTurn can read current HP without
  // calling setState inside another setState's updater function.
  const playerRef   = useRef(player);
  const opponentRef = useRef(opponent);

  // Issue 2: incoming chat items populated by the PvP channel subscription.
  const [incomingChats, setIncomingChats]   = useState<ChatItem[]>([]);
  const chatCounterRef                       = useRef(0);
  const chatMutedRef                         = useRef(false);

  // PvP / matchmaking state
  const [opponentType, setOpponentType]     = useState<OpponentType>("bot");
  const [matchStatus, setMatchStatus]       = useState("Finding opponent…");
  const [matchTier, setMatchTier]           = useState<OpponentType>("live");
  const [pvpBattleId, setPvpBattleId]       = useState<string | null>(null);
  const [playerRating, setPlayerRating]     = useState(1000);
  const [playerUsername, setPlayerUsername] = useState<string | null>(null);
  const [opponentRating, setOpponentRating] = useState(1000);
  const [ratingChange, setRatingChange]     = useState<number | null>(null);
  // Live PvP turn-based lock: while true the local player has already played
  // this round and must wait for the opponent's broadcast before acting again.
  const [liveAwaitingOpponent, setLiveAwaitingOpponent] = useState(false);

  // Refs for async-safe access inside callbacks
  const pvpChannelRef     = useRef<any>(null);
  const ghostSessionRef   = useRef<GhostSession | null>(null);
  const ghostTurnIndexRef = useRef(0);
  const playerRatingRef   = useRef(1000);
  const opponentRatingRef = useRef(1000);
  const opponentTypeRef   = useRef<OpponentType>("bot");
  const liveAwaitingRef   = useRef(false);
  // Idempotency guard so finishBattle runs exactly once per battle, even if
  // both the local HP-zero check and the opponent's broadcast battle_end
  // arrive. Without this, updateRating() runs twice and W/L double-counts.
  const battleFinishedRef = useRef(false);

  // Fetch player profile (XP + rating + username)
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [profileRes, ratingData] = await Promise.all([
        supabase.from("user_profiles").select("xp, username").eq("user_id", user.id).maybeSingle(),
        fetchPlayerRating(),
      ]);
      setPlayerXp((profileRes.data as any)?.xp ?? 0);
      setPlayerUsername((profileRes.data as any)?.username ?? null);
      setPlayerRating(ratingData.rating);
      playerRatingRef.current = ratingData.rating;
    })();
  }, []);

  // Live PvP: subscribe to Realtime channel when a live battle is active
  useEffect(() => {
    if (!pvpBattleId || opponentType !== "live") return;

    const channel = supabase.channel(`pvp-battle:${pvpBattleId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on("broadcast", { event: "damage" }, ({ payload }) => {
        const dmg = payload.damage as number;
        setPlayer(prev => ({ ...prev, hp: Math.max(0, prev.hp - dmg) }));
        setShowPlayerHit(true);
        addLog({ actor: "opponent", actionType: "attack", result: `⚔️ Opponent: ${dmg} DMG!`, value: dmg });
        setTimeout(() => setShowPlayerHit(false), 600);
      })
      .on("broadcast", { event: "heal" }, ({ payload }) => {
        setOpponent(prev => ({ ...prev, hp: Math.min(prev.maxHp, prev.hp + (payload.amount as number)) }));
      })
      .on("broadcast", { event: "self_heal" }, ({ payload }) => {
        // Opponent healed themselves — mirror their HP gain on our screen.
        setOpponent(prev => ({ ...prev, hp: Math.min(prev.maxHp, prev.hp + (payload.amount as number)) }));
        addLog({ actor: "opponent", actionType: "heal", result: `🛡️ Opponent healed +${payload.amount} HP.`, value: payload.amount as number });
      })
      .on("broadcast", { event: "turn_end" }, () => {
        // Opponent finished their action — unlock our turn.
        liveAwaitingRef.current = false;
        setLiveAwaitingOpponent(false);
      })
      .on("broadcast", { event: "battle_end" }, ({ payload }) => {
        const weWon = payload.winner_id !== payload.sender_id;
        finishBattle(weWon);
      })
      // Issue 2: receive opponent chat / emoji reactions
      .on("broadcast", { event: "chat" }, ({ payload }) => {
        if (chatMutedRef.current) return;
        setIncomingChats(prev => [...prev, {
          id: ++chatCounterRef.current,
          text:        payload.text as string,
          fromPlayer:  false,
          senderName:  opponentRef.current.name,
          ts:          Date.now(),
        }]);
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
  useEffect(() => { playerRef.current   = player;   }, [player]);
  useEffect(() => { opponentRef.current = opponent; }, [opponent]);

  const getArch = useCallback((id: ArchetypeId): Archetype => {
    const base = ARCHETYPES[id];
    if (id === "gambler" && gamblerStats) return { ...base, ...gamblerStats };
    return base;
  }, [gamblerStats]);

  const comboThreshold = archetype === "fulcrum" ? 2 : 3;

  /**
   * Issue 1 — single-pipeline addLog.
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
      setLogs(prev => {
        const existingIds = new Set(prev.map(e => e.id));
        return [...prev, ...batch.filter(e => !existingIds.has(e.id))];
      });
    });
  }, []);

  useEffect(() => {
    if (phase === "question" && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) { handleAnswer(false, maxTime); return 0; }
          return prev - 1;
        });
      }, 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }
  }, [phase, question]);

  const handleAnswer = useCallback((correct: boolean, timeSpent: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!currentAction || !question) return;

    if (battleMemoryRef.current) {
      updateBattleMemoryPlayerTurn(battleMemoryRef.current, currentAction, correct);
    }

    const record: QuestionRecord = { question, correct, timeSpent, action: currentAction };
    setRecords(prev => [...prev, record]);
    // Feed Luna's adaptive context (timeSpent is in seconds, recordAnswer expects ms).
    void import("@/lib/luna-context").then(({ recordAnswer, updateLunaContext }) => {
      recordAnswer(correct, timeSpent * 1000);
      updateLunaContext({ lessonTitle: question.topic, difficulty: question.difficulty });
    });

    if (correct && timeSpent < fastestAnswer) setFastestAnswer(timeSpent);

    const arch = getArch(archetype);
    const step = getEffectiveMultiplierStep(arch, records.length);
    const currentStreakMult = streakToMultiplier(momentum, step);

    setPhase("animate");

    if (correct) {
      const newMom = momentum + 1;
      setMomentum(newMom);
      if (newMom > longestStreak) setLongestStreak(newMom);
      sfxStreak(newMom);

      // Announce combo activations in the log with the actual live multiplier
      if (newMom > 0 && newMom % comboThreshold === 0) {
        const newMult = streakToMultiplier(newMom, step);
        addLog({ actor: "system", actionType: "combo", result: `🔥 COMBO x${Math.floor(newMom / comboThreshold)} — ${newMult.toFixed(2)}× damage!` });
        sfxCombo();
      }

      if (currentAction === "defend") {
        const gain = FOCUS_GAIN.defend;
        if (arch.healAmount !== null) {
          const heal = Math.min(arch.healAmount, player.maxHp - player.hp);
          setPlayer(prev => ({ ...prev, hp: Math.min(prev.maxHp, prev.hp + arch.healAmount!), focus: Math.min(prev.maxFocus, prev.focus + gain) }));
          setShowPlayerHeal(true);
          addLog({ actor: "player", actionType: "heal", result: `Defend: +${heal} HP, +${gain} Focus.`, value: heal });
          if (heal > 0 && opponentTypeRef.current === "live" && pvpChannelRef.current) {
            pvpChannelRef.current.send({ type: "broadcast", event: "self_heal", payload: { amount: heal } });
          }
        } else {
          setPlayer(prev => ({ ...prev, focus: Math.min(prev.maxFocus, prev.focus + gain) }));
          addLog({ actor: "player", actionType: "heal", result: `Defend: +${gain} Focus (Tank cannot heal).`, value: gain });
        }
      } else if (currentAction === "wild") {
        // Three distinct event types — each with unique visual/audio identity
        sfxWild();
        const roll = Math.random();
        if (roll < 0.333) {
          const d = Math.floor(Math.random() * 30) + 10;
          setOpponent(prev => ({ ...prev, hp: Math.max(0, prev.hp - d) }));
          setShowOpponentHit(true);
          setWildEvent({ type: "chaos", sub: `${d} DMG` });
          addLog({ actor: "player", actionType: "wild", result: `CHAOS STRIKE: ${d} DMG!`, value: d });
        } else if (roll < 0.667) {
          setPlayer(prev => ({ ...prev, hp: Math.min(prev.maxHp, prev.hp + 20) }));
          setShowPlayerHeal(true);
          setWildEvent({ type: "mend", sub: "+20 HP" });
          addLog({ actor: "player", actionType: "wild", result: `WILD MEND: +20 HP!`, value: 20 });
        } else {
          const d = 20;
          setOpponent(prev => ({ ...prev, hp: Math.max(0, prev.hp - d) }));
          setShowOpponentHit(true);
          setPlayer(prev => ({ ...prev, focus: Math.min(prev.maxFocus, prev.focus + 20) }));
          setWildEvent({ type: "surge", sub: `${d} DMG + Focus` });
          addLog({ actor: "player", actionType: "wild", result: `ARCANE SURGE: ${d} DMG + Focus!`, value: d });
        }
        setTimeout(() => setWildEvent(null), 1400);
      } else {
        const dmg = Math.floor(
          getEffectiveDamage(arch, { action: currentAction, timeSpent, maxTime, recordCount: records.length })
          * currentStreakMult
        );
        setOpponent(prev => ({ ...prev, hp: Math.max(0, prev.hp - dmg) }));
        const focusGain = FOCUS_GAIN[currentAction];
        if (focusGain > 0) {
          setPlayer(prev => ({ ...prev, focus: Math.min(prev.maxFocus, prev.focus + focusGain) }));
        }
        setShowOpponentHit(true);
        const focusNote = focusGain > 0 ? ` +${focusGain} Focus.` : "";
        addLog({ actor: "player", actionType: currentAction as LogActionType, result: `${ACTIONS[currentAction].label}: ${dmg} DMG!${focusNote}${currentStreakMult > 1.1 ? ` ${currentStreakMult.toFixed(2)}x STREAK!` : ""}`, value: dmg });
        // Broadcast damage to live opponent via Realtime
        if (opponentTypeRef.current === "live" && pvpChannelRef.current) {
          pvpChannelRef.current.send({ type: "broadcast", event: "damage", payload: { damage: dmg, action: currentAction } });
        }
      }
      setTotalScore(prev => prev + (currentAction === "charge" ? 150 : currentAction === "attack" ? 100 : 75) * currentStreakMult);
    } else {
      setMomentum(0);
      sfxBreak();
      let counterDmg = Math.floor(Math.random() * 10) + 8;
      counterDmg = Math.floor(counterDmg * hpToSelfDmgMult(arch.maxHp));
      // Healer passive: recover some HP on getting hit
      if (archetype === "healer") {
        const healAmt = Math.floor(counterDmg * 0.3);
        setPlayer(prev => ({ ...prev, hp: Math.min(prev.maxHp, prev.hp + healAmt) }));
      }
      setPlayer(prev => ({ ...prev, hp: Math.max(0, prev.hp - counterDmg) }));
      setShowPlayerHit(true);
      addLog({ actor: "player", actionType: "miss", result: `${timeSpent >= maxTime ? "Time's up!" : "Wrong!"} -${counterDmg} HP. Streak reset.${arch.maxHp >= 160 ? " Shield reduced!" : ""}`, value: counterDmg });
    }

    setTimeout(() => {
      setShowPlayerHit(false);
      setShowOpponentHit(false);
      setShowPlayerHeal(false);

      const curOpp    = opponentRef.current;
      const curPlayer = playerRef.current;

      if (curOpp.hp <= 0) {
        finishBattle(true);
      } else if (curPlayer.hp <= 0) {
        finishBattle(false);
      } else if (opponentTypeRef.current === "live") {
        // Round-based PvP: lock our turn and wait for the opponent's
        // turn_end broadcast before letting us act again.
        liveAwaitingRef.current = true;
        setLiveAwaitingOpponent(true);
        if (pvpChannelRef.current) {
          pvpChannelRef.current.send({ type: "broadcast", event: "turn_end", payload: {} });
        }
        setPhase("select");
      } else if (opponentTypeRef.current === "ghost") {
        ghostTurn();
      } else {
        aiTurn();
      }
    }, 800);
  }, [currentAction, momentum, player, totalScore, timeLeft, maxTime, question, archetype, longestStreak, fastestAnswer]);

  const finishBattle = useCallback((won: boolean) => {
    if (battleFinishedRef.current) return;
    battleFinishedRef.current = true;
    // Broadcast result to live opponent before tearing down
    if (opponentTypeRef.current === "live" && pvpChannelRef.current) {
      pvpChannelRef.current.send({
        type: "broadcast", event: "battle_end",
        payload: { winner_id: won ? "me" : "them", sender_id: "me" },
      });
    }

    // Mirror the server-side formula in award_battle_xp so the number we
    // animate up to in the report matches what actually lands on the profile:
    //   xp = min(1000, correct*15 + (won ? 50 : 0))
    const totalQuestions = records.length + 1; // +1 for the final answer
    const correctAnswers = records.filter(r => r.correct).length + (won ? 1 : 0);
    const xp = Math.min(1000, correctAnswers * 15 + (won ? 50 : 0));
    setBattleStats({
      totalQuestions,
      correctAnswers,
      longestStreak,
      fastestAnswer,
      records: [...records],
      archetype,
      won,
      score: Math.floor(totalScore),
      xp,
    });
    setPhase("result");

    // Persist battle to learning_history + increment daily challenge on win
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("learning_history").insert({
        user_id: user.id,
        session_type: "battle",
        was_correct: won,
        topic: ARCHETYPES[archetype].name,
        luna_summary: `${won ? "Victory" : "Defeat"} as ${ARCHETYPES[archetype].name} · score ${Math.floor(totalScore)} · streak ${longestStreak}`,
      });
      if (won) {
        const today = new Date().toISOString().slice(0, 10);
        const challenge = getTodayChallenge();
        const { data: existing } = await supabase
          .from("daily_challenge_progress")
          .select("id, wins, bonus_claimed")
          .eq("user_id", user.id)
          .eq("challenge_date", today)
          .maybeSingle();
        if (existing) {
          const newWins = (existing.wins ?? 0) + 1;
          await supabase
            .from("daily_challenge_progress")
            .update({ wins: newWins })
            .eq("id", existing.id);
        } else {
          await supabase.from("daily_challenge_progress").insert({
            user_id: user.id,
            challenge_date: today,
            wins: 1,
            bonus_claimed: false,
          });
        }
        window.dispatchEvent(new Event("daily-challenge-updated"));
      }

      // Record session as ghost replay data for future opponents
      void recordBattleSession({
        archetype,
        won,
        rating: playerRatingRef.current,
        records,
        bestStreak: longestStreak,
      });

      // Update ELO rating for live and ghost matches (never bots)
      if (opponentTypeRef.current !== "bot") {
        const newRating = await updateRating(opponentRatingRef.current, won);
        setRatingChange(newRating - playerRatingRef.current);
        setPlayerRating(newRating);
        playerRatingRef.current = newRating;
      }
    })();
  }, [totalScore, records, longestStreak, fastestAnswer, archetype]);

  const aiTurn = useCallback(() => {
    const oppArch    = getArch(opponentArchetype);
    const personality = AI_PERSONALITIES[opponentArchetype];
    const memory     = battleMemoryRef.current;

    setTimeout(() => {
      const prevOpp    = opponentRef.current;
      const prevPlayer = playerRef.current;
      const oppHpPct    = prevOpp.hp    / prevOpp.maxHp;
      const playerHpPct = prevPlayer.hp / prevPlayer.maxHp;
      const mem         = memory ?? createBattleMemory();

      const choice = pickAiAction(
        mem,
        personality,
        { hp: prevOpp.hp, maxHp: prevOpp.maxHp, focus: prevOpp.focus, maxFocus: prevOpp.maxFocus, canHeal: oppArch.healAmount !== null },
        { hp: prevPlayer.hp, maxHp: prevPlayer.maxHp, momentum: opponentMomentum },
      );

      const success = Math.random() < computeAiAccuracy(oppArch, personality, mem, oppHpPct, playerHpPct);

      // Narrative pressure line — appears at meaningful moments only
      const hasData       = mem.playerTurnCount >= 4;
      const strongPattern = mem.patternConfidence >= personality.counterPlaySensitivity;
      const pressureLine  = getPressureLogLine(mem, personality, prevOpp.name, oppHpPct, hasData && strongPattern);
      if (pressureLine) addLog({ actor: "system", actionType: "info", result: pressureLine });

      let newPlayerHp = prevPlayer.hp;
      let newOppHp    = prevOpp.hp;
      let newOppFocus = prevOpp.focus;
      let nextOppMom  = opponentMomentum;

      if (success) {
        nextOppMom = opponentMomentum + 1;
        // Fix: pass turnNumber so Accelerator's multiplier step actually ramps
        const oppStep = getEffectiveMultiplierStep(oppArch, mem.turnNumber);
        const sMult   = streakToMultiplier(nextOppMom, oppStep);

        if (choice === "defend") {
          newOppFocus = Math.min(prevOpp.maxFocus, prevOpp.focus + FOCUS_GAIN.defend);
          if (oppArch.healAmount !== null) {
            newOppHp = Math.min(prevOpp.maxHp, prevOpp.hp + oppArch.healAmount);
            addLog({ actor: "opponent", actionType: "heal", result: `${prevOpp.name} heals: +${oppArch.healAmount} HP, +${FOCUS_GAIN.defend} Focus.`, value: oppArch.healAmount });
          } else {
            addLog({ actor: "opponent", actionType: "heal", result: `${prevOpp.name} defends: +${FOCUS_GAIN.defend} Focus.`, value: FOCUS_GAIN.defend });
          }
        } else if (choice === "wild") {
          newOppFocus = Math.max(0, prevOpp.focus - 15);
          const roll = Math.random();
          if (roll < 0.34) {
            const d = Math.floor(Math.random() * 30) + 10;
            newPlayerHp = Math.max(0, prevPlayer.hp - d);
            setShowPlayerHit(true);
            addLog({ actor: "opponent", actionType: "wild", result: `${prevOpp.name} Wild: ${d} chaos DMG!`, value: d });
          } else if (roll < 0.67) {
            newOppHp = Math.min(prevOpp.maxHp, prevOpp.hp + 20);
            addLog({ actor: "opponent", actionType: "wild", result: `${prevOpp.name} Wild: +20 HP!`, value: 20 });
          } else {
            const d = 20;
            newPlayerHp = Math.max(0, prevPlayer.hp - d);
            setShowPlayerHit(true);
            addLog({ actor: "opponent", actionType: "wild", result: `${prevOpp.name} Wild: ${d} DMG.`, value: d });
          }
        } else {
          const dmg = Math.floor(getEffectiveDamage(oppArch, { action: choice, recordCount: 0 }) * sMult);
          newPlayerHp = Math.max(0, prevPlayer.hp - dmg);
          const cost = ACTIONS[choice].focusCost;
          if (cost > 0) newOppFocus = Math.max(0, prevOpp.focus - cost);
          const gain = FOCUS_GAIN[choice];
          if (gain > 0) newOppFocus = Math.min(prevOpp.maxFocus, newOppFocus + gain);
          setShowPlayerHit(true);
          const streakNote = sMult > 1.1 ? ` ${sMult.toFixed(2)}x STREAK` : "";
          addLog({ actor: "opponent", actionType: choice as LogActionType, result: `${prevOpp.name} ${ACTIONS[choice].label}: ${dmg} DMG.${streakNote}`, value: dmg });
        }
      } else {
        nextOppMom = 0;
        const flub = Math.floor((Math.floor(Math.random() * 6) + 4) * hpToSelfDmgMult(oppArch.maxHp));
        newOppHp = Math.max(0, prevOpp.hp - flub);
        addLog({ actor: "opponent", actionType: "miss", result: `${prevOpp.name} fluffs ${ACTIONS[choice].label}: -${flub} HP.`, value: flub });
      }

      if (memory) updateBattleMemoryAiTurn(memory, success);
      setOpponentMomentum(nextOppMom);
      setPlayer(p => ({ ...p, hp: newPlayerHp }));
      setOpponent(o => ({ ...o, hp: newOppHp, focus: newOppFocus }));

      setTimeout(() => {
        setShowPlayerHit(false);
        if (newPlayerHp <= 0) { finishBattle(false); }
        else if (newOppHp <= 0) { finishBattle(true); }
        else { setPhase("select"); }
      }, 600);
    }, 400);
  }, [addLog, finishBattle, opponentArchetype, opponentMomentum, getArch]);

  /**
   * Ghost turn: replays actions from a real player's recorded session.
   * Accuracy and timing come from the stored question_records — no procedural AI.
   */
  const ghostTurn = useCallback(() => {
    const ghost = ghostSessionRef.current;
    if (!ghost || ghost.questionRecords.length === 0) {
      // Degenerate case: fall back to AI if ghost data is empty
      aiTurn();
      return;
    }

    const idx    = ghostTurnIndexRef.current % ghost.questionRecords.length;
    const record = ghost.questionRecords[idx];
    ghostTurnIndexRef.current += 1;

    const oppArch = getArch(opponentArchetype);
    const delay   = 300 + Math.min(record.timeSpent * 400, 1200); // realistic pacing

    setTimeout(() => {
      const prevOpp    = opponentRef.current;
      const prevPlayer = playerRef.current;
      let newPlayerHp = prevPlayer.hp;
      let newOppHp    = prevOpp.hp;

      if (record.correct) {
        const dmg = Math.floor(
          getEffectiveDamage(oppArch, {
            action: record.action as Action,
            recordCount: ghostTurnIndexRef.current,
          })
        );
        newPlayerHp = Math.max(0, prevPlayer.hp - dmg);
        setShowPlayerHit(true);
        addLog({ actor: "opponent", actionType: "ghost", result: `${prevOpp.name}: ${dmg} DMG (ghost replay)`, value: dmg });
      } else {
        const flub = Math.floor(Math.random() * 6) + 3;
        newOppHp = Math.max(0, prevOpp.hp - flub);
        addLog({ actor: "opponent", actionType: "ghost", result: `${prevOpp.name} missed (-${flub} self)`, value: flub });
      }

      setPlayer(p => ({ ...p, hp: newPlayerHp }));
      setOpponent(o => ({ ...o, hp: newOppHp }));

      setTimeout(() => {
        setShowPlayerHit(false);
        if (newPlayerHp <= 0) finishBattle(false);
        else if (newOppHp <= 0) finishBattle(true);
        else setPhase("select");
      }, 600);
    }, delay);
  }, [addLog, aiTurn, finishBattle, opponentArchetype, getArch]);

  const selectAction = (action: Action) => {
    // Hard block in live PvP while it's the opponent's round.
    if (opponentTypeRef.current === "live" && liveAwaitingRef.current) {
      addLog({ actor: "system", actionType: "info", result: `⏳ Waiting for opponent's move…` });
      return;
    }
    const cost = ACTIONS[action].focusCost;
    if (cost > 0 && player.focus < cost) { addLog({ actor: "system", actionType: "info", result: `⚠️ Need ${cost} Focus!` }); return; }
    setCurrentAction(action);
    if (cost > 0) setPlayer(prev => ({ ...prev, focus: Math.max(0, prev.focus - cost) }));
    addLog({ actor: "player", actionType: "info", result: `You ${ACTIONS[action].label.toLowerCase()}…` });

    const arch = getArch(archetype);
    const level = getActionDifficultyLevel(arch, action);
    const category = levelToCategory(level);
    const q = generateQuestion(category);
    setQuestion(q);
    const t = Math.max(4, Math.round(TIMER_DURATIONS[category] * arch.timeMultiplier));
    setMaxTime(t);
    setTimeLeft(t);
    setPhase("question");
  };

  const [ecliptar, setEcliptar] = useState<Ecliptar | null>(null);

  const startBattle = (selection?: ClassSelection) => {
    const cls  = selection?.archetype || archetype;
    const eclip = selection?.ecliptar ?? ecliptar;
    if (selection?.archetype) setArchetype(selection.archetype);
    if (selection?.ecliptar) setEcliptar(selection.ecliptar);

    const rolledGambler = cls === "gambler" ? rollGamblerStats() : null;
    setGamblerStats(rolledGambler);
    setRatingChange(null);
    setPhase("searching");

    // Reset ghost state
    ghostSessionRef.current   = null;
    ghostTurnIndexRef.current = 0;
    pvpChannelRef.current     = null;
    setPvpBattleId(null);
    battleFinishedRef.current = false;

    // Run full Tier 1→2→3 matchmaking asynchronously
    void (async () => {
      const match: MatchResult = await findMatch(
        cls,
        playerRatingRef.current,
        playerUsername,
        (msg, tier) => { setMatchStatus(msg); setMatchTier(tier); },
      );

      // Resolve opponent from match result
      let oppArchetype: ArchetypeId;
      let oppName: string;

      if (match.opponentArchetype) {
        oppArchetype = match.opponentArchetype;
        oppName = match.opponentName;
      } else {
        // Bot: pick a random ecliptar so the opponent has a real archetype identity
        const oppEclip = pickOpponent(cls);
        oppArchetype = oppEclip.archetype;
        oppName      = oppEclip.name;
      }
      // Always use the archetype's icon so ghost / bot / live opponents
      // visually reflect their build instead of a generic robot.
      const oppIcon = ARCHETYPES[oppArchetype].icon;

      // Ghost: prime the replay buffer
      if (match.type === "ghost" && match.ghostSession) {
        ghostSessionRef.current   = match.ghostSession;
        ghostTurnIndexRef.current = 0;
      }

      // Live: store battle ID so the Realtime useEffect subscribes
      if (match.type === "live" && match.pvpBattleId) {
        setPvpBattleId(match.pvpBattleId);
      }

      // Round-based PvP: challenger acts first; the opponent waits.
      if (match.type === "live") {
        const iStart = match.iAmChallenger === true;
        liveAwaitingRef.current = !iStart;
        setLiveAwaitingOpponent(!iStart);
      } else {
        liveAwaitingRef.current = false;
        setLiveAwaitingOpponent(false);
      }

      // Sync refs for async-safe use inside callbacks
      setOpponentType(match.type);
      opponentTypeRef.current    = match.type;
      setOpponentRating(match.opponentRating);
      opponentRatingRef.current  = match.opponentRating;

      const baseArch      = ARCHETYPES[cls];
      const effectiveArch = rolledGambler ? { ...baseArch, ...rolledGambler } : baseArch;
      const playerName    = eclip?.name ?? "You";
      const playerIcon    = eclip?.icon ?? User;
      const oppArch       = ARCHETYPES[oppArchetype];

      setPlayer({
        name: playerName, hp: effectiveArch.maxHp, maxHp: effectiveArch.maxHp,
        focus: baseArch.startFocus, maxFocus: baseArch.focusPool, icon: playerIcon,
      });
      setOpponent({
        name: oppName, hp: oppArch.maxHp, maxHp: oppArch.maxHp,
        focus: oppArch.startFocus, maxFocus: oppArch.focusPool, icon: oppIcon,
      });
      setOpponentArchetype(oppArchetype);
      battleMemoryRef.current = createBattleMemory();
      setMomentum(0); setOpponentMomentum(0); setLogs([]);
      setTotalScore(0); setRecords([]); setLongestStreak(0);
      setFastestAnswer(Infinity); setBattleStats(null);

      if (rolledGambler) {
        setPhase("gamblerReveal");
      } else {
        setPhase("select");
        const typeTag = match.type === "live" ? "⚡ LIVE" : match.type === "ghost" ? "👻 GHOST" : "🤖 BOT";
        addLog({ actor: "system", actionType: "info", result: `⚔️ ${playerName} (${baseArch.name}) vs ${oppName} (${oppArch.name}) · ${typeTag}` });
      }
    })();
  };

  const reset = () => {
    setPhase("idle");
    setBattleStats(null);
    setPvpBattleId(null);
    setOpponentType("bot");
    setRatingChange(null);
    ghostSessionRef.current   = null;
    pvpChannelRef.current     = null;
    battleFinishedRef.current = false;
    liveAwaitingRef.current   = false;
    setLiveAwaitingOpponent(false);
  };

  // Direct PvP challenge: bypass matchmaking and drop straight into a live
  // battle using a pre-created pvp_battles row. Triggered by ChallengeInbox
  // and the challenger-side realtime "accepted" listener.
  const startDirectBattle = useCallback((opts: {
    battleId: string;
    myArchetype: ArchetypeId;
    opponentArchetype: ArchetypeId;
    opponentName: string;
    opponentRating?: number;
    iAmChallenger?: boolean;
  }) => {
    setArchetype(opts.myArchetype);
    setRatingChange(null);
    battleFinishedRef.current = false;
    ghostSessionRef.current   = null;
    ghostTurnIndexRef.current = 0;
    pvpChannelRef.current     = null;
    const rolledGambler = opts.myArchetype === "gambler" ? rollGamblerStats() : null;
    setGamblerStats(rolledGambler);

    setOpponentType("live");
    opponentTypeRef.current   = "live";
    setOpponentRating(opts.opponentRating ?? 1000);
    opponentRatingRef.current = opts.opponentRating ?? 1000;
    setPvpBattleId(opts.battleId);

    // Direct challenges: challenger acts first, defender waits.
    const iStart = opts.iAmChallenger === true;
    liveAwaitingRef.current = !iStart;
    setLiveAwaitingOpponent(!iStart);

    const baseArch = ARCHETYPES[opts.myArchetype];
    const oppArch  = ARCHETYPES[opts.opponentArchetype];
    const playerName = ecliptar?.name ?? "You";
    const playerIcon = ecliptar?.icon ?? User;
    const effectiveArch = rolledGambler ? { ...baseArch, ...rolledGambler } : baseArch;

    setPlayer({
      name: playerName, hp: effectiveArch.maxHp, maxHp: effectiveArch.maxHp,
      focus: baseArch.startFocus, maxFocus: baseArch.focusPool, icon: playerIcon,
    });
    setOpponent({
      name: opts.opponentName, hp: oppArch.maxHp, maxHp: oppArch.maxHp,
      focus: oppArch.startFocus, maxFocus: oppArch.focusPool, icon: oppArch.icon,
    });
    setOpponentArchetype(opts.opponentArchetype);
    battleMemoryRef.current = createBattleMemory();
    setMomentum(0); setOpponentMomentum(0); setLogs([]);
    setTotalScore(0); setRecords([]); setLongestStreak(0);
    setFastestAnswer(Infinity); setBattleStats(null);
    if (rolledGambler) {
      setPhase("gamblerReveal");
    } else {
      setPhase("select");
      addLog({
        actor: "system", actionType: "info",
        result: `⚔️ Direct challenge — ${playerName} (${baseArch.name}) vs ${opts.opponentName} (${oppArch.name}) · ⚡ LIVE`,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ecliptar]);

  // Listen for direct-challenge events fired by ChallengeInbox / accepted
  // notifications elsewhere on the page.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        battleId: string;
        myArchetype: ArchetypeId;
        opponentArchetype: ArchetypeId;
        opponentName: string;
        opponentRating?: number;
        iAmChallenger?: boolean;
      } | undefined;
      if (!detail) return;
      startDirectBattle(detail);
    };
    window.addEventListener("eclipta:direct-battle", handler);
    return () => window.removeEventListener("eclipta:direct-battle", handler);
  }, [startDirectBattle]);

  // ── Idle ──
  if (phase === "idle") {
    return (
      <motion.div className="glass-panel p-10 text-center" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
        <div className="w-20 h-20 mx-auto mb-6 bg-neon-pink/10 border border-neon-pink/30 flex items-center justify-center">
          <Swords className="w-10 h-10 text-neon-pink" />
        </div>
        <h3 className="text-2xl font-bold font-display mb-2">Cyber-Math Duel</h3>
        <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
          Choose your archetype. Solve equations. Destroy your opponent.
        </p>
        <motion.button
          onClick={() => setPhase("classSelect")}
          className="px-8 py-3 bg-neon-pink text-primary-foreground font-bold text-sm tracking-widest hover:opacity-90 transition-opacity"
          whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
        >
          <Zap className="w-4 h-4 inline mr-2" />
          CHOOSE CLASS
        </motion.button>
      </motion.div>
    );
  }

  // ── Class Select ──
  if (phase === "classSelect") {
    return <ClassSelectDialog onSelect={(sel) => startBattle(sel)} />;
  }

  // ── Searching ──
  if (phase === "searching") {
    const arch = ARCHETYPES[archetype];
    const tierConfig = {
      live:  { label: "LIVE PvP",    icon: Users,  color: "text-neon-cyan",    glow: "border-neon-cyan/60"    },
      ghost: { label: "GHOST",       icon: Ghost,  color: "text-neon-purple",  glow: "border-neon-purple/60"  },
      bot:   { label: "AI BOT",      icon: Bot,    color: "text-muted-foreground", glow: "border-border"      },
    } as const;
    return (
      <motion.div className="glass-panel p-10 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <motion.div
          className="w-20 h-20 mx-auto mb-6 border-2 flex items-center justify-center"
          animate={{
            borderColor: ["oklch(0.6 0.24 350)", "oklch(0.55 0.25 290)", "oklch(0.75 0.15 180)", "oklch(0.6 0.24 350)"],
            rotate: 360,
          }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
          <Target className="w-8 h-8 text-neon-pink" />
        </motion.div>

        <h3 className="text-xl font-bold font-display mb-1">Finding an opponent…</h3>
        <p className={`inline-flex items-center gap-1 text-xs font-bold ${arch.color} mb-6`}>
          <arch.icon className="w-3.5 h-3.5" /> {arch.name}
        </p>

        {/* Tier priority indicator */}
        <div className="flex items-center justify-center gap-2 mb-4">
          {(["live", "ghost", "bot"] as const).map((tier, i) => {
            const cfg     = tierConfig[tier];
            const Icon    = cfg.icon;
            const active  = matchTier === tier;
            const passed  = (["live", "ghost", "bot"] as const).indexOf(matchTier) > i;
            return (
              <div key={tier} className="flex items-center gap-2">
                <motion.div
                  className={`flex items-center gap-1 px-2 py-1 border text-[10px] font-bold tracking-widest transition-all ${
                    active  ? `${cfg.color} ${cfg.glow} bg-white/5` :
                    passed  ? "text-emerald-500 border-emerald-500/40 bg-emerald-500/5" :
                              "text-muted-foreground/30 border-border/30"
                  }`}
                  animate={active ? { opacity: [0.7, 1, 0.7] } : {}}
                  transition={{ repeat: Infinity, duration: 1.2 }}
                >
                  <Icon className="w-3 h-3" />
                  {cfg.label}
                </motion.div>
                {i < 2 && <span className="text-muted-foreground/30 text-xs">→</span>}
              </div>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground tabular-nums">{matchStatus}</p>
        <motion.div className="flex justify-center gap-1 mt-4" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }}>
          {[0, 1, 2].map(i => <div key={i} className="w-2 h-2 bg-neon-pink rounded-full" />)}
        </motion.div>
      </motion.div>
    );
  }

  // ── Gambler Reveal ──
  if (phase === "gamblerReveal" && gamblerStats) {
    const baseArch = ARCHETYPES[archetype];
    return (
      <GamblerRevealScreen
        stats={gamblerStats}
        opponentName={opponent.name}
        onComplete={() => {
          setPhase("select");
          addLog({ actor: "system", actionType: "info", result: `⚔️ ${player.name} (${baseArch.name}) vs ${opponent.name} (${ARCHETYPES[opponentArchetype].name})!` });
        }}
      />
    );
  }

  // ── Result ──
  if (phase === "result" && battleStats) {
    return (
      <BattleReport
        stats={battleStats}
        onRematch={() => setPhase("classSelect")}
        onContinueWithEcliptar={ecliptar ? () => startBattle({ archetype, ecliptar }) : undefined}
        onBack={reset}
        ratingChange={ratingChange}
        opponentType={opponentType}
      />
    );
  }

  // ── Battle ──
  return (
    <div className="relative">
      {/* Wild event overlay — appears on the battle field, not inside the question panel */}
      <AnimatePresence>
        {wildEvent && <WildEventOverlay event={wildEvent} />}
      </AnimatePresence>
      <div className="flex gap-4 mb-4">
        <FighterCard fighter={player} side="left" momentum={momentum} archetype={archetype} showHit={showPlayerHit} showHeal={showPlayerHeal} canAct={phase === "select"} />
        <div className="flex flex-col items-center justify-center px-2 gap-1">
          <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ duration: 2, repeat: Infinity }}>
            <Swords className="w-6 h-6 text-neon-pink" />
          </motion.div>
          <span className="text-[10px] font-bold tracking-widest text-muted-foreground">VS</span>
          {/* Opponent type badge */}
          {opponentType === "live" && (
            <motion.div
              className="flex items-center gap-0.5 px-1.5 py-0.5 border border-neon-cyan/50 bg-neon-cyan/10 text-neon-cyan"
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ repeat: Infinity, duration: 1.4 }}
            >
              <Radio className="w-2.5 h-2.5" />
              <span className="text-[8px] font-bold tracking-widest">LIVE</span>
            </motion.div>
          )}
          {opponentType === "ghost" && (
            <div className="flex items-center gap-0.5 px-1.5 py-0.5 border border-neon-purple/50 bg-neon-purple/10 text-neon-purple">
              <Ghost className="w-2.5 h-2.5" />
              <span className="text-[8px] font-bold tracking-widest">GHOST</span>
            </div>
          )}
          {opponentType === "bot" && (
            <div className="flex items-center gap-0.5 px-1.5 py-0.5 border border-border/50 text-muted-foreground/50">
              <Bot className="w-2.5 h-2.5" />
              <span className="text-[8px] font-bold tracking-widest">BOT</span>
            </div>
          )}
        </div>
        <FighterCard fighter={opponent} side="right" momentum={opponentMomentum} archetype={opponentArchetype} showHit={showOpponentHit} showHeal={false} />
      </div>

      <div className="space-y-3">
        {/* Momentum bar with near-miss telegraphing and live multiplier readout */}
        {(() => {
          // How far into the current combo cycle are we?
          // At threshold multiples (3, 6, 9…) show the bar fully filled.
          const comboProgress = momentum > 0 && momentum % comboThreshold === 0
            ? comboThreshold
            : momentum % comboThreshold;
          // One pip away from next combo activation
          const isNearMiss = momentum > 0 && momentum % comboThreshold === comboThreshold - 1;
          const comboActive = momentum >= comboThreshold;
          const arch = getArch(archetype);
          const step = getEffectiveMultiplierStep(arch, records.length);
          const activeMult = streakToMultiplier(momentum, step);

          return (
            <div className="glass-panel p-3">
              {/* Top row: label + live multiplier + COMBO badge */}
              <div className="flex items-center gap-2 mb-2">
                <motion.div
                  animate={isNearMiss ? { scale: [1, 1.25, 1] } : {}}
                  transition={{ duration: 0.55, repeat: isNearMiss ? Infinity : 0, repeatDelay: 0.35 }}
                >
                  <Flame className={`w-4 h-4 transition-colors ${
                    comboActive ? "text-neon-pink" : momentum > 0 ? "text-neon-pink/60" : "text-muted-foreground"
                  }`} />
                </motion.div>
                <span className="text-[10px] font-bold tracking-widest text-muted-foreground">MOMENTUM</span>
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
                    {activeMult.toFixed(2)}×
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

              {/* Pip bar — next empty pip pulses when one away from activation */}
              <div className="flex gap-1">
                {Array.from({ length: comboThreshold }).map((_, i) => {
                  const isFilled  = i < comboProgress;
                  // The first empty pip when one away from combo
                  const isPulse   = isNearMiss && i === comboProgress;
                  return (
                    <motion.div
                      key={i}
                      className={`h-2.5 flex-1 rounded-sm ${isFilled ? "bg-neon-pink" : "bg-secondary/40"}`}
                      animate={isPulse ? {
                        backgroundColor: [
                          "oklch(0.6 0.24 350 / 0.15)",
                          "oklch(0.6 0.24 350 / 0.60)",
                          "oklch(0.6 0.24 350 / 0.15)",
                        ],
                        boxShadow: [
                          "0 0 0px oklch(0.6 0.24 350 / 0)",
                          "0 0 7px oklch(0.6 0.24 350 / 0.55)",
                          "0 0 0px oklch(0.6 0.24 350 / 0)",
                        ],
                      } : {}}
                      transition={isPulse ? { duration: 0.75, repeat: Infinity, ease: "easeInOut" } : {}}
                    />
                  );
                })}
              </div>

              {/* Near-miss cue label — subtle, disappears once threshold is hit */}
              <AnimatePresence>
                {isNearMiss && (
                  <motion.p
                    key="near-miss"
                    className="text-[9px] font-bold text-neon-pink/60 tracking-widest text-right mt-1"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    ONE MORE →
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          );
        })()}

        {/* ── Accelerator Power-Scaling HUD ───────────────────────────────
            Only visible when playing as Accelerator. Communicates the
            core USP: sustained correct answers directly compound combat
            power. Every question answered is ammunition for the future. */}
        {archetype === "accelerator" && (() => {
          const scalePct    = Math.min(records.length / 10, 1);           // 0 → 1 over 10 questions
          const effectiveDmg  = Math.round(13 + scalePct * 14);           // 13 → 27
          const effectiveMult = Math.round((0.15 + scalePct * 0.25) * 100); // 15% → 40%

          // Stage labels communicate qualitative feel, not just a number
          const stage =
            scalePct >= 0.90 ? { label: "MAXIMUM POWER", color: "text-neon-pink",     bar: "bg-neon-pink" }
            : scalePct >= 0.60 ? { label: "SURGING",      color: "text-tier-platinum", bar: "bg-tier-platinum" }
            : scalePct >= 0.30 ? { label: "ASCENDING",    color: "text-tier-gold",     bar: "bg-tier-gold" }
            : scalePct > 0    ? { label: "AWAKENING",    color: "text-neon-cyan",     bar: "bg-neon-cyan" }
            :                   { label: "DORMANT",       color: "text-muted-foreground", bar: "bg-neon-cyan" };

          return (
            <div className="glass-panel p-3 border border-tier-platinum/30">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <FastForward className="w-3.5 h-3.5 text-tier-platinum" />
                  <span className="text-[10px] font-bold tracking-widest text-tier-platinum">POWER SCALING</span>
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
                    opacity: scalePct >= 0.90 ? [1, 0.65, 1] : 1,
                  }}
                  transition={{
                    width:   { duration: 0.7, ease: "easeOut" },
                    opacity: scalePct >= 0.90 ? { duration: 0.9, repeat: Infinity } : {},
                  }}
                />
              </div>

              {/* Live stat readout — the educational feedback loop made visible */}
              <div className="flex items-center justify-between text-[9px] font-bold tabular-nums">
                <span className="text-muted-foreground">
                  DMG{" "}
                  <span className={scalePct >= 0.60 ? "text-neon-pink" : "text-foreground"}>
                    {effectiveDmg}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  MULTI{" "}
                  <span className={scalePct >= 0.60 ? "text-neon-pink" : "text-foreground"}>
                    +{effectiveMult}%
                  </span>
                </span>
                <span className="text-muted-foreground">
                  Q{" "}
                  <span className="text-foreground">{Math.min(records.length, 10)}/10</span>
                </span>
              </div>
            </div>
          );
        })()}

        {liveAwaitingOpponent && phase === "select" && (
          <motion.div
            className="glass-panel p-3 border border-neon-cyan/40 bg-neon-cyan/5 text-center"
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
          >
            <motion.span
              className="text-[11px] font-bold tracking-widest text-neon-cyan"
              animate={{ opacity: [0.55, 1, 0.55] }}
              transition={{ duration: 1.4, repeat: Infinity }}
            >
              ⏳ WAITING FOR {opponent.name.toUpperCase()}'S MOVE…
            </motion.span>
          </motion.div>
        )}
        <div className="grid grid-cols-4 gap-2">
          {(Object.entries(ACTIONS) as [Action, ActionConfig][]).map(([key, act]) => {
            const Icon = act.icon;
            const cost = act.focusCost;
            const cannotHeal = key === "defend" && getArch(archetype).healAmount === null;
            const disabled = phase !== "select" || (cost > 0 && player.focus < cost) || cannotHeal || liveAwaitingOpponent;
            return (
              <motion.button key={key} onClick={() => selectAction(key)} disabled={disabled}
                className={`glass-panel p-5 text-center transition-colors relative ${disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-neon-purple/5 hover:border-neon-purple/30"}`}
                whileHover={!disabled ? { scale: 1.03, y: -2 } : {}} whileTap={!disabled ? { scale: 0.97 } : {}}
              >
                <Icon className={`w-7 h-7 mx-auto mb-1.5 ${key === "charge" ? "text-neon-pink" : key === "defend" ? "text-neon-cyan" : key === "wild" ? "text-neon-purple" : "text-foreground"}`} />
                <div className="text-xs font-bold tracking-widest">{act.label.toUpperCase()}</div>
                <div className="text-[10px] text-muted-foreground mt-1 leading-tight">
                  {cannotHeal ? "Tank cannot heal" : getActionDesc(key, getArch(archetype), records.length)}
                </div>
                {cost > 0 && (
                  <div className="absolute top-1.5 right-1.5 text-[9px] font-bold text-neon-purple bg-neon-purple/10 border border-neon-purple/30 px-1 rounded-sm">−{cost}</div>
                )}
                {FOCUS_GAIN[key] > 0 && (
                  <div className="absolute top-1.5 right-1.5 text-[9px] font-bold text-neon-cyan bg-neon-cyan/10 border border-neon-cyan/30 px-1 rounded-sm">+{FOCUS_GAIN[key]}</div>
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
          <QuestionOverlay question={question} timeLeft={timeLeft} maxTime={maxTime} onAnswer={handleAnswer} />
        )}
      </AnimatePresence>
    </div>
  );
}

type RatingEntry = { rank: number; name: string; rating: number; wins: number; losses: number };

// ─── Leaderboard (XP + PvP Rating tabs) ──────────────────────────────
function LeaderboardCard() {
  const [tab, setTab]             = useState<"xp" | "rating">("rating");
  const [xpEntries, setXpEntries] = useState<LeaderboardEntry[]>([]);
  const [pvpEntries, setPvpEntries] = useState<RatingEntry[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [xpRes, pvpRes] = await Promise.all([
        supabase.rpc("get_leaderboard" as any, { p_limit: 6 }),
        supabase.rpc("get_pvp_leaderboard" as any, { p_limit: 6 }),
      ]);
      if (cancelled) return;
      setXpEntries(
        ((xpRes.data ?? []) as { user_id: string; username?: string | null; xp: number | null }[]).map((r, i) => ({
          rank: i + 1,
          name: r.username || `learner_${r.user_id.slice(0, 6)}`,
          xp:   r.xp ?? 0,
          tier: xpToTier(r.xp ?? 0),
        }))
      );
      setPvpEntries(
        ((pvpRes.data ?? []) as { user_id: string; username?: string | null; rating: number; wins: number; losses: number }[]).map((r, i) => ({
          rank:   i + 1,
          name:   r.username || `player_${r.user_id.slice(0, 6)}`,
          rating: r.rating,
          wins:   r.wins,
          losses: r.losses,
        }))
      );
      setLoading(false);
    };
    void load();

    // Debounced refresh on any XP / rating change anywhere — keeps the board
    // close to live without hammering RPCs on every event.
    let pending: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (pending) return;
      pending = setTimeout(() => { pending = null; void load(); }, 500);
    };

    const xpChan = supabase
      .channel(`leaderboard-xp:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "user_profiles" }, scheduleRefresh)
      .subscribe();
    const pvpChan = supabase
      .channel(`leaderboard-pvp:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "player_ratings" }, scheduleRefresh)
      .subscribe();

    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      if (pending) clearTimeout(pending);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(xpChan);
      supabase.removeChannel(pvpChan);
    };
  }, []);

  return (
    <motion.div className="glass-panel p-6" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold font-display tracking-widest text-neon-cyan">LEADERBOARD</h3>
        <div className="flex gap-1">
          {(["rating", "xp"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-2 py-0.5 text-[9px] font-bold tracking-widest border transition-colors ${
                tab === t
                  ? "border-neon-cyan/60 bg-neon-cyan/10 text-neon-cyan"
                  : "border-border/40 text-muted-foreground hover:border-border"
              }`}
            >
              {t === "rating" ? "PvP RATING" : "XP"}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {loading && <p className="text-[10px] text-muted-foreground italic px-3">Loading rankings…</p>}

        {/* PvP Rating tab */}
        {!loading && tab === "rating" && (
          pvpEntries.length < 1 ? (
            <div className="px-3 py-4 border border-dashed border-neon-cyan/40 bg-neon-cyan/5 text-center">
              <p className="text-xs font-bold text-neon-cyan mb-1">NO RANKED MATCHES YET</p>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Complete a live or ghost battle to appear on the rating ladder.
              </p>
            </div>
          ) : pvpEntries.map(p => {
            const isUsername = /^[a-zA-Z0-9_]{3,20}$/.test(p.name);
            const tier = ratingToTier(p.rating);
            return (
              <div key={p.rank} className="flex items-center gap-3 px-3 py-2 border border-transparent hover:bg-secondary/30 transition-colors">
                <span className={`text-xs font-bold w-5 text-center ${p.rank <= 3 ? "text-neon-pink" : "text-muted-foreground"}`}>{p.rank}</span>
                <div className="flex-1 min-w-0">
                  {isUsername
                    ? <a href={`/u/${p.name}`} className="text-xs font-bold text-foreground truncate hover:text-neon-purple transition-colors">{p.name}</a>
                    : <span className="text-xs font-bold text-foreground truncate">{p.name}</span>
                  }
                  <span className={`text-[10px] ml-2 font-bold ${tierColors[tier] ?? "text-muted-foreground"}`}>{tier}</span>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold font-display text-foreground">{p.rating}</div>
                  <div className="text-[9px] text-muted-foreground tabular-nums">{p.wins}W {p.losses}L</div>
                </div>
              </div>
            );
          })
        )}

        {/* XP tab */}
        {!loading && tab === "xp" && (
          xpEntries.length < 3 ? (
            <div className="px-3 py-4 border border-dashed border-neon-pink/40 bg-neon-pink/5 text-center">
              <p className="text-xs font-bold text-neon-pink mb-1">CLAIM THE THRONE</p>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Win battles to be among the first names etched into the leaderboard.
              </p>
            </div>
          ) : xpEntries.map(p => {
            const isUsername = /^[a-zA-Z0-9_]{3,20}$/.test(p.name);
            return (
              <div key={p.rank} className="flex items-center gap-3 px-3 py-2 border border-transparent hover:bg-secondary/30 transition-colors">
                <span className={`text-xs font-bold w-5 text-center ${p.rank <= 3 ? "text-neon-pink" : "text-muted-foreground"}`}>{p.rank}</span>
                <div className="flex-1 min-w-0">
                  {isUsername
                    ? <a href={`/u/${p.name}`} className="text-xs font-bold text-foreground truncate hover:text-neon-purple transition-colors">{p.name}</a>
                    : <span className="text-xs font-bold text-foreground truncate">{p.name}</span>
                  }
                  <span className={`text-[10px] ml-2 font-bold ${tierColors[p.tier]}`}>{p.tier}</span>
                </div>
                <div className="text-xs font-bold text-foreground">{p.xp.toLocaleString()} XP</div>
              </div>
            );
          })
        )}
      </div>
    </motion.div>
  );
}

// ─── Daily Challenge (live) ───────────────────────────────────────────
function DailyChallengeCard() {
  const [wins, setWins] = useState(0);
  const [claimed, setClaimed] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [countdown, setCountdown] = useState("");
  const challenge = getTodayChallenge();

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setAuthed(false); return; }
    setAuthed(true);
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from("daily_challenge_progress")
      .select("wins, bonus_claimed")
      .eq("user_id", user.id)
      .eq("challenge_date", today)
      .maybeSingle();
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
      const next = new Date(Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0
      ));
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Sign in to claim your reward"); return; }
      const today = new Date().toISOString().slice(0, 10);
      // Mark claimed FIRST (unique per user/day) so concurrent clicks can't double-claim.
      const { error: updErr } = await supabase
        .from("daily_challenge_progress")
        .update({ bonus_claimed: true })
        .eq("user_id", user.id)
        .eq("challenge_date", today)
        .eq("bonus_claimed", false);
      if (updErr) { toast.error("Couldn't claim — try again"); return; }
      // Award the XP via the rate-limited server RPC. The amount (100) is
      // enforced server-side; the client cannot inflate it.
      await awardXp("daily_challenge", 100);
      setClaimed(true);
      toast.success("Daily Challenge complete!", { description: "+100 XP added to your profile." });
    } catch {
      toast.error("Couldn't claim — try again");
    } finally {
      setClaiming(false);
    }
  }, [claiming, claimed, complete]);

  return (
    <motion.div className="glass-panel p-5 border border-neon-purple/20" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-neon-purple/10 border border-neon-purple/30 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-neon-purple" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-xs font-bold tracking-widest">DAILY · {challenge.title.toUpperCase()}</h4>
          <p className="text-[10px] text-muted-foreground">
            {!authed
              ? `Sign in to track today's challenge`
              : claimed
                ? `Reward claimed. Come back tomorrow for a new challenge.`
                : complete
                  ? `Reward ready to claim — +100 XP 🎉`
                  : `${challenge.goal} → +100 XP`}
          </p>
        </div>
        <div className={`text-lg font-bold font-display ${complete ? "text-neon-cyan" : "text-neon-purple"}`}>
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
          }`}
        >
          {claimed ? "✓ CLAIMED" : claiming ? "CLAIMING…" : "CLAIM +100 XP"}
        </button>
      )}
      <div className="mt-3 flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
        <Timer className="w-3 h-3" />
        RESETS IN <span className="text-foreground tabular-nums">{countdown}</span>
      </div>
    </motion.div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────
export function KnowledgeBattles() {
  const [howOpen, setHowOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  return (
    <section className="min-h-screen pt-24 pb-16">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div className="text-center mb-14" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 border border-neon-pink/30 bg-neon-pink/10 text-neon-pink text-xs font-bold tracking-widest mb-6">
            <Swords className="w-3 h-3" />
            CYBER-MATH ARENA
          </div>
          <h1 className="text-5xl md:text-7xl font-bold font-display tracking-tight mb-4">
            Knowledge{" "}
            <span className="text-neon-pink">Battles</span>
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Choose your archetype. Solve equations under pressure. Build devastating combos. Review and learn from every fight.
          </p>
        </motion.div>

        <div className="space-y-6">
          <ChallengeInbox />
          <div className="relative">
            <div className="flex items-center justify-end gap-2 mb-3">
              <button
                onClick={() => setSearchOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold tracking-widest text-neon-cyan border border-neon-cyan/40 bg-neon-cyan/5 hover:bg-neon-cyan/10 transition-colors rounded-sm"
                aria-label="Find player"
              >
                <Users className="w-3.5 h-3.5" /> FIND PLAYER
              </button>
              <button
                onClick={() => setHowOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold tracking-widest text-neon-purple border border-neon-purple/40 bg-neon-purple/5 hover:bg-neon-purple/10 transition-colors rounded-sm"
                aria-label="Battle info"
              >
                <Info className="w-3.5 h-3.5" /> INFO
              </button>
            </div>
            <BattleArena />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DailyChallengeCard />
            <LeaderboardCard />
          </div>
        </div>
      </div>

      <UserSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />

      {/* Floating "How to Play" button */}
      <motion.button
        onClick={() => setHowOpen(true)}
        className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-neon-purple text-primary-foreground shadow-lg shadow-neon-purple/30 flex items-center justify-center hover:opacity-90 transition-opacity"
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        aria-label="How to play"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <HelpCircle className="w-6 h-6" />
      </motion.button>

      <Dialog open={howOpen} onOpenChange={setHowOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl flex items-center gap-2">
              <Info className="w-5 h-5 text-neon-purple" />
              How Knowledge Battles work
            </DialogTitle>
            <DialogDescription>
              Everything you need to know — opponents, combat, and rewards.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 text-sm">
            <section>
              <h4 className="text-xs font-bold tracking-widest text-neon-pink mb-2 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5" /> OPPONENTS
              </h4>
              <ul className="space-y-1.5 text-muted-foreground leading-relaxed list-disc pl-5">
                <li><span className="text-neon-cyan font-bold">LIVE PvP</span> — the system first scans for a real player currently in queue. If one is found, you battle head-to-head in real time via a live channel. Rating is at stake.</li>
                <li><span className="text-neon-purple font-bold">GHOST PvP</span> — if no live opponent is found in 8 seconds, you face a replay of a real player's past session. Their actions, timing, and accuracy are replayed authentically. Rating still applies.</li>
                <li><span className="text-muted-foreground font-bold">AI Bot</span> — last resort only, when no real player data exists at your rating range. Bots never affect your rating.</li>
                <li>Priority is always <span className="text-foreground font-bold">Live → Ghost → Bot</span>. You will never be matched with a bot when real player data is available.</li>
              </ul>
            </section>

            <section>
              <h4 className="text-xs font-bold tracking-widest text-neon-cyan mb-2 flex items-center gap-1.5">
                <Swords className="w-3.5 h-3.5" /> COMBAT
              </h4>
              <ul className="space-y-1.5 text-muted-foreground leading-relaxed list-disc pl-5">
                <li><span className="text-foreground font-bold">Attack</span> — medium Q, 18 DMG and <span className="text-neon-cyan">+15 Focus</span>. Your bread-and-butter focus builder.</li>
                <li><span className="text-foreground font-bold">Heal</span> — easy Q, restores HP and <span className="text-neon-cyan">+10 Focus</span>.</li>
                <li><span className="text-foreground font-bold">Charge</span> — hard Q, 32 DMG but <span className="text-neon-purple">−25 Focus</span>. The payoff move.</li>
                <li><span className="text-foreground font-bold">Wild</span> — random effect for <span className="text-neon-purple">−15 Focus</span>.</li>
                <li><span className="text-neon-purple font-bold">Focus</span> is the resource that <span className="text-foreground font-bold">unlocks Charge &amp; Wild</span>. Without it you can only Attack/Heal — so building Focus = setting up your finisher. Each archetype has a different pool size (Speedster small, Chud huge).</li>
                <li>Bots think too — they heal when low, save Focus for finishers, and gamble Wild only when it pays.</li>
                <li>Correct answers grow <span className="text-neon-pink font-bold">Momentum</span>; each streak hit multiplies your damage.</li>
                <li>Wrong answers or timeouts reset Momentum and trigger a counter-attack.</li>
              </ul>
            </section>

            <section>
              <h4 className="text-xs font-bold tracking-widest text-neon-purple mb-2 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> ARCHETYPES &amp; REWARDS
              </h4>
              <ul className="space-y-1.5 text-muted-foreground leading-relaxed list-disc pl-5">
                <li>Each archetype tweaks HP, time, damage, multiplier, and question difficulty.</li>
                <li>Hit the <span className="text-foreground font-bold">daily challenge</span> goal to unlock today's bonus — the challenge changes every day.</li>
                <li>XP earned advances your Trophy Road and unlocks new Ecliptars to claim.</li>
              </ul>
            </section>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={() => setHowOpen(false)} variant="default">Got it</Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
