import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Swords, Zap, Trophy, Shield, Flame, Timer, Sparkles,
  Target, Heart, Skull, Dices, User, Bot, HelpCircle, Info, FastForward,
  Users, Ghost, Radio, TrendingUp, TrendingDown, MessageSquare, VolumeX, Volume2,
  Crown, Medal,
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
import { completeGhostBattle, fetchPlayerRating, ratingToTier } from "@/lib/rating";
import { awardXp } from "@/lib/xp-service";
import { toast } from "sonner";
import "./Battles.css";

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

type LiveTurnActionRow = {
  actor_id: string;
  action: Action;
  correct: boolean;
  damage: number;
  self_damage: number;
  heal: number;
  focus_delta: number;
  momentum: number;
  time_spent: number;
  question?: unknown;
};

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
// Rising major arpeggio for the win, falling minor slide for the loss
function sfxVictory() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 0.22, "sine", 0.10), i * 110)); }
function sfxDefeat()  { [330, 262, 196].forEach((f, i) => setTimeout(() => playTone(f, 0.30, "triangle", 0.10), i * 170)); }

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

function FocusBar({ current, max, isPlayer = false, canCharge = false }: { current: number; max: number; isPlayer?: boolean; canCharge?: boolean }) {
  const chargeCost = ACTIONS.charge.focusCost;
  // Charged means: enough focus, AND if we're showing this on the local player
  // side, the player can actually use Charge right now (phase allows it, no
  // action already locked for this turn, etc.). Without the second gate the
  // pink "CHARGE READY ⚡" ticker would stay on screen forever after the first
  // time focus crossed 25, regardless of whether spending it was possible.
  const isCharged = current >= chargeCost && (!isPlayer || canCharge);
  const isWarm    = current >= chargeCost - 10 && !isCharged;
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
            CHARGE READY ⚡
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function FighterCard({ fighter, side, momentum, archetype, showHit, showHeal, canCharge = false }: {
  fighter: Fighter; side: "left" | "right"; momentum: number; archetype?: ArchetypeId; showHit: boolean; showHeal: boolean; canCharge?: boolean;
}) {
  const arch = archetype ? ARCHETYPES[archetype] : null;
  const comboThreshold = archetype === "fulcrum" ? 2 : 3;

  // Floating combat numbers — derived from HP deltas so every damage source
  // (bot, ghost, live PvP, wild events, heals) produces one automatically.
  const prevHpRef = useRef(fighter.hp);
  const floatIdRef = useRef(0);
  const [floats, setFloats] = useState<{ id: number; delta: number }[]>([]);
  useEffect(() => {
    const delta = fighter.hp - prevHpRef.current;
    prevHpRef.current = fighter.hp;
    if (delta === 0) return;
    const id = ++floatIdRef.current;
    setFloats(f => [...f, { id, delta }]);
    // No cleanup: each float owns its timer, so rapid back-to-back hits
    // don't cancel the previous number's removal.
    setTimeout(() => setFloats(f => f.filter(x => x.id !== id)), 1200);
  }, [fighter.hp]);

  return (
    <motion.div
      className={`btt-card ${side === "left" ? "btt-card--cyan" : "btt-card--pink"} p-5 flex-1 relative overflow-hidden`}
      animate={showHit ? { x: side === "left" ? [-8, 8, -4, 0] : [8, -8, 4, 0] } : {}}
      transition={{ duration: 0.4 }}
    >
      <AnimatePresence>
        {showHit && <motion.div className="absolute inset-0 bg-neon-pink/10 z-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} />}
        {showHeal && <motion.div className="absolute inset-0 bg-neon-cyan/10 z-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} />}
      </AnimatePresence>
      <div className="btt-float-layer" aria-hidden>
        <AnimatePresence>
          {floats.map(f => (
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
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-11 h-11 border flex items-center justify-center ${side === "left" ? "border-neon-cyan/40 text-neon-cyan" : "border-neon-pink/40 text-neon-pink"}`}>
            <fighter.icon className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="btt-shout text-xl truncate">{fighter.name}</h4>
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
        <div className="mt-2"><FocusBar current={fighter.focus} max={fighter.maxFocus} isPlayer={side === "left"} canCharge={canCharge && side === "left"} /></div>
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
    <motion.div className="btt-q-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className={`btt-q-card ${timeLeft <= 3 ? "btt-q-card--danger" : ""}`} initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}>
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
          <div className="btt-hp-track">
            <motion.div className={`btt-hp-fill ${timeLeft <= 3 ? "btt-hp-fill--critical" : "btt-hp-fill--purple"}`} animate={{ width: `${pct}%` }} transition={{ duration: 0.3 }} />
          </div>
        </div>
        <h3 className="btt-shout text-5xl text-center mb-8 text-foreground">{question.q.trimEnd().endsWith("?") ? question.q : `${question.q} = ?`}</h3>
        <div className="grid grid-cols-2 gap-3">
          {question.options.map((opt, i) => {
            let style = "border-white/[0.08] hover:border-white/[0.18] hover:bg-white/[0.03]";
            if (selected !== null) {
              if (opt === question.answer) style = "border-neon-cyan/60 bg-neon-cyan/8 text-neon-cyan";
              else if (opt === selected) style = "border-neon-pink/60 bg-neon-pink/8 text-neon-pink";
              else style = "border-white/[0.05] opacity-30";
            }
            return (
              <motion.button key={i} onClick={() => handleSelect(opt)} disabled={selected !== null}
                className={`p-5 border btt-shout text-2xl transition-colors ${style}`}
                whileHover={selected === null ? { scale: 1.03 } : {}} whileTap={selected === null ? { scale: 0.97 } : {}}
              >{opt}</motion.button>
            );
          })}
        </div>

        {/* Correct answer reveal — appears briefly on wrong answer before damage */}
        <AnimatePresence>
          {showReveal && (
            <motion.div
              className="mt-5 flex items-center justify-center gap-2 px-4 py-2.5 border border-neon-cyan/30 bg-neon-cyan/5"
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
    <div className="btt-log overflow-hidden">
      <div className="btt-log-head">
        <span className="btt-mono-text text-[10px] tracking-widest text-muted-foreground">BATTLE LOG</span>
        <span className="btt-mono-text text-[10px] tabular-nums text-muted-foreground">T-{String(turn).padStart(2,"0")}</span>
      </div>
      <div ref={ref} className="p-3 h-48 overflow-y-auto space-y-1">
        {logs.length === 0 && (
          <p className="text-[10px] text-muted-foreground italic">Battle log will appear here…</p>
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
      <div className="btt-card p-2 flex items-center gap-2 flex-wrap">
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
      className="btt-card p-8 text-center"
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
        <h3 className="btt-shout text-3xl mb-0.5">
          {allDone ? "FATE HAS SPOKEN" : "ROLLING FATE…"}
        </h3>
        <p className="text-[10px] text-muted-foreground tracking-widest">
          {allDone ? `vs ${opponentName}` : "YOUR BUILD IS BEING DETERMINED"}
        </p>
      </div>

      {/* 2-column stat grid — each cell cycles then locks with a quality pop */}
      <div className="grid grid-cols-2 gap-2 mb-5 text-left">
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
              className={`border p-4 transition-colors duration-300 ${
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
              <div className={`btt-shout text-3xl tabular-nums ${
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
  // Impact/event layer: combo bursts, battle-start stinger, KO banner
  const [comboBurst, setComboBurst] = useState<{ id: number; combo: number; mult: number } | null>(null);
  const comboBurstIdRef = useRef(0);
  const [koBanner, setKoBanner] = useState<"victory" | "defeat" | null>(null);
  const [showFight, setShowFight] = useState(false);
  const fightShownRef = useRef(false);
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
  const recordsRef = useRef<QuestionRecord[]>([]);
  const longestStreakRef = useRef(0);
  const fastestAnswerRef = useRef(Infinity);
  const totalScoreRef = useRef(0);

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
  const [liveTurnNumber, setLiveTurnNumber] = useState(1);
  const [liveActionLocked, setLiveActionLocked] = useState(false);
  const [liveOpponentLocked, setLiveOpponentLocked] = useState(false);
  const [liveResolvingTurn, setLiveResolvingTurn] = useState(false);
  const [liveRematchState, setLiveRematchState] = useState<"idle" | "waiting" | "starting">("idle");

  // Refs for async-safe access inside callbacks
  const pvpChannelRef     = useRef<any>(null);
  const ghostSessionRef   = useRef<GhostSession | null>(null);
  const ghostTurnIndexRef = useRef(0);
  const playerRatingRef   = useRef(1000);
  const opponentRatingRef = useRef(1000);
  const opponentTypeRef   = useRef<OpponentType>("bot");
  const pvpBattleIdRef = useRef<string | null>(null);
  const liveTurnNumberRef = useRef(1);
  const liveActionLockedRef = useRef(false);
  const liveOpponentLockedRef = useRef(false);
  const liveResolvingRef = useRef(false);
  const liveResolvedTurnsRef = useRef<Set<number>>(new Set());
  const livePendingActionRef = useRef<LiveTurnActionRow | null>(null);
  const liveResolutionRef = useRef<(actions: LiveTurnActionRow[], turnNumber: number) => void>(() => {});
  const rematchStartedRef = useRef(false);
  const liveRematchStateRef = useRef<"idle" | "waiting" | "starting">("idle");
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      myUserIdRef.current = user.id;
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
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "pvp_turn_actions",
        filter: `battle_id=eq.${pvpBattleId}`,
      }, async (payload) => {
        const row = payload.new as { turn_number: number; actor_id: string };
        if (row.turn_number !== liveTurnNumberRef.current) return;
        if (row.actor_id !== myUserIdRef.current) {
          liveOpponentLockedRef.current = true;
          setLiveOpponentLocked(true);
        }
        if (liveActionLockedRef.current) {
          const { data } = await supabase.rpc("get_pvp_turn_resolution" as any, {
            p_battle_id: pvpBattleId,
            p_turn_number: row.turn_number,
          });
          if ((data as any)?.ready) liveResolutionRef.current((data as any).actions ?? [], row.turn_number);
        }
      })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "pvp_battles",
        filter: `id=eq.${pvpBattleId}`,
      }, async (payload) => {
        const row = payload.new as any;
        if (row.status === "completed" && row.winner_id && !battleFinishedRef.current) {
          finishBattle(row.winner_id === myUserIdRef.current);
        }
        if (row.rematch_battle_id && !rematchStartedRef.current) {
          rematchStartedRef.current = true;
          setLiveRematchState("starting");
          await startLiveBattleFromId(row.rematch_battle_id as string);
        } else if (
          Array.isArray(row.rematch_requested_by)
          && row.rematch_requested_by.length === 1
          && row.rematch_requested_by[0] !== myUserIdRef.current
          && liveRematchStateRef.current === "idle"
        ) {
          // Opponent asked for a rematch first — surface it so the player
          // knows clicking QUICK REMATCH will jump straight into another match.
          toast(`${opponentRef.current.name} wants a rematch.`, {
            description: "Click QUICK REMATCH on the result screen to accept.",
          });
        }
      })
      .on("broadcast", { event: "battle_end" }, ({ payload }) => {
        if (payload.winner_id) finishBattle(payload.winner_id === myUserIdRef.current);
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
  useEffect(() => { recordsRef.current = records; }, [records]);
  useEffect(() => { longestStreakRef.current = longestStreak; }, [longestStreak]);
  useEffect(() => { fastestAnswerRef.current = fastestAnswer; }, [fastestAnswer]);
  useEffect(() => { totalScoreRef.current = totalScore; }, [totalScore]);
  useEffect(() => { pvpBattleIdRef.current = pvpBattleId; }, [pvpBattleId]);
  useEffect(() => { liveRematchStateRef.current = liveRematchState; }, [liveRematchState]);

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

  const fireComboBurst = useCallback((combo: number, mult: number) => {
    const id = ++comboBurstIdRef.current;
    setComboBurst({ id, combo, mult });
    setTimeout(() => setComboBurst(prev => (prev?.id === id ? null : prev)), 1200);
  }, []);

  // "FIGHT" stinger — fires once per battle, the first time we hit select.
  // The flag re-arms on any pre-battle phase (and on result, so a direct
  // result → select rematch transition still gets its stinger).
  useEffect(() => {
    if (phase === "select" && !fightShownRef.current) {
      fightShownRef.current = true;
      setShowFight(true);
      const t = setTimeout(() => setShowFight(false), 1200);
      return () => clearTimeout(t);
    }
    if (phase === "idle" || phase === "classSelect" || phase === "searching" || phase === "result") {
      fightShownRef.current = false;
    }
  }, [phase]);

  const resolveLiveTurn = useCallback((actions: LiveTurnActionRow[], turnNumber: number) => {
    if (liveResolvedTurnsRef.current.has(turnNumber) || liveResolvingRef.current) return;
    const myId = myUserIdRef.current;
    if (!myId) return;
    const mine = actions.find(a => a.actor_id === myId);
    const theirs = actions.find(a => a.actor_id !== myId);
    if (!mine || !theirs) return;

    liveResolvedTurnsRef.current.add(turnNumber);
    liveResolvingRef.current = true;
    setLiveResolvingTurn(true);
    setPhase("animate");

    const curPlayer = playerRef.current;
    const curOpp = opponentRef.current;
    const nextPlayerHp = Math.max(0, Math.min(curPlayer.maxHp, curPlayer.hp - theirs.damage - mine.self_damage + mine.heal));
    const nextOppHp = Math.max(0, Math.min(curOpp.maxHp, curOpp.hp - mine.damage - theirs.self_damage + theirs.heal));

    if (mine.damage > 0) { setShowOpponentHit(true); addLog({ actor: "player", actionType: mine.action as LogActionType, result: `${ACTIONS[mine.action].label}: ${mine.damage} DMG.`, value: mine.damage }); }
    if (mine.heal > 0) { setShowPlayerHeal(true); addLog({ actor: "player", actionType: "heal", result: `Heal resolves: +${mine.heal} HP.`, value: mine.heal }); }
    if (mine.self_damage > 0) { setShowPlayerHit(true); addLog({ actor: "player", actionType: "miss", result: `Your miss resolves: -${mine.self_damage} HP.`, value: mine.self_damage }); }
    if (theirs.damage > 0) { setShowPlayerHit(true); addLog({ actor: "opponent", actionType: theirs.action as LogActionType, result: `${opponentRef.current.name}: ${theirs.damage} DMG.`, value: theirs.damage }); }
    if (theirs.heal > 0) addLog({ actor: "opponent", actionType: "heal", result: `${opponentRef.current.name} heals +${theirs.heal} HP.`, value: theirs.heal });
    if (theirs.self_damage > 0) addLog({ actor: "opponent", actionType: "miss", result: `${opponentRef.current.name} misses: -${theirs.self_damage} HP.`, value: theirs.self_damage });

    setMomentum(mine.momentum);
    setOpponentMomentum(theirs.momentum);
    setPlayer(p => ({ ...p, hp: nextPlayerHp, focus: Math.max(0, Math.min(p.maxFocus, p.focus + mine.focus_delta)) }));
    setOpponent(o => ({ ...o, hp: nextOppHp, focus: Math.max(0, Math.min(o.maxFocus, o.focus + theirs.focus_delta)) }));

    setTimeout(() => {
      setShowPlayerHit(false); setShowOpponentHit(false); setShowPlayerHeal(false);
      if (nextOppHp <= 0 || nextPlayerHp <= 0) finishBattle(nextOppHp <= 0 && nextPlayerHp > 0 ? true : nextOppHp <= nextPlayerHp);
      else { resetLiveTurnLocks(turnNumber + 1); setPhase("select"); }
    }, 900);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addLog, resetLiveTurnLocks]);

  useEffect(() => { liveResolutionRef.current = resolveLiveTurn; }, [resolveLiveTurn]);

  async function startLiveBattleFromId(battleId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    myUserIdRef.current = user.id;
    const { data: battle } = await supabase
      .from("pvp_battles" as any)
      .select("challenger_id, opponent_id, challenger_archetype, opponent_archetype")
      .eq("id", battleId)
      .maybeSingle();
    const b = battle as any;
    if (!b) return;
    const iAmChallenger = b.challenger_id === user.id;
    const oppId = iAmChallenger ? b.opponent_id : b.challenger_id;
    const { data: prof } = await supabase.from("user_profiles" as any).select("username").eq("user_id", oppId).maybeSingle();
    const { data: rating } = await supabase.from("player_ratings" as any).select("rating").eq("user_id", oppId).maybeSingle();
    startDirectBattle({
      battleId,
      myArchetype: (iAmChallenger ? b.challenger_archetype : b.opponent_archetype) as ArchetypeId,
      opponentArchetype: (iAmChallenger ? b.opponent_archetype : b.challenger_archetype) as ArchetypeId,
      opponentName: (prof as any)?.username ?? `Player_${String(oppId).slice(0, 6)}`,
      opponentRating: (rating as any)?.rating ?? 1000,
      iAmChallenger,
      opponentUserId: oppId,
    });
  }

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
    const step = getEffectiveMultiplierStep(arch, nextRecords.length - 1);
    const currentStreakMult = streakToMultiplier(momentum, step);

    if (opponentTypeRef.current === "live") {
      const nextMom = correct ? momentum + 1 : 0;
      if (correct && nextMom > longestStreakRef.current) {
        longestStreakRef.current = nextMom;
        setLongestStreak(nextMom);
      }

      let damage = 0;
      let selfDamage = 0;
      let heal = 0;
      let focusDelta = correct ? FOCUS_GAIN[currentAction] : 0;

      if (correct) {
        sfxStreak(nextMom);
        if (nextMom > 0 && nextMom % comboThreshold === 0) {
          const newMult = streakToMultiplier(nextMom, step);
          addLog({ actor: "system", actionType: "combo", result: `🔥 COMBO x${Math.floor(nextMom / comboThreshold)} — ${newMult.toFixed(2)}× damage locked!` });
          fireComboBurst(Math.floor(nextMom / comboThreshold), newMult);
          sfxCombo();
        }

        if (currentAction === "defend") {
          heal = arch.healAmount === null ? 0 : Math.min(arch.healAmount, playerRef.current.maxHp - playerRef.current.hp);
        } else if (currentAction === "wild") {
          sfxWild();
          const roll = Math.random();
          if (roll < 0.333) damage = Math.floor(Math.random() * 30) + 10;
          else if (roll < 0.667) heal = Math.min(20, playerRef.current.maxHp - playerRef.current.hp);
          else { damage = 20; focusDelta += 20; }
        } else {
          damage = Math.floor(getEffectiveDamage(arch, { action: currentAction, timeSpent, maxTime, recordCount: nextRecords.length - 1 }) * currentStreakMult);
        }
      } else {
        sfxBreak();
        selfDamage = Math.floor((Math.floor(Math.random() * 10) + 8) * hpToSelfDmgMult(arch.maxHp));
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
        result: `Action locked for turn ${liveTurnNumberRef.current}. ${liveOpponentLockedRef.current ? "Resolving…" : `Waiting for ${opponentRef.current.name}.`}`,
      });

      void (async () => {
        const battleId = pvpBattleIdRef.current;
        if (!battleId) return;
        const { data, error } = await supabase.rpc("submit_pvp_turn_action" as any, {
          p_battle_id: battleId,
          p_turn_number: liveTurnNumberRef.current,
          p_action: currentAction,
          p_correct: correct,
          p_damage: damage,
          p_self_damage: selfDamage,
          p_heal: heal,
          p_focus_delta: focusDelta,
          p_momentum: nextMom,
          p_time_spent: timeSpent,
          p_question: { q: question.q, difficulty: question.difficulty, topic: question.topic },
        });
        if (error) {
          liveActionLockedRef.current = false;
          setLiveActionLocked(false);
          toast.error("Couldn't lock PvP action — try again.");
          return;
        }
        if ((data as any)?.ready) {
          liveResolutionRef.current((data as any).actions ?? [], liveTurnNumberRef.current);
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
              !battleIdAtSubmit
              || liveTurnNumberRef.current !== turnAtSubmit
              || liveResolvedTurnsRef.current.has(turnAtSubmit)
              || liveResolvingRef.current
              || battleFinishedRef.current
            ) {
              clearInterval(poll);
              return;
            }
            const { data: res } = await supabase.rpc("get_pvp_turn_resolution" as any, {
              p_battle_id: battleIdAtSubmit,
              p_turn_number: turnAtSubmit,
            });
            if ((res as any)?.ready) {
              clearInterval(poll);
              liveResolutionRef.current((res as any).actions ?? [], turnAtSubmit);
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

      // Announce combo activations in the log with the actual live multiplier
      if (newMom > 0 && newMom % comboThreshold === 0) {
        const newMult = streakToMultiplier(newMom, step);
        addLog({ actor: "system", actionType: "combo", result: `🔥 COMBO x${Math.floor(newMom / comboThreshold)} — ${newMult.toFixed(2)}× damage!` });
        fireComboBurst(Math.floor(newMom / comboThreshold), newMult);
        sfxCombo();
      }

      if (currentAction === "defend") {
        const gain = FOCUS_GAIN.defend;
        if (arch.healAmount !== null) {
          const heal = Math.min(arch.healAmount, player.maxHp - player.hp);
          setPlayer(prev => ({ ...prev, hp: Math.min(prev.maxHp, prev.hp + arch.healAmount!), focus: Math.min(prev.maxFocus, prev.focus + gain) }));
          setShowPlayerHeal(true);
          addLog({ actor: "player", actionType: "heal", result: `Defend: +${heal} HP, +${gain} Focus.`, value: heal });
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
    const winnerId = won ? myUserIdRef.current : opponentUserIdRef.current;
    if (opponentTypeRef.current === "live" && pvpChannelRef.current && winnerId) {
      pvpChannelRef.current.send({
        type: "broadcast", event: "battle_end",
        payload: { winner_id: winnerId },
      });
    }

    // Mirror the server-side formula in award_battle_xp so the number we
    // animate up to in the report matches what actually lands on the profile:
    //   xp = min(1000, correct*15 + (won ? 50 : 0))
    const finalRecords = recordsRef.current;
    const finalStreak = longestStreakRef.current;
    const finalFastest = fastestAnswerRef.current;
    const finalScore = totalScoreRef.current;
    const totalQuestions = finalRecords.length;
    const correctAnswers = finalRecords.filter(r => r.correct).length;
    const xp = Math.min(1000, correctAnswers * 15 + (won ? 50 : 0));
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
    if (won) sfxVictory(); else sfxDefeat();
    setTimeout(() => {
      setKoBanner(null);
      if (battleFinishedRef.current) setPhase("result");
    }, 1700);

    // Persist battle to learning_history + increment daily challenge on win
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("learning_history").insert({
        user_id: user.id,
        session_type: "battle",
        was_correct: won,
        topic: ARCHETYPES[archetype].name,
        luna_summary: `${won ? "Victory" : "Defeat"} as ${ARCHETYPES[archetype].name} · score ${Math.floor(finalScore)} · streak ${finalStreak}`,
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
      const sessionId = await recordBattleSession({
        archetype,
        won,
        rating: playerRatingRef.current,
        records: finalRecords,
        bestStreak: finalStreak,
        opponentType: opponentTypeRef.current,
      });

      // Update competitive rating. Live PvP completes on the server once per battle; ghosts use local ELO.
      if (opponentTypeRef.current === "live" && pvpBattleIdRef.current && winnerId) {
        const { data } = await supabase.rpc("complete_pvp_battle" as any, {
          p_battle_id: pvpBattleIdRef.current,
          p_winner_id: winnerId,
        });
        const d = data as any;
        const nextRating = iAmChallengerRef.current ? d?.challenger_rating_after : d?.opponent_rating_after;
        if (typeof nextRating === "number") {
          setRatingChange(nextRating - playerRatingRef.current);
          setPlayerRating(nextRating);
          playerRatingRef.current = nextRating;
          window.dispatchEvent(new Event("pvp-leaderboard-updated"));
        }
      } else if (opponentTypeRef.current === "ghost" && sessionId) {
        const result = await completeGhostBattle(sessionId, opponentRatingRef.current);
        setRatingChange(result.ratingDelta);
        setPlayerRating(result.ratingAfter);
        playerRatingRef.current = result.ratingAfter;
        window.dispatchEvent(new Event("pvp-leaderboard-updated"));
      }
    })();
  }, [archetype]);

  const handleLiveRematch = useCallback(async () => {
    const battleId = pvpBattleIdRef.current;
    if (!battleId) return;
    if (liveRematchStateRef.current !== "idle") return;
    setLiveRematchState("waiting");
    try {
      const { data, error } = await supabase.rpc("request_pvp_rematch" as any, {
        p_battle_id: battleId,
        p_archetype: archetype,
      });
      if (error) throw error;
      const d = data as { ready?: boolean; battle_id?: string | null } | null;
      // Both players already requested → the realtime UPDATE will arrive and
      // trigger startLiveBattleFromId, but kick it off directly too in case
      // the broadcast was dropped between RPC return and channel delivery.
      if (d?.ready && d.battle_id && !rematchStartedRef.current) {
        rematchStartedRef.current = true;
        setLiveRematchState("starting");
        await startLiveBattleFromId(d.battle_id);
      }
    } catch (err) {
      console.error("rematch failed", err);
      toast.error("Couldn't queue rematch — try again.");
      setLiveRematchState("idle");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archetype]);

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
    if (opponentTypeRef.current === "live" && liveActionLockedRef.current) {
      addLog({ actor: "system", actionType: "info", result: `Action already locked for this turn.` });
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
    setKoBanner(null);
    setPhase("searching");

    // Reset ghost state
    ghostSessionRef.current   = null;
    ghostTurnIndexRef.current = 0;
    pvpChannelRef.current     = null;
    setPvpBattleId(null);
    battleFinishedRef.current = false;
    rematchStartedRef.current = false;
    setLiveRematchState("idle");

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

      if (match.type === "live") {
        iAmChallengerRef.current = match.iAmChallenger === true;
        opponentUserIdRef.current = match.opponentUserId ?? null;
        liveResolvedTurnsRef.current = new Set();
      }
      resetLiveTurnLocks(1);

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
    setKoBanner(null);
    setPvpBattleId(null);
    setOpponentType("bot");
    setRatingChange(null);
    ghostSessionRef.current   = null;
    pvpChannelRef.current     = null;
    battleFinishedRef.current = false;
    rematchStartedRef.current = false;
    setLiveRematchState("idle");
    resetLiveTurnLocks(1);
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
    opponentUserId?: string;
  }) => {
    setArchetype(opts.myArchetype);
    setRatingChange(null);
    setKoBanner(null);
    battleFinishedRef.current = false;
    rematchStartedRef.current = false;
    setLiveRematchState("idle");
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

    iAmChallengerRef.current = opts.iAmChallenger === true;
    opponentUserIdRef.current = opts.opponentUserId ?? null;
    liveResolvedTurnsRef.current = new Set();
    resetLiveTurnLocks(1);

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
      <motion.div className="btt-card text-center py-16 px-10" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
        <motion.div
          className="w-24 h-24 mx-auto mb-8 border border-neon-pink/30 flex items-center justify-center"
          animate={{ rotate: [0, 5, -5, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        >
          <Swords className="w-12 h-12 text-neon-pink" />
        </motion.div>
        <h3 className="btt-shout text-5xl mb-3">Enter the Arena</h3>
        <p className="btt-mono-text text-[12px] text-muted-foreground mb-8 max-w-sm mx-auto leading-relaxed">
          Choose your archetype. Solve equations under pressure.<br />Build combos. Destroy your opponent.
        </p>
        <motion.button
          onClick={() => setPhase("classSelect")}
          className="btt-mono-text inline-flex items-center gap-3 px-10 py-4 bg-neon-pink text-black font-bold text-[12px] tracking-widest hover:opacity-90 transition-opacity"
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
        >
          <Zap className="w-4 h-4" />
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
      <motion.div className="btt-card text-center py-16 px-10" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <motion.div
          className="w-20 h-20 mx-auto mb-8 border flex items-center justify-center"
          animate={{
            borderColor: ["oklch(0.6 0.24 350)", "oklch(0.58 0.17 252)", "oklch(0.75 0.15 180)", "oklch(0.6 0.24 350)"],
            rotate: 360,
          }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
          <Target className="w-8 h-8 text-neon-pink" />
        </motion.div>

        <h3 className="btt-shout text-4xl mb-2">Finding an opponent…</h3>
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
        onLiveRematch={opponentType === "live" ? handleLiveRematch : undefined}
        liveRematchState={liveRematchState}
      />
    );
  }

  // ── Battle ──
  const playerCritical = player.hp > 0 && player.hp <= player.maxHp * 0.25;
  return (
    <div className={`relative ${showPlayerHit ? "btt-shake" : ""}`}>
      {/* Directional impact flashes — pink when you're hit, cyan when your hit lands */}
      <AnimatePresence>
        {showPlayerHit && (
          <motion.div
            key="impact-left" aria-hidden
            className="btt-impact-flash btt-impact-flash--left"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          />
        )}
        {showOpponentHit && (
          <motion.div
            key="impact-right" aria-hidden
            className="btt-impact-flash btt-impact-flash--right"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          />
        )}
      </AnimatePresence>

      {/* Critical-HP danger framing */}
      {playerCritical && !koBanner && <div className="btt-danger-vignette" aria-hidden />}

      {/* Battle-start stinger */}
      <AnimatePresence>
        {showFight && (
          <motion.div
            key="fight" className="btt-stinger" aria-hidden
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.p
              className="btt-stinger-word text-8xl md:text-9xl text-foreground"
              style={{ textShadow: "0 0 70px oklch(0.6 0.24 350 / 0.55), 0 0 160px oklch(0.58 0.17 252 / 0.35)" }}
              initial={{ scale: 2.3, opacity: 0, letterSpacing: "0.45em" }}
              animate={{ scale: 1, opacity: 1, letterSpacing: "0.06em" }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            >
              FIGHT
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* KO banner — holds the moment before the battle report */}
      <AnimatePresence>
        {koBanner && (
          <motion.div
            key="ko" className="btt-stinger btt-stinger--ko"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="text-center px-6">
              <motion.p
                className={`btt-stinger-word text-8xl md:text-9xl ${koBanner === "victory" ? "text-neon-cyan" : "text-neon-pink"}`}
                style={{
                  textShadow: koBanner === "victory"
                    ? "0 0 80px oklch(0.75 0.15 180 / 0.6), 0 0 200px oklch(0.75 0.15 180 / 0.3)"
                    : "0 0 80px oklch(0.6 0.24 350 / 0.6), 0 0 200px oklch(0.6 0.24 350 / 0.3)",
                }}
                initial={{ scale: 0.55, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              >
                {koBanner === "victory" ? "VICTORY" : "DEFEAT"}
              </motion.p>
              <motion.p
                className="btt-mono-text text-[11px] tracking-[0.4em] text-muted-foreground mt-5"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.4 }}
              >
                {koBanner === "victory" ? "OPPONENT ELIMINATED" : `${opponent.name.toUpperCase()} TAKES THE ROUND`}
              </motion.p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Combo burst — the payoff moment, front and center */}
      <AnimatePresence>
        {comboBurst && (
          <motion.div
            key={comboBurst.id} aria-hidden
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
                className="btt-shout text-7xl md:text-8xl text-neon-pink"
                style={{ textShadow: "0 0 44px oklch(0.6 0.24 350 / 0.8), 0 0 120px oklch(0.6 0.24 350 / 0.4)" }}
              >
                COMBO ×{comboBurst.combo}
              </p>
              <p className="btt-mono-text text-[12px] tracking-[0.34em] text-neon-pink/80 mt-2">
                {comboBurst.mult.toFixed(2)}× DAMAGE
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Wild event overlay — appears on the battle field, not inside the question panel */}
      <AnimatePresence>
        {wildEvent && <WildEventOverlay event={wildEvent} />}
      </AnimatePresence>
      <div className="flex gap-3 mb-4">
        <FighterCard
          fighter={player} side="left" momentum={momentum} archetype={archetype}
          showHit={showPlayerHit} showHeal={showPlayerHeal}
          // Charge is only genuinely "ready" when the player can actually click
          // it this very moment: in select phase, no action locked, and enough
          // focus. Mirrors the disabled logic on the Charge action button.
          canCharge={phase === "select" && !liveActionLocked && player.focus >= ACTIONS.charge.focusCost}
        />
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
            <div className="btt-card p-3">
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
                      className={`h-2 flex-1 ${isFilled ? "bg-neon-pink" : "bg-secondary/40"}`}
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
            <div className="btt-card p-3 border-l-2 border-tier-platinum/50">
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

        {liveActionLocked && phase === "select" && (
          <motion.div
            className="glass-panel p-3 border border-neon-cyan/40 bg-neon-cyan/5 text-center"
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
          >
            <motion.span
              className="text-[11px] font-bold tracking-widest text-neon-cyan"
              animate={{ opacity: [0.55, 1, 0.55] }}
              transition={{ duration: 1.4, repeat: Infinity }}
            >
              {liveResolvingTurn ? "RESOLVING TURN…" : liveOpponentLocked ? "BOTH ACTIONS LOCKED…" : `ACTION LOCKED · WAITING FOR ${opponent.name.toUpperCase()}`}
            </motion.span>
          </motion.div>
        )}
        <div className="grid grid-cols-4 gap-2">
          {(Object.entries(ACTIONS) as [Action, ActionConfig][]).map(([key, act]) => {
            const Icon = act.icon;
            const cost = act.focusCost;
            const cannotHeal = key === "defend" && getArch(archetype).healAmount === null;
            const disabled = phase !== "select" || (cost > 0 && player.focus < cost) || cannotHeal || liveActionLocked;
            return (
              <motion.button key={key} onClick={() => selectAction(key)} disabled={disabled}
                className={`btt-action btt-action--${key}`}
                whileHover={!disabled ? { scale: 1.02, y: -2 } : {}} whileTap={!disabled ? { scale: 0.97 } : {}}
              >
                <Icon className={`w-8 h-8 mx-auto mb-2 ${key === "charge" ? "text-neon-pink" : key === "defend" ? "text-neon-cyan" : key === "wild" ? "text-neon-purple" : "text-foreground/80"}`} />
                <div className="btt-shout text-lg tracking-wider">{act.label.toUpperCase()}</div>
                <div className="btt-mono-text text-[9px] text-muted-foreground mt-1 leading-tight">
                  {cannotHeal ? "Tank · no heal" : getActionDesc(key, getArch(archetype), records.length)}
                </div>
                {cost > 0 && (
                  <div className="absolute top-2 right-2 btt-mono-text text-[8px] font-bold text-neon-purple border border-neon-purple/30 px-1">−{cost}</div>
                )}
                {FOCUS_GAIN[key] > 0 && (
                  <div className="absolute top-2 right-2 btt-mono-text text-[8px] font-bold text-neon-cyan border border-neon-cyan/30 px-1">+{FOCUS_GAIN[key]}</div>
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

// ─── Leaderboard ─────────────────────────────────────────────────────
// A cinematic, game-style ranking board: a top-3 medal podium over a clean
// ranked list. Both tabs (PvP Rating / XP) share one normalised row shape so
// the podium + list render identically. The signed-in player is detected by
// user_id and highlighted — and pinned to the foot of the board if they rank
// outside the visible top 10, so "where do I stand" is always answerable.
type LbRow = {
  rank: number;
  userId: string;
  name: string;
  isUser: boolean;
  tier: string;
  score: number;
  wins?: number;
  losses?: number;
};

const MEDAL: Record<1 | 2 | 3, { color: string; label: string; Icon: typeof Crown }> = {
  1: { color: "#e9c558", label: "Champion", Icon: Crown },
  2: { color: "#c4c9d4", label: "Runner-up", Icon: Medal },
  3: { color: "#cc8a4e", label: "Third",     Icon: Medal },
};

const winRate = (w?: number, l?: number) => {
  const total = (w ?? 0) + (l ?? 0);
  return total > 0 ? Math.round(((w ?? 0) / total) * 100) : null;
};
const initialOf = (name: string) => (name.trim()[0] ?? "?").toUpperCase();
const isUsername = (name: string) => /^[a-zA-Z0-9_]{3,20}$/.test(name);

function LbName({ row, className }: { row: LbRow; className?: string }) {
  if (isUsername(row.name)) {
    return <a href={`/u/${row.name}`} className={className}>{row.name}</a>;
  }
  return <span className={className}>{row.name}</span>;
}

function LeaderboardCard() {
  const [tab, setTab]               = useState<"rating" | "xp">("rating");
  const [xpEntries, setXpEntries]   = useState<LbRow[]>([]);
  const [pvpEntries, setPvpEntries] = useState<LbRow[]>([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const myId = user?.id ?? null;
      const [xpRes, pvpRes] = await Promise.all([
        supabase.rpc("get_leaderboard" as any, { p_limit: 10 }),
        supabase.rpc("get_pvp_leaderboard" as any, { p_limit: 10 }),
      ]);
      if (cancelled) return;
      setXpEntries(
        ((xpRes.data ?? []) as { user_id: string; username?: string | null; xp: number | null }[]).map((r, i) => ({
          rank: i + 1,
          userId: r.user_id,
          name: r.username || `learner_${r.user_id.slice(0, 6)}`,
          isUser: r.user_id === myId,
          tier: xpToTier(r.xp ?? 0),
          score: r.xp ?? 0,
        }))
      );
      setPvpEntries(
        ((pvpRes.data ?? []) as { user_id: string; username?: string | null; rating: number; wins: number; losses: number }[]).map((r, i) => ({
          rank:   i + 1,
          userId: r.user_id,
          name:   r.username || `player_${r.user_id.slice(0, 6)}`,
          isUser: r.user_id === myId,
          tier:   ratingToTier(r.rating),
          score:  r.rating,
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

  const entries  = tab === "rating" ? pvpEntries : xpEntries;
  const unit     = tab === "rating" ? "RATING" : "XP";
  const podium   = entries.slice(0, 3);
  const rest     = entries.slice(3);
  // The signed-in player, if they fall outside the visible top 10.
  const meInList = entries.some(e => e.isUser);

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
              {tab === "rating" ? "TOP RANKED · GLOBAL" : "MOST XP · GLOBAL"}
            </p>
          </div>
        </div>
        <div className="btt-lb-tabs">
          {(["rating", "xp"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`btt-lb-tab ${tab === t ? "is-on" : ""}`}
            >
              {t === "rating" ? "PvP Rating" : "XP"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="btt-lb-skeleton">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="btt-lb-skel-row" />)}
        </div>
      ) : entries.length === 0 ? (
        <div className="btt-lb-empty">
          <Crown className="w-7 h-7 mx-auto mb-3 text-tier-gold opacity-70" />
          <p className="btt-shout text-2xl mb-1">The throne is empty</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed max-w-xs mx-auto">
            {tab === "rating"
              ? "Finish a live or ghost battle to claim the first spot on the rating ladder."
              : "Win battles and earn XP to etch your name into the board first."}
          </p>
        </div>
      ) : (
        <>
          {/* ── Podium (top 3) ── visual order 2 · 1 · 3 ── */}
          {podium.length >= 1 && (
            <div className="btt-lb-podium">
              {[podium[1], podium[0], podium[2]].map((row) => {
                if (!row) return <div key={Math.random()} className="btt-lb-pod-empty" aria-hidden />;
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
                    <div className={`btt-lb-pod-tier ${tierColors[row.tier] ?? ""}`}>{row.tier}</div>
                    <div className="btt-lb-pod-score">{fmtScore(row.score)}</div>
                    <div className="btt-lb-pod-sub">
                      {tab === "rating"
                        ? (wr !== null ? `${row.wins}W ${row.losses}L · ${wr}%` : `${row.wins ?? 0}W ${row.losses ?? 0}L`)
                        : unit}
                    </div>
                    {row.isUser && <div className="btt-lb-you">YOU</div>}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Ranked list (4+) ── */}
          {rest.length > 0 && (
            <div className="btt-lb-rows">
              {rest.map(row => {
                const wr = winRate(row.wins, row.losses);
                return (
                  <div key={row.userId} className={`btt-lb-row${row.isUser ? " btt-lb-row--me" : ""}`}>
                    <span className="btt-lb-rank">{row.rank}</span>
                    <span className="btt-lb-row-ava">{initialOf(row.name)}</span>
                    <div className="min-w-0">
                      <LbName row={row} className="btt-lb-row-name" />
                      <span className={`btt-lb-row-tier ${tierColors[row.tier] ?? "text-muted-foreground"}`}>{row.tier}</span>
                    </div>
                    <div className="btt-lb-row-score">
                      <div className="btt-lb-row-num">{fmtScore(row.score)}</div>
                      <div className="btt-lb-row-sub">
                        {tab === "rating"
                          ? (wr !== null ? `${row.wins}W ${row.losses}L · ${wr}%` : `${row.wins ?? 0}W ${row.losses ?? 0}L`)
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
            <p className="btt-lb-foot">
              Not on the board yet — win ranked battles to climb in.
            </p>
          )}
        </>
      )}
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
    <motion.div className="btt-card btt-card--purple p-5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-neon-purple/10 border border-neon-purple/30 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-neon-purple" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="btt-shout text-xl">DAILY · {challenge.title.toUpperCase()}</h4>
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
    <section className="btt-shell min-h-screen pt-24 pb-16">
      <div className="btt-bg" aria-hidden>
        <div className="btt-aurora" />
        <div className="btt-grid" />
        <div className="btt-vignette" />
        <div className="btt-noise" />
      </div>
      <div className="max-w-7xl mx-auto px-6">
        <motion.div className="mb-14" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}>
          <div className="btt-arena-label mb-6">
            <Swords className="w-3 h-3 text-neon-pink" />
            CYBER-MATH ARENA
          </div>
          <h1 className="btt-title btt-shout text-7xl md:text-9xl mb-4">
            Knowledge{" "}
            <span className="text-neon-pink">Battles</span>
          </h1>
          <p className="btt-mono-text text-[13px] text-muted-foreground max-w-xl leading-relaxed">
            Choose your archetype. Solve equations under pressure.<br className="hidden md:block" />
            Build devastating combos. Review and learn from every fight.
          </p>
        </motion.div>

        <div className="space-y-6">
          <ChallengeInbox />
          <div className="relative">
            <div className="flex items-center justify-end gap-2 mb-3">
              <button
                onClick={() => setSearchOpen(true)}
                className="btt-ghost-btn btt-ghost-btn--cyan"
                aria-label="Find player"
              >
                <Users className="w-3 h-3" /> FIND PLAYER
              </button>
              <button
                onClick={() => setHowOpen(true)}
                className="btt-ghost-btn btt-ghost-btn--purple"
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
