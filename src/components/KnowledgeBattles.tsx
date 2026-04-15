import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Swords, Zap, Trophy, Shield, Flame, Crown, Timer, Sparkles,
  Target, TrendingUp, Heart, Star, Skull, Dices,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────
type Phase = "idle" | "searching" | "select" | "question" | "animate" | "result";
type Action = "attack" | "defend" | "charge" | "wild";

interface MathQuestion {
  q: string;
  answer: number;
  options: number[];
  difficulty: "easy" | "medium" | "hard";
}

interface Fighter {
  name: string;
  hp: number;
  maxHp: number;
  focus: number;
  maxFocus: number;
  avatar: string;
}

// ─── Math Question Generator ─────────────────────────────────────────
function generateQuestion(difficulty: "easy" | "medium" | "hard"): MathQuestion {
  const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

  let a: number, b: number, answer: number, q: string;

  if (difficulty === "easy") {
    a = rand(2, 20); b = rand(2, 20);
    const op = Math.random() > 0.5;
    if (op) { answer = a + b; q = `${a} + ${b}`; }
    else { if (a < b) [a] = [b]; answer = a - b; q = `${a} − ${b}`; }
  } else if (difficulty === "medium") {
    a = rand(3, 15); b = rand(3, 12);
    answer = a * b;
    q = `${a} × ${b}`;
  } else {
    const type = rand(0, 2);
    if (type === 0) { a = rand(2, 12); answer = a * a; q = `${a}²`; }
    else if (type === 1) { answer = rand(2, 15); a = answer * rand(2, 9); q = `${a} ÷ ${a / answer}`; }
    else { a = rand(5, 20); b = rand(5, 20); const c = rand(2, 10); answer = a + b * c; q = `${a} + ${b} × ${c}`; }
  }

  const options = new Set<number>([answer]);
  while (options.size < 4) {
    const offset = rand(1, Math.max(5, Math.abs(answer) || 5)) * (Math.random() > 0.5 ? 1 : -1);
    options.add(answer + offset);
  }

  return { q, answer, options: shuffle([...options]), difficulty };
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── Action Config ───────────────────────────────────────────────────
const ACTIONS: Record<Action, { label: string; icon: typeof Swords; difficulty: "easy" | "medium" | "hard"; dmg: number; focusCost: number; desc: string }> = {
  attack: { label: "Attack", icon: Swords, difficulty: "medium", dmg: 15, focusCost: 0, desc: "Deal 15 DMG" },
  defend: { label: "Defend", icon: Shield, difficulty: "easy", dmg: 0, focusCost: 0, desc: "Heal 10 HP" },
  charge: { label: "Charge", icon: Zap, difficulty: "hard", dmg: 25, focusCost: 0, desc: "Deal 25 DMG" },
  wild:   { label: "Wild",   icon: Dices, difficulty: "medium", dmg: 0, focusCost: 10, desc: "Random effect" },
};

const ACTION_EMOJIS: Record<Action, string> = { attack: "⚔️", defend: "🧱", charge: "⚡", wild: "🎲" };
const TIMER_DURATIONS: Record<"easy" | "medium" | "hard", number> = { easy: 10, medium: 12, hard: 15 };

const LEADERBOARD = [
  { rank: 1, name: "shadowKing", xp: 24800, wins: 312, tier: "Grandmaster" },
  { rank: 2, name: "byteCrusher", xp: 22100, wins: 287, tier: "Grandmaster" },
  { rank: 3, name: "nova_coder", xp: 19400, wins: 251, tier: "Diamond" },
  { rank: 4, name: "algo_beast", xp: 17200, wins: 223, tier: "Diamond" },
  { rank: 5, name: "ml_wanderer", xp: 15800, wins: 198, tier: "Platinum" },
  { rank: 6, name: "code_samurai", xp: 14100, wins: 176, tier: "Platinum" },
];

const tierColors: Record<string, string> = {
  Grandmaster: "text-neon-pink", Diamond: "text-neon-cyan", Platinum: "text-neon-purple", Gold: "text-yellow-400",
};

// ─── HP Bar Component ────────────────────────────────────────────────
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
        <motion.div
          className={`h-full ${color}`}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

// ─── Focus Bar ───────────────────────────────────────────────────────
function FocusBar({ current, max }: { current: number; max: number }) {
  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-1">
        <span className="text-[10px] font-bold tracking-widest text-muted-foreground">FOCUS</span>
        <span className="text-xs font-bold font-display text-neon-purple">{current}/{max}</span>
      </div>
      <div className="flex gap-0.5">
        {Array.from({ length: max / 10 }).map((_, i) => (
          <div
            key={i}
            className={`h-2 flex-1 transition-colors duration-300 ${
              i < current / 10 ? "bg-neon-purple" : "bg-secondary/40"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Fighter Card ────────────────────────────────────────────────────
function FighterCard({ fighter, side, momentum, showHit, showHeal }: {
  fighter: Fighter; side: "left" | "right"; momentum: number; showHit: boolean; showHeal: boolean;
}) {
  return (
    <motion.div
      className="glass-panel p-5 flex-1 relative overflow-hidden"
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

      <div className="relative z-10">
        {/* Avatar */}
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-12 h-12 border-2 flex items-center justify-center text-2xl ${
            side === "left" ? "border-neon-cyan/50 bg-neon-cyan/5" : "border-neon-pink/50 bg-neon-pink/5"
          }`}>
            {fighter.avatar}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-bold font-display text-sm truncate">{fighter.name}</h4>
            {side === "left" && momentum > 0 && (
              <motion.div
                className="flex items-center gap-1 text-neon-pink"
                key={momentum}
                initial={{ scale: 1.3 }}
                animate={{ scale: 1 }}
              >
                <Flame className="w-3 h-3" />
                <span className="text-[10px] font-bold tracking-widest">{momentum}x STREAK</span>
              </motion.div>
            )}
          </div>
        </div>

        <HpBar current={fighter.hp} max={fighter.maxHp} color={side === "left" ? "bg-neon-cyan" : "bg-neon-pink"} label="HP" />
        <div className="mt-2">
          <FocusBar current={fighter.focus} max={fighter.maxFocus} />
        </div>
      </div>

      {/* Combo indicator */}
      <AnimatePresence>
        {side === "left" && momentum > 0 && momentum % 3 === 0 && (
          <motion.div
            className="absolute top-2 right-2 text-neon-pink"
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0 }}
          >
            <Sparkles className="w-6 h-6" />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Question Overlay ────────────────────────────────────────────────
function QuestionOverlay({ question, timeLeft, maxTime, onAnswer }: {
  question: MathQuestion; timeLeft: number; maxTime: number; onAnswer: (correct: boolean) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const pct = (timeLeft / maxTime) * 100;

  const handleSelect = (val: number) => {
    if (selected !== null) return;
    setSelected(val);
    setTimeout(() => onAnswer(val === question.answer), 600);
  };

  return (
    <motion.div
      className="absolute inset-0 z-30 flex items-center justify-center bg-background/80 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="glass-panel p-8 max-w-lg w-full mx-4"
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
      >
        {/* Timer */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className={`text-[10px] font-bold tracking-widest ${
              question.difficulty === "hard" ? "text-neon-pink" : question.difficulty === "medium" ? "text-neon-purple" : "text-neon-cyan"
            }`}>
              {question.difficulty.toUpperCase()} QUESTION
            </span>
            <div className="flex items-center gap-1">
              <Timer className={`w-3.5 h-3.5 ${timeLeft <= 3 ? "text-neon-pink" : "text-muted-foreground"}`} />
              <span className={`text-sm font-bold font-display ${timeLeft <= 3 ? "text-neon-pink" : "text-foreground"}`}>{timeLeft}s</span>
            </div>
          </div>
          <div className="h-1.5 bg-secondary/60 overflow-hidden">
            <motion.div
              className={`h-full ${timeLeft <= 3 ? "bg-neon-pink" : "bg-neon-purple"}`}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        {/* Question */}
        <h3 className="text-3xl font-bold font-display text-center mb-8 text-foreground">{question.q} = ?</h3>

        {/* Options */}
        <div className="grid grid-cols-2 gap-3">
          {question.options.map((opt, i) => {
            let style = "border-border hover:border-neon-purple/60 hover:bg-neon-purple/5";
            if (selected !== null) {
              if (opt === question.answer) style = "border-neon-cyan bg-neon-cyan/10 text-neon-cyan";
              else if (opt === selected) style = "border-neon-pink bg-neon-pink/10 text-neon-pink";
              else style = "border-border opacity-40";
            }
            return (
              <motion.button
                key={i}
                onClick={() => handleSelect(opt)}
                disabled={selected !== null}
                className={`p-4 border text-xl font-bold font-display transition-colors ${style}`}
                whileHover={selected === null ? { scale: 1.03 } : {}}
                whileTap={selected === null ? { scale: 0.97 } : {}}
              >
                {opt}
              </motion.button>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Battle Log ──────────────────────────────────────────────────────
function BattleLog({ logs }: { logs: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollTo(0, ref.current.scrollHeight); }, [logs]);
  return (
    <div ref={ref} className="glass-panel p-3 h-24 overflow-y-auto space-y-1">
      {logs.length === 0 && <p className="text-[10px] text-muted-foreground italic">Battle log will appear here...</p>}
      {logs.map((l, i) => (
        <motion.p key={i} className="text-[11px] text-muted-foreground" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
          {l}
        </motion.p>
      ))}
    </div>
  );
}

// ─── Main Battle Engine ──────────────────────────────────────────────
function BattleArena() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [player, setPlayer] = useState<Fighter>({ name: "You", hp: 100, maxHp: 100, focus: 50, maxFocus: 50, avatar: "🧑‍💻" });
  const [opponent, setOpponent] = useState<Fighter>({ name: "AI_Nemesis", hp: 100, maxHp: 100, focus: 50, maxFocus: 50, avatar: "🤖" });
  const [momentum, setMomentum] = useState(0);
  const [currentAction, setCurrentAction] = useState<Action | null>(null);
  const [question, setQuestion] = useState<MathQuestion | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [maxTime, setMaxTime] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [showPlayerHit, setShowPlayerHit] = useState(false);
  const [showOpponentHit, setShowOpponentHit] = useState(false);
  const [showPlayerHeal, setShowPlayerHeal] = useState(false);
  const [xpGained, setXpGained] = useState(0);
  const [totalScore, setTotalScore] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const addLog = useCallback((msg: string) => setLogs(prev => [...prev, msg]), []);

  // Timer
  useEffect(() => {
    if (phase === "question" && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) { handleAnswer(false); return 0; }
          return prev - 1;
        });
      }, 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }
  }, [phase, question]);

  const handleAnswer = useCallback((correct: boolean) => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!currentAction) return;

    const action = ACTIONS[currentAction];
    const comboMultiplier = momentum > 0 && momentum % 3 === 0 ? 1.5 : 1;

    setPhase("animate");

    if (correct) {
      const newMomentum = momentum + 1;
      setMomentum(newMomentum);

      if (currentAction === "defend") {
        const heal = Math.min(10, player.maxHp - player.hp);
        setPlayer(prev => ({ ...prev, hp: Math.min(prev.maxHp, prev.hp + 10), focus: Math.min(prev.maxFocus, prev.focus + 10) }));
        setShowPlayerHeal(true);
        addLog(`✅ Correct! You defend and recover ${heal} HP + 10 Focus.`);
      } else if (currentAction === "wild") {
        const effects = [
          () => { const d = Math.floor(Math.random() * 30) + 10; setOpponent(prev => ({ ...prev, hp: Math.max(0, prev.hp - d) })); setShowOpponentHit(true); addLog(`🎲 Wild! Dealt ${d} random DMG!`); },
          () => { setPlayer(prev => ({ ...prev, hp: Math.min(prev.maxHp, prev.hp + 20) })); setShowPlayerHeal(true); addLog(`🎲 Wild! Healed 20 HP!`); },
          () => { const d = 20; setOpponent(prev => ({ ...prev, hp: Math.max(0, prev.hp - d) })); setShowOpponentHit(true); setPlayer(prev => ({ ...prev, focus: Math.min(prev.maxFocus, prev.focus + 20) })); addLog(`🎲 Wild! ${d} DMG + 20 Focus!`); },
        ];
        effects[Math.floor(Math.random() * effects.length)]();
      } else {
        const dmg = Math.floor(action.dmg * comboMultiplier);
        setOpponent(prev => ({ ...prev, hp: Math.max(0, prev.hp - dmg) }));
        setShowOpponentHit(true);
        addLog(`✅ Correct! ${ACTION_EMOJIS[currentAction]} ${action.label} deals ${dmg} DMG!${comboMultiplier > 1 ? " 🔥 COMBO x1.5!" : ""}`);
      }

      setTotalScore(prev => prev + (currentAction === "charge" ? 150 : currentAction === "attack" ? 100 : 75) * comboMultiplier);
    } else {
      setMomentum(0);
      const counterDmg = Math.floor(Math.random() * 10) + 8;
      setPlayer(prev => ({ ...prev, hp: Math.max(0, prev.hp - counterDmg) }));
      setShowPlayerHit(true);
      addLog(`❌ ${timeLeft <= 0 ? "Time's up!" : "Wrong!"} AI counterattacks for ${counterDmg} DMG. Streak reset.`);
    }

    setTimeout(() => {
      setShowPlayerHit(false);
      setShowOpponentHit(false);
      setShowPlayerHeal(false);

      // Check win/lose after state updates
      setOpponent(prev => {
        if (prev.hp <= 0) {
          setXpGained(Math.floor(totalScore * 0.8) + 200);
          setPhase("result");
          return prev;
        }
        setPlayer(prevP => {
          if (prevP.hp <= 0) {
            setXpGained(Math.floor(totalScore * 0.2));
            setPhase("result");
            return prevP;
          }
          // AI turn
          aiTurn();
          return prevP;
        });
        return prev;
      });
    }, 800);
  }, [currentAction, momentum, player, totalScore, timeLeft]);

  const aiTurn = useCallback(() => {
    const aiDmg = Math.floor(Math.random() * 8) + 5;
    setTimeout(() => {
      setPlayer(prev => {
        const newHp = Math.max(0, prev.hp - aiDmg);
        addLog(`🤖 AI strikes for ${aiDmg} DMG.`);
        setShowPlayerHit(true);
        setTimeout(() => {
          setShowPlayerHit(false);
          if (newHp <= 0) {
            setXpGained(Math.floor(totalScore * 0.2));
            setPhase("result");
          } else {
            setPhase("select");
          }
        }, 600);
        return { ...prev, hp: newHp };
      });
    }, 400);
  }, [totalScore, addLog]);

  const selectAction = (action: Action) => {
    if (action === "wild" && player.focus < 10) {
      addLog("⚠️ Not enough Focus for Wild!");
      return;
    }
    setCurrentAction(action);
    if (action === "wild") setPlayer(prev => ({ ...prev, focus: prev.focus - 10 }));

    const diff = action === "wild" ? (["easy", "medium", "hard"] as const)[Math.floor(Math.random() * 3)] : ACTIONS[action].difficulty;
    const q = generateQuestion(diff);
    setQuestion(q);
    const t = TIMER_DURATIONS[diff];
    setMaxTime(t);
    setTimeLeft(t);
    setPhase("question");
  };

  const startBattle = () => {
    setPhase("searching");
    setTimeout(() => {
      setPlayer({ name: "You", hp: 100, maxHp: 100, focus: 50, maxFocus: 50, avatar: "🧑‍💻" });
      setOpponent({ name: "AI_Nemesis", hp: 100, maxHp: 100, focus: 50, maxFocus: 50, avatar: "🤖" });
      setMomentum(0);
      setLogs([]);
      setTotalScore(0);
      setXpGained(0);
      setPhase("select");
      addLog("⚔️ Battle started! Choose your action.");
    }, 2200);
  };

  const reset = () => setPhase("idle");

  // ─── Idle ────────────────────────────────────────────────────────
  if (phase === "idle") {
    return (
      <motion.div className="glass-panel p-10 text-center" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
        <div className="w-20 h-20 mx-auto mb-6 bg-neon-pink/10 border border-neon-pink/30 flex items-center justify-center">
          <Swords className="w-10 h-10 text-neon-pink" />
        </div>
        <h3 className="text-2xl font-bold font-display mb-2">Cyber-Math Duel</h3>
        <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
          Turn-based math battles. Choose actions, solve equations, deal damage. Build streaks for combo multipliers.
        </p>
        <motion.button
          onClick={startBattle}
          className="px-8 py-3 bg-neon-pink text-primary-foreground font-bold text-sm tracking-widest hover:opacity-90 transition-opacity"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
        >
          <Zap className="w-4 h-4 inline mr-2" />
          FIND OPPONENT
        </motion.button>
      </motion.div>
    );
  }

  // ─── Searching ───────────────────────────────────────────────────
  if (phase === "searching") {
    return (
      <motion.div className="glass-panel p-10 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <motion.div
          className="w-20 h-20 mx-auto mb-6 border-2 border-neon-pink/50 flex items-center justify-center"
          animate={{ rotate: 360, borderColor: ["oklch(0.6 0.24 350)", "oklch(0.55 0.25 290)", "oklch(0.75 0.15 180)", "oklch(0.6 0.24 350)"] }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
          <Target className="w-8 h-8 text-neon-pink" />
        </motion.div>
        <h3 className="text-xl font-bold font-display mb-2">Matching opponent...</h3>
        <motion.div className="flex justify-center gap-1 mt-4" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }}>
          {[0, 1, 2].map(i => <div key={i} className="w-2 h-2 bg-neon-pink rounded-full" />)}
        </motion.div>
      </motion.div>
    );
  }

  // ─── Result ──────────────────────────────────────────────────────
  if (phase === "result") {
    const won = opponent.hp <= 0;
    return (
      <motion.div className="glass-panel p-10 text-center" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.5 }}>
          {won ? <Crown className="w-16 h-16 text-neon-pink mx-auto mb-4" /> : <Skull className="w-16 h-16 text-muted-foreground mx-auto mb-4" />}
        </motion.div>
        <h3 className="text-3xl font-bold font-display mb-2">{won ? "VICTORY!" : "DEFEATED"}</h3>
        <p className="text-muted-foreground text-sm mb-6">{won ? "Your math skills prevail." : "Study more. Return stronger."}</p>
        <div className="flex justify-center gap-6 mb-8">
          <div className="text-center">
            <div className="text-2xl font-bold font-display text-neon-purple">{Math.floor(totalScore)}</div>
            <div className="text-[10px] tracking-widest text-muted-foreground">SCORE</div>
          </div>
          <div className="text-center">
            <motion.div className="text-2xl font-bold font-display text-neon-cyan" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3, type: "spring" }}>
              +{xpGained} XP
            </motion.div>
            <div className="text-[10px] tracking-widest text-muted-foreground">EARNED</div>
          </div>
        </div>
        <div className="flex justify-center gap-3">
          <motion.button onClick={startBattle} className="px-6 py-2.5 bg-neon-pink text-primary-foreground font-bold text-xs tracking-widest" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            REMATCH
          </motion.button>
          <button onClick={reset} className="px-6 py-2.5 border border-border text-xs font-bold tracking-widest text-muted-foreground hover:text-foreground transition-colors">
            BACK
          </button>
        </div>
      </motion.div>
    );
  }

  // ─── Battle (select / question / animate) ────────────────────────
  return (
    <div className="relative">
      {/* Duel Area - Top Half */}
      <div className="flex gap-4 mb-4">
        <FighterCard fighter={player} side="left" momentum={momentum} showHit={showPlayerHit} showHeal={showPlayerHeal} />
        <div className="flex flex-col items-center justify-center px-2">
          <motion.div
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Swords className="w-6 h-6 text-neon-pink" />
          </motion.div>
          <span className="text-[10px] font-bold tracking-widest text-muted-foreground mt-1">VS</span>
        </div>
        <FighterCard fighter={opponent} side="right" momentum={0} showHit={showOpponentHit} showHeal={false} />
      </div>

      {/* Command Center - Bottom Half */}
      <div className="space-y-3">
        {/* Momentum bar */}
        <div className="glass-panel p-3 flex items-center gap-3">
          <Flame className={`w-4 h-4 ${momentum > 0 ? "text-neon-pink" : "text-muted-foreground"}`} />
          <span className="text-[10px] font-bold tracking-widest text-muted-foreground">MOMENTUM</span>
          <div className="flex gap-1 flex-1">
            {[0, 1, 2].map(i => (
              <div key={i} className={`h-2 flex-1 transition-colors duration-300 ${i < momentum % 3 || (momentum > 0 && momentum % 3 === 0 && i < 3) ? "bg-neon-pink" : "bg-secondary/40"}`} />
            ))}
          </div>
          {momentum >= 3 && (
            <motion.span
              className="text-[10px] font-bold text-neon-pink tracking-widest"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              key={Math.floor(momentum / 3)}
            >
              x1.5 COMBO!
            </motion.span>
          )}
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-4 gap-2">
          {(Object.entries(ACTIONS) as [Action, typeof ACTIONS[Action]][]).map(([key, act]) => {
            const Icon = act.icon;
            const disabled = phase !== "select" || (key === "wild" && player.focus < 10);
            return (
              <motion.button
                key={key}
                onClick={() => selectAction(key)}
                disabled={disabled}
                className={`glass-panel p-4 text-center transition-colors ${
                  disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-neon-purple/5 hover:border-neon-purple/30"
                }`}
                whileHover={!disabled ? { scale: 1.03, y: -2 } : {}}
                whileTap={!disabled ? { scale: 0.97 } : {}}
              >
                <span className="text-xl mb-1 block">{ACTION_EMOJIS[key]}</span>
                <Icon className={`w-5 h-5 mx-auto mb-1 ${
                  key === "charge" ? "text-neon-pink" : key === "defend" ? "text-neon-cyan" : key === "wild" ? "text-neon-purple" : "text-foreground"
                }`} />
                <div className="text-[10px] font-bold tracking-widest">{act.label.toUpperCase()}</div>
                <div className="text-[9px] text-muted-foreground mt-0.5">{act.desc}</div>
              </motion.button>
            );
          })}
        </div>

        <BattleLog logs={logs} />
      </div>

      {/* Question Overlay */}
      <AnimatePresence>
        {phase === "question" && question && (
          <QuestionOverlay question={question} timeLeft={timeLeft} maxTime={maxTime} onAnswer={handleAnswer} />
        )}
      </AnimatePresence>
    </div>
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
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-neon-pink via-neon-purple to-neon-cyan">Battles</span>
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Turn-based duels where math is your weapon. Pick actions, solve equations under pressure, and build devastating combos.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3">
            <BattleArena />
          </div>

          <div className="lg:col-span-2 space-y-4">
            <motion.div className="glass-panel p-6" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
              <h3 className="text-sm font-bold font-display tracking-widest mb-4 text-neon-purple">HOW IT WORKS</h3>
              <div className="space-y-3">
                {[
                  { icon: Swords, text: "⚔️ Attack — Medium question, 15 DMG" },
                  { icon: Shield, text: "🧱 Defend — Easy question, heal 10 HP + Focus" },
                  { icon: Zap, text: "⚡ Charge — Hard question, 25 DMG" },
                  { icon: Dices, text: "🎲 Wild — Random difficulty, random effect (10 Focus)" },
                  { icon: Flame, text: "Every 3 correct = 1.5x combo multiplier" },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <item.icon className="w-4 h-4 text-neon-pink shrink-0 mt-0.5" />
                    <span className="text-xs text-muted-foreground">{item.text}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div className="glass-panel p-6" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold font-display tracking-widest text-neon-cyan">LEADERBOARD</h3>
                <Trophy className="w-4 h-4 text-neon-cyan" />
              </div>
              <div className="space-y-2">
                {LEADERBOARD.map(p => (
                  <div key={p.rank} className="flex items-center gap-3 px-3 py-2 border border-transparent hover:bg-secondary/30 transition-colors">
                    <span className={`text-xs font-bold w-5 text-center ${p.rank <= 3 ? "text-neon-pink" : "text-muted-foreground"}`}>{p.rank}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-bold text-foreground">{p.name}</span>
                      <span className={`text-[10px] ml-2 font-bold ${tierColors[p.tier]}`}>{p.tier}</span>
                    </div>
                    <div className="text-xs font-bold text-foreground">{p.xp.toLocaleString()} XP</div>
                  </div>
                ))}
              </div>
            </motion.div>

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
