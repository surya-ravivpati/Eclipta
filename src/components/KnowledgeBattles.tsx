import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Swords, Zap, Trophy, Shield, Flame, Timer, Sparkles,
  Target, Heart, Skull, Dices, User, Bot, HelpCircle, Info,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import type { Phase, Action, ArchetypeId, Fighter, MathQuestion, QuestionRecord, BattleStats, ActionConfig } from "./battles/types";
import { generateQuestion, TIMER_DURATIONS } from "./battles/questions";
import { statToHp, statToTimeMult, statToDmgMult, statToStreakMult, statToDifficulty, statToSelfDmgMult } from "./battles/stat-mechanics";
import { ARCHETYPES } from "./battles/archetypes";
import { ClassSelectDialog, type ClassSelection } from "./battles/ClassSelectDialog";
import { BattleReport } from "./battles/BattleReport";
import { ECLIPTARS, type Ecliptar } from "@/lib/ecliptars";
import { supabase } from "@/integrations/supabase/client";
import { getTodayChallenge } from "@/lib/daily-challenge";

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

/**
 * Per-archetype Focus pool tuning. Focus is the resource that gates Charge / Wild.
 * - Speedster: small pool, fast spender — encourages quick combos
 * - Tank / Healer: large pool, slower payoff
 * - Chud: huge pool because Charge is its identity
 * - Gambler: standard 100 (its randomness lives elsewhere)
 */
function archetypeFocusPool(id: ArchetypeId): number {
  switch (id) {
    case "speedster": return 60;
    case "tank": return 120;
    case "healer": return 110;
    case "chud": return 140;
    case "fulcrum": return 100;
    case "accelerator": return 90;
    case "god": return 130;
    case "gambler": return 100;
  }
}
function archetypeStartFocus(id: ArchetypeId): number {
  return id === "chud" ? 40 : id === "speedster" ? 10 : 20;
}
const ACTIONS: Record<Action, ActionConfig> = {
  attack: { label: "Attack", icon: Swords, difficulty: "medium", dmg: 18, focusCost: 0,  desc: "18 DMG · +15 Focus" },
  defend: { label: "Heal",   icon: Heart,  difficulty: "easy",   dmg: 0,  focusCost: 0,  desc: "Restore HP · +10 Focus" },
  charge: { label: "Charge", icon: Zap,    difficulty: "hard",   dmg: 32, focusCost: 25, desc: "32 DMG · −25 Focus" },
  wild:   { label: "Wild",   icon: Dices,  difficulty: "medium", dmg: 0,  focusCost: 15, desc: "Random · −15 Focus" },
};

type LeaderboardEntry = { rank: number; name: string; xp: number; tier: string };

// Aligned with Trophy Road tier thresholds in src/lib/trophy-road-data.ts
function xpToTier(xp: number): string {
  if (xp >= 40000) return "God Tier";
  if (xp >= 25000) return "Unreal";
  if (xp >= 16000) return "Champion";
  if (xp >= 10000) return "Platinum";
  if (xp >= 6000) return "Diamond";
  if (xp >= 3000) return "Gold";
  if (xp >= 1000) return "Silver";
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

// ─── Sub-components ──────────────────────────────────────────────────
function HpBar({ current, max, color, label }: { current: number; max: number; color: string; label: string }) {
  const pct = Math.max(0, (current / max) * 100);
  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-1">
        <span className="text-[10px] font-bold tracking-widest text-muted-foreground">{label}</span>
        <div className="flex items-center gap-1">
          <Heart className="w-3 h-3 text-neon-pink" />
          <span className="text-xs font-bold font-display">{current}/{max}</span>
        </div>
      </div>
      <div className="h-3 bg-secondary/60 overflow-hidden border border-border/50">
        <motion.div className={`h-full ${color}`} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: "easeOut" }} />
      </div>
    </div>
  );
}

function FocusBar({ current, max }: { current: number; max: number }) {
  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-1">
        <span className="text-[10px] font-bold tracking-widest text-muted-foreground">FOCUS</span>
        <span className="text-xs font-bold font-display text-neon-purple">{current}/{max}</span>
      </div>
      <div className="flex gap-0.5">
        {Array.from({ length: max / 10 }).map((_, i) => (
          <div key={i} className={`h-2 flex-1 transition-colors duration-300 ${i < current / 10 ? "bg-neon-purple" : "bg-secondary/40"}`} />
        ))}
      </div>
    </div>
  );
}

function FighterCard({ fighter, side, momentum, archetype, showHit, showHeal }: {
  fighter: Fighter; side: "left" | "right"; momentum: number; archetype?: ArchetypeId; showHit: boolean; showHeal: boolean;
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
            {side === "left" && arch && (
              <span className={`inline-flex items-center gap-1 text-[9px] font-bold tracking-widest ${arch.color}`}>
                <arch.icon className="w-3 h-3" /> {arch.name.toUpperCase()}
              </span>
            )}
            {side === "left" && momentum > 0 && (
              <motion.div className="flex items-center gap-1 text-neon-pink" key={momentum} initial={{ scale: 1.3 }} animate={{ scale: 1 }}>
                <Flame className="w-3 h-3" />
                <span className="text-[10px] font-bold tracking-widest">{momentum}x STREAK</span>
              </motion.div>
            )}
          </div>
        </div>
        <HpBar current={fighter.hp} max={fighter.maxHp} color={side === "left" ? "bg-neon-cyan" : "bg-neon-pink"} label="HP" />
        <div className="mt-2"><FocusBar current={fighter.focus} max={fighter.maxFocus} /></div>
      </div>
      <AnimatePresence>
        {side === "left" && momentum > 0 && momentum % comboThreshold === 0 && (
          <motion.div className="absolute top-2 right-2 text-neon-pink" initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }}>
            <Sparkles className="w-6 h-6" />
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
  const startTimeRef = useRef(Date.now());
  const pct = (timeLeft / maxTime) * 100;

  const handleSelect = (val: number) => {
    if (selected !== null) return;
    setSelected(val);
    const spent = (Date.now() - startTimeRef.current) / 1000;
    setTimeout(() => onAnswer(val === question.answer, spent), 600);
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
        <h3 className="text-3xl font-bold font-display text-center mb-8 text-foreground">{question.q} = ?</h3>
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
      </motion.div>
    </motion.div>
  );
}

function BattleLog({ logs }: { logs: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollTo(0, ref.current.scrollHeight); }, [logs]);
  return (
    <div ref={ref} className="glass-panel p-3 h-24 overflow-y-auto space-y-1">
      {logs.length === 0 && <p className="text-[10px] text-muted-foreground italic">Battle log will appear here...</p>}
      {logs.map((l, i) => (
        <motion.p key={i} className="text-[11px] text-muted-foreground" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>{l}</motion.p>
      ))}
    </div>
  );
}

// ─── Main Battle Engine ──────────────────────────────────────────────
function BattleArena() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [archetype, setArchetype] = useState<ArchetypeId>("speedster");
  const [opponentArchetype, setOpponentArchetype] = useState<ArchetypeId>("tank");
  const [player, setPlayer] = useState<Fighter>({ name: "You", hp: 100, maxHp: 100, focus: 20, maxFocus: 100, icon: User });
  const [opponent, setOpponent] = useState<Fighter>({ name: "AI_Nemesis", hp: 100, maxHp: 100, focus: 20, maxFocus: 100, icon: Bot });
  const [momentum, setMomentum] = useState(0);
  const [opponentMomentum, setOpponentMomentum] = useState(0);
  const [currentAction, setCurrentAction] = useState<Action | null>(null);
  const [question, setQuestion] = useState<MathQuestion | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [maxTime, setMaxTime] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [showPlayerHit, setShowPlayerHit] = useState(false);
  const [showOpponentHit, setShowOpponentHit] = useState(false);
  const [showPlayerHeal, setShowPlayerHeal] = useState(false);
  const [totalScore, setTotalScore] = useState(0);
  const [records, setRecords] = useState<QuestionRecord[]>([]);
  const [longestStreak, setLongestStreak] = useState(0);
  const [fastestAnswer, setFastestAnswer] = useState(Infinity);
  const [battleStats, setBattleStats] = useState<BattleStats | null>(null);
  const [gamblerStats, setGamblerStats] = useState<{ health: number; time: number; damage: number; multiplier: number; difficulty: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [playerXp, setPlayerXp] = useState<number>(0);

  // Fetch player XP for tier display only (no longer used for matchmaking)
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("user_profiles")
        .select("xp")
        .eq("user_id", user.id)
        .maybeSingle();
      setPlayerXp((data as any)?.xp ?? 0);
    })();
  }, []);

  // Returns archetype, with stats overridden by per-battle randomized stats for gambler
  const getArch = useCallback((id: ArchetypeId) => {
    const base = ARCHETYPES[id];
    if (id === "gambler" && gamblerStats) return { ...base, stats: gamblerStats };
    return base;
  }, [gamblerStats]);

  const comboThreshold = archetype === "fulcrum" ? 2 : 3;
  const addLog = useCallback((msg: string) => setLogs(prev => [...prev, msg]), []);

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

    const record: QuestionRecord = { question, correct, timeSpent, action: currentAction };
    setRecords(prev => [...prev, record]);
    // Feed Luna's adaptive context (timeSpent is in seconds, recordAnswer expects ms).
    void import("@/lib/luna-context").then(({ recordAnswer, updateLunaContext }) => {
      recordAnswer(correct, timeSpent * 1000);
      updateLunaContext({ lessonTitle: question.topic, difficulty: question.difficulty });
    });

    if (correct && timeSpent < fastestAnswer) setFastestAnswer(timeSpent);

    const action = ACTIONS[currentAction];
    const arch = getArch(archetype);
    const streakMult = statToStreakMult(arch.stats.multiplier);
    // Multiplier grows with streak length
    const currentStreakMult = momentum > 0 ? 1 + (momentum * (streakMult - 1)) : 1;

    setPhase("animate");

    if (correct) {
      const newMom = momentum + 1;
      setMomentum(newMom);
      if (newMom > longestStreak) setLongestStreak(newMom);

      if (currentAction === "defend") {
        const healAmt = archetype === "healer" ? 20 : 10;
        const heal = Math.min(healAmt, player.maxHp - player.hp);
        const gain = FOCUS_GAIN.defend;
        setPlayer(prev => ({ ...prev, hp: Math.min(prev.maxHp, prev.hp + healAmt), focus: Math.min(prev.maxFocus, prev.focus + gain) }));
        setShowPlayerHeal(true);
        addLog(`✅ Defend: +${heal} HP, +${gain} Focus.`);
      } else if (currentAction === "wild") {
        const effects = [
          () => { const d = Math.floor(Math.random() * 30) + 10; setOpponent(prev => ({ ...prev, hp: Math.max(0, prev.hp - d) })); setShowOpponentHit(true); addLog(`🎲 Wild: ${d} random DMG!`); },
          () => { setPlayer(prev => ({ ...prev, hp: Math.min(prev.maxHp, prev.hp + 20) })); setShowPlayerHeal(true); addLog(`🎲 Wild: +20 HP!`); },
          () => { const d = 20; setOpponent(prev => ({ ...prev, hp: Math.max(0, prev.hp - d) })); setShowOpponentHit(true); addLog(`🎲 Wild: ${d} DMG + 20 Focus!`); },
        ];
        effects[Math.floor(Math.random() * effects.length)]();
      } else {
        let baseDmg = action.dmg;
        // Apply damage stat multiplier
        // Damage uses stat multiplier (gambler's damage stat is randomized per battle in startBattle)
        const dmgMult = statToDmgMult(arch.stats.damage);
        baseDmg = Math.floor(baseDmg * dmgMult);
        // Accelerator scaling bonus
        if (archetype === "accelerator") {
          baseDmg = Math.floor(baseDmg * (1 + records.length * 0.1));
        }
        // Apply streak multiplier
        const dmg = Math.floor(baseDmg * currentStreakMult);
        setOpponent(prev => ({ ...prev, hp: Math.max(0, prev.hp - dmg) }));
        const focusGain = FOCUS_GAIN[currentAction];
        if (focusGain > 0) {
          setPlayer(prev => ({ ...prev, focus: Math.min(prev.maxFocus, prev.focus + focusGain) }));
        }
        setShowOpponentHit(true);
        const focusNote = focusGain > 0 ? ` +${focusGain} Focus.` : "";
        addLog(`✅ ${action.label}: ${dmg} DMG!${focusNote}${currentStreakMult > 1.1 ? ` 🔥 ${currentStreakMult.toFixed(1)}x STREAK!` : ""}`);
      }
      setTotalScore(prev => prev + (currentAction === "charge" ? 150 : currentAction === "attack" ? 100 : 75) * currentStreakMult);
    } else {
      setMomentum(0);
      let counterDmg = Math.floor(Math.random() * 10) + 8;
      // Apply self-damage reduction based on health stat
      counterDmg = Math.floor(counterDmg * statToSelfDmgMult(arch.stats.health));
      // Healer passive: recover some HP on getting hit
      if (archetype === "healer") {
        const healAmt = Math.floor(counterDmg * 0.3);
        setPlayer(prev => ({ ...prev, hp: Math.min(prev.maxHp, prev.hp + healAmt) }));
      }
      setPlayer(prev => ({ ...prev, hp: Math.max(0, prev.hp - counterDmg) }));
      setShowPlayerHit(true);
      addLog(`❌ ${timeSpent >= maxTime ? "Time's up!" : "Wrong!"} -${counterDmg} HP. Streak reset.${arch.stats.health >= 3 ? " 🛡️ Reduced!" : ""}`);
    }

    setTimeout(() => {
      setShowPlayerHit(false);
      setShowOpponentHit(false);
      setShowPlayerHeal(false);

      setOpponent(prev => {
        if (prev.hp <= 0) {
          finishBattle(true);
          return prev;
        }
        setPlayer(prevP => {
          if (prevP.hp <= 0) { finishBattle(false); return prevP; }
          aiTurn();
          return prevP;
        });
        return prev;
      });
    }, 800);
  }, [currentAction, momentum, player, totalScore, timeLeft, maxTime, question, archetype, longestStreak, fastestAnswer]);

  const finishBattle = useCallback((won: boolean) => {
    const xp = won ? Math.floor(totalScore * 0.8) + 200 : Math.floor(totalScore * 0.2);
    setBattleStats({
      totalQuestions: records.length + 1, // +1 for the final answer
      correctAnswers: records.filter(r => r.correct).length + (won ? 1 : 0),
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
            .update({ wins: newWins, bonus_claimed: existing.bonus_claimed || newWins >= challenge.target })
            .eq("id", existing.id);
        } else {
          await supabase.from("daily_challenge_progress").insert({
            user_id: user.id,
            challenge_date: today,
            wins: 1,
            bonus_claimed: 1 >= challenge.target,
          });
        }
        window.dispatchEvent(new Event("daily-challenge-updated"));
      }
    })();
  }, [totalScore, records, longestStreak, fastestAnswer, archetype]);

  const aiTurn = useCallback(() => {
    const oppArch = getArch(opponentArchetype);
    const dmgMult = statToDmgMult(oppArch.stats.damage);
    const streakMult = statToStreakMult(oppArch.stats.multiplier);

    setTimeout(() => {
      // ── Bot decision logic: pick Attack / Heal / Charge / Wild based on state ──
      setOpponent(prevOpp => {
        setPlayer(prevPlayer => {
          const hpPct = prevOpp.hp / prevOpp.maxHp;
          const focus = prevOpp.focus;
          const playerHpPct = prevPlayer.hp / prevPlayer.maxHp;

          // Choose action
          let choice: Action = "attack";
          if (hpPct < 0.35 && prevOpp.hp < prevOpp.maxHp) {
            // Low HP — prefer Heal if affordable, but finisher Charge if player almost dead
            choice = (focus >= 25 && playerHpPct < 0.3) ? "charge" : "defend";
          } else if (focus >= 25 && (playerHpPct < 0.5 || Math.random() < 0.45)) {
            choice = "charge"; // payoff move
          } else if (focus >= 15 && Math.random() < 0.12) {
            choice = "wild"; // occasional gamble
          } else {
            choice = "attack"; // default focus builder
          }
          // Healer archetype loves to defend
          if (opponentArchetype === "healer" && hpPct < 0.7 && Math.random() < 0.4) choice = "defend";
          // Chud always charges if it can
          if (opponentArchetype === "chud" && focus >= 25) choice = "charge";

          // Bot success rate scales inversely with question difficulty stat
          const baseAcc = 0.78 - oppArch.stats.difficulty * 0.05;
          const success = Math.random() < Math.max(0.45, baseAcc);

          let newPlayerHp = prevPlayer.hp;
          let newOppHp = prevOpp.hp;
          let newOppFocus = prevOpp.focus;
          let nextOppMom = opponentMomentum;

          if (success) {
            nextOppMom = opponentMomentum + 1;
            const sMult = nextOppMom > 1 ? 1 + ((nextOppMom - 1) * (streakMult - 1)) : 1;

            if (choice === "defend") {
              const healAmt = opponentArchetype === "healer" ? 20 : 10;
              newOppHp = Math.min(prevOpp.maxHp, prevOpp.hp + healAmt);
              newOppFocus = Math.min(prevOpp.maxFocus, prevOpp.focus + FOCUS_GAIN.defend);
              addLog(`💚 ${prevOpp.name} heals: +${healAmt} HP, +${FOCUS_GAIN.defend} Focus.`);
            } else if (choice === "wild") {
              newOppFocus = Math.max(0, prevOpp.focus - 15);
              const roll = Math.random();
              if (roll < 0.34) {
                const d = Math.floor(Math.random() * 30) + 10;
                newPlayerHp = Math.max(0, prevPlayer.hp - d);
                setShowPlayerHit(true);
                addLog(`🎲 ${prevOpp.name} Wild: ${d} chaos DMG!`);
              } else if (roll < 0.67) {
                newOppHp = Math.min(prevOpp.maxHp, prevOpp.hp + 20);
                addLog(`🎲 ${prevOpp.name} Wild: +20 HP!`);
              } else {
                const d = 20;
                newPlayerHp = Math.max(0, prevPlayer.hp - d);
                setShowPlayerHit(true);
                addLog(`🎲 ${prevOpp.name} Wild: ${d} DMG.`);
              }
            } else {
              const baseDmg = ACTIONS[choice].dmg;
              const dmg = Math.floor(baseDmg * dmgMult * sMult);
              newPlayerHp = Math.max(0, prevPlayer.hp - dmg);
              const cost = ACTIONS[choice].focusCost;
              if (cost > 0) newOppFocus = Math.max(0, prevOpp.focus - cost);
              const gain = FOCUS_GAIN[choice];
              if (gain > 0) newOppFocus = Math.min(prevOpp.maxFocus, newOppFocus + gain);
              setShowPlayerHit(true);
              const streakNote = sMult > 1.1 ? ` 🔥 ${sMult.toFixed(1)}x` : "";
              addLog(`⚔️ ${prevOpp.name} ${ACTIONS[choice].label}: ${dmg} DMG.${streakNote}`);
            }
          } else {
            nextOppMom = 0;
            // Bot fluffs answer — small self-damage
            const flub = Math.floor((Math.floor(Math.random() * 6) + 4) * statToSelfDmgMult(oppArch.stats.health));
            newOppHp = Math.max(0, prevOpp.hp - flub);
            addLog(`❌ ${prevOpp.name} fluffs ${ACTIONS[choice].label}: -${flub} HP.`);
          }

          setOpponentMomentum(nextOppMom);
          setTimeout(() => {
            setShowPlayerHit(false);
            if (newPlayerHp <= 0) { finishBattle(false); }
            else if (newOppHp <= 0) { finishBattle(true); }
            else { setPhase("select"); }
          }, 600);

          // Update opponent in same pass
          setOpponent(o => ({ ...o, hp: newOppHp, focus: newOppFocus }));
          return { ...prevPlayer, hp: newPlayerHp };
        });
        return prevOpp;
      });
    }, 400);
  }, [addLog, finishBattle, opponentArchetype, opponentMomentum, getArch]);

  const selectAction = (action: Action) => {
    const cost = ACTIONS[action].focusCost;
    if (cost > 0 && player.focus < cost) { addLog(`⚠️ Need ${cost} Focus!`); return; }
    setCurrentAction(action);
    if (cost > 0) setPlayer(prev => ({ ...prev, focus: Math.max(0, prev.focus - cost) }));

    const arch = getArch(archetype);
    const baseDiff = action === "wild" ? (["easy", "medium", "hard"] as const)[Math.floor(Math.random() * 3)] : ACTIONS[action].difficulty;
    const effectiveDiff = statToDifficulty(baseDiff, arch.stats.difficulty);
    const q = generateQuestion(effectiveDiff);
    setQuestion(q);
    let t = TIMER_DURATIONS[effectiveDiff];
    // Apply time stat multiplier (gambler's time stat is already randomized per battle)
    t = Math.max(4, Math.round(t * statToTimeMult(arch.stats.time)));
    setMaxTime(t);
    setTimeLeft(t);
    setPhase("question");
  };

  const [ecliptar, setEcliptar] = useState<Ecliptar | null>(null);

  const startBattle = (selection?: ClassSelection) => {
    const cls = selection?.archetype || archetype;
    const eclip = selection?.ecliptar ?? ecliptar;
    if (selection?.archetype) setArchetype(selection.archetype);
    if (selection?.ecliptar) setEcliptar(selection.ecliptar);

    // Randomize gambler stats per battle (each 0-4) — true gamble between godlike and garbage
    const rolledGambler = cls === "gambler"
      ? {
          health: Math.floor(Math.random() * 5),
          time: Math.floor(Math.random() * 5),
          damage: Math.floor(Math.random() * 5),
          multiplier: Math.floor(Math.random() * 5),
          difficulty: Math.floor(Math.random() * 5),
        }
      : null;
    setGamblerStats(rolledGambler);

    // Random opponent — rank-based matchmaking removed.
    setPhase("searching");
    const oppEclip: Ecliptar = pickOpponent(cls);
    const oppArch = ARCHETYPES[oppEclip.archetype];
    setOpponentArchetype(oppEclip.archetype);

    setTimeout(() => {
      const baseArch = ARCHETYPES[cls];
      const playerStats = rolledGambler ?? baseArch.stats;
      const playerHp = statToHp(playerStats.health);
      const playerName = eclip?.name ?? "You";
      const playerIcon = eclip?.icon ?? User;
      const oppHp = statToHp(oppArch.stats.health);
      const playerPool = archetypeFocusPool(cls);
      const oppPool = archetypeFocusPool(oppEclip.archetype);
      setPlayer({ name: playerName, hp: playerHp, maxHp: playerHp, focus: archetypeStartFocus(cls), maxFocus: playerPool, icon: playerIcon });
      setOpponent({ name: oppEclip.name, hp: oppHp, maxHp: oppHp, focus: archetypeStartFocus(oppEclip.archetype), maxFocus: oppPool, icon: oppEclip.icon });
      setMomentum(0); setOpponentMomentum(0); setLogs([]); setTotalScore(0); setRecords([]); setLongestStreak(0); setFastestAnswer(Infinity); setBattleStats(null);
      setPhase("select");
      addLog(`⚔️ ${playerName} (${baseArch.name}) vs ${oppEclip.name} (${oppArch.name})!`);
      if (rolledGambler) {
        addLog(`🎲 Gambler rolled: HP ${rolledGambler.health}/4 · TIME ${rolledGambler.time}/4 · DMG ${rolledGambler.damage}/4 · MULT ${rolledGambler.multiplier}/4 · DIFF ${rolledGambler.difficulty}/4`);
      }
    }, 1100);
  };

  const reset = () => { setPhase("idle"); setBattleStats(null); };

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
    return (
      <motion.div className="glass-panel p-10 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <motion.div className="w-20 h-20 mx-auto mb-6 border-2 border-neon-pink/50 flex items-center justify-center"
          animate={{ rotate: 360, borderColor: ["oklch(0.6 0.24 350)", "oklch(0.55 0.25 290)", "oklch(0.75 0.15 180)", "oklch(0.6 0.24 350)"] }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
          <Target className="w-8 h-8 text-neon-pink" />
        </motion.div>
        <h3 className="text-xl font-bold font-display mb-1">Finding an opponent…</h3>
        <p className={`inline-flex items-center gap-1 text-xs font-bold ${arch.color}`}><arch.icon className="w-3.5 h-3.5" /> {arch.name}</p>
        <motion.div className="flex justify-center gap-1 mt-4" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }}>
          {[0, 1, 2].map(i => <div key={i} className="w-2 h-2 bg-neon-pink rounded-full" />)}
        </motion.div>
      </motion.div>
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
      />
    );
  }

  // ── Battle ──
  return (
    <div className="relative">
      <div className="flex gap-4 mb-4">
        <FighterCard fighter={player} side="left" momentum={momentum} archetype={archetype} showHit={showPlayerHit} showHeal={showPlayerHeal} />
        <div className="flex flex-col items-center justify-center px-2">
          <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ duration: 2, repeat: Infinity }}>
            <Swords className="w-6 h-6 text-neon-pink" />
          </motion.div>
          <span className="text-[10px] font-bold tracking-widest text-muted-foreground mt-1">VS</span>
        </div>
        <FighterCard fighter={opponent} side="right" momentum={0} showHit={showOpponentHit} showHeal={false} />
      </div>

      <div className="space-y-3">
        <div className="glass-panel p-3 flex items-center gap-3">
          <Flame className={`w-4 h-4 ${momentum > 0 ? "text-neon-pink" : "text-muted-foreground"}`} />
          <span className="text-[10px] font-bold tracking-widest text-muted-foreground">MOMENTUM</span>
          <div className="flex gap-1 flex-1">
            {Array.from({ length: comboThreshold }).map((_, i) => (
              <div key={i} className={`h-2 flex-1 transition-colors duration-300 ${
                i < momentum % comboThreshold || (momentum > 0 && momentum % comboThreshold === 0 && i < comboThreshold)
                  ? "bg-neon-pink" : "bg-secondary/40"
              }`} />
            ))}
          </div>
          {momentum >= comboThreshold && (
            <motion.span className="text-[10px] font-bold text-neon-pink tracking-widest" initial={{ scale: 0 }} animate={{ scale: 1 }} key={Math.floor(momentum / comboThreshold)}>
              x1.5 COMBO!
            </motion.span>
          )}
        </div>

        <div className="grid grid-cols-4 gap-2">
          {(Object.entries(ACTIONS) as [Action, ActionConfig][]).map(([key, act]) => {
            const Icon = act.icon;
            const cost = act.focusCost;
            const disabled = phase !== "select" || (cost > 0 && player.focus < cost);
            return (
              <motion.button key={key} onClick={() => selectAction(key)} disabled={disabled}
                className={`glass-panel p-5 text-center transition-colors relative ${disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-neon-purple/5 hover:border-neon-purple/30"}`}
                whileHover={!disabled ? { scale: 1.03, y: -2 } : {}} whileTap={!disabled ? { scale: 0.97 } : {}}
              >
                <Icon className={`w-7 h-7 mx-auto mb-1.5 ${key === "charge" ? "text-neon-pink" : key === "defend" ? "text-neon-cyan" : key === "wild" ? "text-neon-purple" : "text-foreground"}`} />
                <div className="text-xs font-bold tracking-widest">{act.label.toUpperCase()}</div>
                <div className="text-[10px] text-muted-foreground mt-1 leading-tight">{act.desc}</div>
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

// ─── Leaderboard (live) ───────────────────────────────────────────────
function LeaderboardCard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("user_profiles")
        .select("user_id, xp")
        .order("xp", { ascending: false })
        .limit(6);
      if (cancelled) return;
      const { data: data2 } = await supabase
        .from("user_profiles")
        .select("user_id, username, xp")
        .order("xp", { ascending: false })
        .limit(6);
      const rows: LeaderboardEntry[] = (data2 ?? data ?? []).map((r: { user_id: string; username?: string | null; xp: number | null }, i) => ({
        rank: i + 1,
        name: r.username || `learner_${r.user_id.slice(0, 6)}`,
        xp: r.xp ?? 0,
        tier: xpToTier(r.xp ?? 0),
      }));
      setEntries(rows);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <motion.div className="glass-panel p-6" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold font-display tracking-widest text-neon-cyan">LEADERBOARD</h3>
        <Trophy className="w-4 h-4 text-neon-cyan" />
      </div>
      <div className="space-y-2">
        {loading && <p className="text-[10px] text-muted-foreground italic px-3">Loading rankings…</p>}
        {!loading && entries.length < 3 && (
          <div className="px-3 py-4 border border-dashed border-neon-pink/40 bg-neon-pink/5 text-center">
            <p className="text-xs font-bold text-neon-pink mb-1">CLAIM THE THRONE</p>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              The arena is fresh. Win battles to be among the first names etched into the leaderboard.
            </p>
          </div>
        )}
        {entries.map(p => {
          const isUsername = /^[a-zA-Z0-9_]{3,20}$/.test(p.name);
          return (
            <div key={p.rank} className="flex items-center gap-3 px-3 py-2 border border-transparent hover:bg-secondary/30 transition-colors">
              <span className={`text-xs font-bold w-5 text-center ${p.rank <= 3 ? "text-neon-pink" : "text-muted-foreground"}`}>{p.rank}</span>
              <div className="flex-1 min-w-0">
                {isUsername ? (
                  <a href={`/u/${p.name}`} className="text-xs font-bold text-foreground truncate hover:text-neon-purple transition-colors">{p.name}</a>
                ) : (
                  <span className="text-xs font-bold text-foreground truncate">{p.name}</span>
                )}
                <span className={`text-[10px] ml-2 font-bold ${tierColors[p.tier]}`}>{p.tier}</span>
              </div>
              <div className="text-xs font-bold text-foreground">{p.xp.toLocaleString()} XP</div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ─── Daily Challenge (live) ───────────────────────────────────────────
function DailyChallengeCard() {
  const [wins, setWins] = useState(0);
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
              : complete
                ? `Bonus unlocked! 🎉 ${challenge.reward}`
                : `${challenge.goal} → ${challenge.reward}`}
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
  return (
    <section className="min-h-screen pt-24 pb-16">
      <div className="max-w-6xl mx-auto px-6">
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 relative">
            <button
              onClick={() => setHowOpen(true)}
              className="absolute -top-2 right-0 z-10 inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold tracking-widest text-neon-purple border border-neon-purple/40 bg-neon-purple/5 hover:bg-neon-purple/10 transition-colors"
              aria-label="Battle info"
            >
              <Info className="w-3.5 h-3.5" /> INFO
            </button>
            <BattleArena />
          </div>
          <div className="lg:col-span-1 space-y-4">
            <DailyChallengeCard />
            <LeaderboardCard />
          </div>
        </div>
      </div>

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
                <li>Every duel pulls a <span className="text-foreground font-bold">random Ecliptar opponent</span> — no rank gating, jump in instantly.</li>
                <li>Whenever possible, the opponent is a <span className="text-foreground font-bold">different archetype</span> than yours for variety.</li>
                <li>Your <span className="text-foreground font-bold">tier</span> still shows on your profile — earned XP feeds the Trophy Road, not matchmaking.</li>
              </ul>
            </section>

            <section>
              <h4 className="text-xs font-bold tracking-widest text-neon-cyan mb-2 flex items-center gap-1.5">
                <Swords className="w-3.5 h-3.5" /> COMBAT
              </h4>
              <ul className="space-y-1.5 text-muted-foreground leading-relaxed list-disc pl-5">
                <li><span className="text-foreground font-bold">Attack</span> — medium Q, 18 DMG and <span className="text-neon-cyan">+15 Focus</span>. Your bread-and-butter focus builder.</li>
                <li><span className="text-foreground font-bold">Defend</span> — easy Q, heals HP and <span className="text-neon-cyan">+10 Focus</span>.</li>
                <li><span className="text-foreground font-bold">Charge</span> — hard Q, 32 DMG but <span className="text-neon-purple">−25 Focus</span>. The payoff move.</li>
                <li><span className="text-foreground font-bold">Wild</span> — random effect for <span className="text-neon-purple">−15 Focus</span>.</li>
                <li><span className="text-neon-purple font-bold">Focus</span> is your resource — Attack/Defend build it, Charge/Wild spend it. Plan your rhythm.</li>
                <li>Correct answers grow <span className="text-neon-pink font-bold">Momentum</span>; each streak hit multiplies your damage.</li>
                <li>Wrong answers or timeouts reset Momentum and trigger a counter-attack.</li>
              </ul>
            </section>

            <section>
              <h4 className="text-xs font-bold tracking-widest text-neon-purple mb-2 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> ARCHETYPES & REWARDS
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
