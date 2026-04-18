import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Swords, Zap, Trophy, Shield, Flame, Timer, Sparkles,
  Target, Heart, Skull, Dices, User, Bot,
} from "lucide-react";

import type { Phase, Action, ArchetypeId, Fighter, MathQuestion, QuestionRecord, BattleStats, ActionConfig } from "./battles/types";
import { generateQuestion, TIMER_DURATIONS } from "./battles/questions";
import { statToHp, statToTimeMult, statToDmgMult, statToStreakMult, statToDifficulty, statToSelfDmgMult } from "./battles/stat-mechanics";
import { ARCHETYPES } from "./battles/archetypes";
import { ClassSelectDialog, type ClassSelection } from "./battles/ClassSelectDialog";
import { BattleReport } from "./battles/BattleReport";
import { ECLIPTARS, type Ecliptar } from "@/lib/ecliptars";
import { supabase } from "@/integrations/supabase/client";

// ─── Action Config ───────────────────────────────────────────────────
const ACTIONS: Record<Action, ActionConfig> = {
  attack: { label: "Attack", icon: Swords, difficulty: "medium", dmg: 15, focusCost: 0, desc: "Deal 15 DMG" },
  defend: { label: "Defend", icon: Shield, difficulty: "easy", dmg: 0, focusCost: 0, desc: "Heal 10 HP" },
  charge: { label: "Charge", icon: Zap, difficulty: "hard", dmg: 25, focusCost: 0, desc: "Deal 25 DMG" },
  wild:   { label: "Wild",   icon: Dices, difficulty: "medium", dmg: 0, focusCost: 10, desc: "Random effect" },
};

type LeaderboardEntry = { rank: number; name: string; xp: number; tier: string };

function xpToTier(xp: number): string {
  if (xp >= 20000) return "Grandmaster";
  if (xp >= 10000) return "Diamond";
  if (xp >= 5000) return "Platinum";
  if (xp >= 1000) return "Gold";
  return "Silver";
}

const tierColors: Record<string, string> = {
  Grandmaster: "text-neon-pink", Diamond: "text-neon-cyan", Platinum: "text-neon-purple", Gold: "text-yellow-400", Silver: "text-muted-foreground",
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
  const [player, setPlayer] = useState<Fighter>({ name: "You", hp: 100, maxHp: 100, focus: 50, maxFocus: 50, icon: User });
  const [opponent, setOpponent] = useState<Fighter>({ name: "AI_Nemesis", hp: 100, maxHp: 100, focus: 50, maxFocus: 50, icon: Bot });
  const [momentum, setMomentum] = useState(0);
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
        setPlayer(prev => ({ ...prev, hp: Math.min(prev.maxHp, prev.hp + healAmt), focus: Math.min(prev.maxFocus, prev.focus + 10) }));
        setShowPlayerHeal(true);
        addLog(`✅ Correct! Defend: +${heal} HP, +10 Focus.`);
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
        setShowOpponentHit(true);
        addLog(`✅ ${action.label}: ${dmg} DMG!${currentStreakMult > 1.1 ? ` 🔥 ${currentStreakMult.toFixed(1)}x STREAK!` : ""}`);
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
  }, [totalScore, records, longestStreak, fastestAnswer, archetype]);

  const aiTurn = useCallback(() => {
    const oppArch = getArch(opponentArchetype);
    const dmgMult = statToDmgMult(oppArch.stats.damage);
    const aiDmg = Math.floor((Math.floor(Math.random() * 8) + 5) * dmgMult);
    setTimeout(() => {
      setPlayer(prev => {
        const newHp = Math.max(0, prev.hp - aiDmg);
        addLog(`${opponent.name} strikes: -${aiDmg} HP.`);
        setShowPlayerHit(true);
        setTimeout(() => {
          setShowPlayerHit(false);
          if (newHp <= 0) { finishBattle(false); } else { setPhase("select"); }
        }, 600);
        return { ...prev, hp: newHp };
      });
    }, 400);
  }, [addLog, finishBattle, opponentArchetype, opponent.name]);

  const selectAction = (action: Action) => {
    if (action === "wild" && player.focus < 10) { addLog("⚠️ Not enough Focus!"); return; }
    setCurrentAction(action);
    if (action === "wild") setPlayer(prev => ({ ...prev, focus: prev.focus - 10 }));

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

    // Pick a random Ecliptar opponent (different archetype if possible)
    const candidates = ECLIPTARS.filter(e => e.archetype !== cls);
    const oppEclip = candidates[Math.floor(Math.random() * candidates.length)] ?? ECLIPTARS[0];
    const oppArch = ARCHETYPES[oppEclip.archetype];
    setOpponentArchetype(oppEclip.archetype);

    setPhase("searching");
    setTimeout(() => {
      const baseArch = ARCHETYPES[cls];
      const playerStats = rolledGambler ?? baseArch.stats;
      const playerHp = statToHp(playerStats.health);
      const playerName = eclip?.name ?? "You";
      const playerIcon = eclip?.icon ?? User;
      const oppHp = statToHp(oppArch.stats.health);
      setPlayer({ name: playerName, hp: playerHp, maxHp: playerHp, focus: 50, maxFocus: 50, icon: playerIcon });
      setOpponent({ name: oppEclip.name, hp: oppHp, maxHp: oppHp, focus: 50, maxFocus: 50, icon: oppEclip.icon });
      setMomentum(0); setLogs([]); setTotalScore(0); setRecords([]); setLongestStreak(0); setFastestAnswer(Infinity); setBattleStats(null);
      setPhase("select");
      addLog(`⚔️ ${playerName} (${baseArch.name}) vs ${oppEclip.name} (${oppArch.name})!`);
      if (rolledGambler) {
        addLog(`🎲 Gambler rolled: HP ${rolledGambler.health}/4 · TIME ${rolledGambler.time}/4 · DMG ${rolledGambler.damage}/4 · MULT ${rolledGambler.multiplier}/4 · DIFF ${rolledGambler.difficulty}/4`);
      }
    }, 2200);
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
        <h3 className="text-xl font-bold font-display mb-1">Matching opponent...</h3>
        <p className={`inline-flex items-center gap-1 text-xs font-bold ${arch.color}`}><arch.icon className="w-3.5 h-3.5" /> {arch.name}</p>
        <motion.div className="flex justify-center gap-1 mt-4" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }}>
          {[0, 1, 2].map(i => <div key={i} className="w-2 h-2 bg-neon-pink rounded-full" />)}
        </motion.div>
      </motion.div>
    );
  }

  // ── Result ──
  if (phase === "result" && battleStats) {
    return <BattleReport stats={battleStats} onRematch={() => setPhase("classSelect")} onBack={reset} />;
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
            const disabled = phase !== "select" || (key === "wild" && player.focus < 10);
            return (
              <motion.button key={key} onClick={() => selectAction(key)} disabled={disabled}
                className={`glass-panel p-4 text-center transition-colors ${disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-neon-purple/5 hover:border-neon-purple/30"}`}
                whileHover={!disabled ? { scale: 1.03, y: -2 } : {}} whileTap={!disabled ? { scale: 0.97 } : {}}
              >
                <Icon className={`w-6 h-6 mx-auto mb-1 ${key === "charge" ? "text-neon-pink" : key === "defend" ? "text-neon-cyan" : key === "wild" ? "text-neon-purple" : "text-foreground"}`} />
                <div className="text-[10px] font-bold tracking-widest">{act.label.toUpperCase()}</div>
                <div className="text-[9px] text-muted-foreground mt-0.5">{act.desc}</div>
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
      const rows: LeaderboardEntry[] = (data ?? []).map((r, i) => ({
        rank: i + 1,
        name: `learner_${r.user_id.slice(0, 6)}`,
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
        {!loading && entries.length === 0 && (
          <p className="text-[10px] text-muted-foreground italic px-3">No fighters yet — be the first to climb the ranks.</p>
        )}
        {entries.map(p => (
          <div key={p.rank} className="flex items-center gap-3 px-3 py-2 border border-transparent hover:bg-secondary/30 transition-colors">
            <span className={`text-xs font-bold w-5 text-center ${p.rank <= 3 ? "text-neon-pink" : "text-muted-foreground"}`}>{p.rank}</span>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-bold text-foreground truncate">{p.name}</span>
              <span className={`text-[10px] ml-2 font-bold ${tierColors[p.tier]}`}>{p.tier}</span>
            </div>
            <div className="text-xs font-bold text-foreground">{p.xp.toLocaleString()} XP</div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────
export function KnowledgeBattles() {
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

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3"><BattleArena /></div>
          <div className="lg:col-span-2 space-y-4">
            <motion.div className="glass-panel p-6" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
              <h3 className="text-sm font-bold font-display tracking-widest mb-4 text-neon-purple">ARCHETYPES</h3>
              <div className="space-y-3">
                {Object.values(ARCHETYPES).map(a => (
                  <div key={a.id} className="flex items-start gap-3">
                    <a.icon className={`w-4 h-4 mt-0.5 ${a.color}`} />
                    <div>
                      <span className={`text-xs font-bold ${a.color}`}>{a.name}</span>
                      <p className="text-[10px] text-muted-foreground">{a.passive}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            <LeaderboardCard />

            <motion.div className="glass-panel p-5 border border-neon-purple/20" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-neon-purple/10 border border-neon-purple/30 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-neon-purple" />
                </div>
                <div>
                  <h4 className="text-xs font-bold tracking-widest">DAILY CHALLENGE</h4>
                  <p className="text-[10px] text-muted-foreground">Win 3 battles today for 2x XP bonus</p>
                </div>
                <div className="ml-auto text-lg font-bold font-display text-neon-purple">0/3</div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
