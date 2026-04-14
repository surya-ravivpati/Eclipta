import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Swords, Zap, Trophy, Star, Shield, Heart, Flame, Crown, Timer, ChevronRight, Sparkles, Target, TrendingUp } from "lucide-react";

type BattleState = "idle" | "searching" | "battle" | "result";

const QUESTIONS = [
  { q: "What is the time complexity of binary search?", options: ["O(n)", "O(log n)", "O(n²)", "O(1)"], correct: 1 },
  { q: "Which data structure uses LIFO?", options: ["Queue", "Array", "Stack", "Tree"], correct: 2 },
  { q: "What does HTTP stand for?", options: ["HyperText Transfer Protocol", "High Tech Transfer Protocol", "HyperText Transit Protocol", "Hybrid Transfer Protocol"], correct: 0 },
  { q: "What is a closure in JavaScript?", options: ["A loop construct", "A function with access to its outer scope", "A class method", "A type of promise"], correct: 1 },
  { q: "Which sorting algorithm is stable?", options: ["Quick Sort", "Heap Sort", "Merge Sort", "Selection Sort"], correct: 2 },
];

const LEADERBOARD = [
  { rank: 1, name: "shadowKing", xp: 24800, wins: 312, streak: 18, tier: "Grandmaster" },
  { rank: 2, name: "byteCrusher", xp: 22100, wins: 287, streak: 12, tier: "Grandmaster" },
  { rank: 3, name: "nova_coder", xp: 19400, wins: 251, streak: 9, tier: "Diamond" },
  { rank: 4, name: "algo_beast", xp: 17200, wins: 223, streak: 7, tier: "Diamond" },
  { rank: 5, name: "ml_wanderer", xp: 15800, wins: 198, streak: 15, tier: "Platinum" },
  { rank: 6, name: "code_samurai", xp: 14100, wins: 176, streak: 5, tier: "Platinum" },
  { rank: 7, name: "steady_learner", xp: 12300, wins: 154, streak: 3, tier: "Gold" },
  { rank: 8, name: "h4ck_the_planet", xp: 11000, wins: 141, streak: 11, tier: "Gold" },
];

const tierColors: Record<string, string> = {
  Grandmaster: "text-neon-pink",
  Diamond: "text-neon-cyan",
  Platinum: "text-neon-purple",
  Gold: "text-yellow-400",
};

const tierBorders: Record<string, string> = {
  Grandmaster: "border-neon-pink/40",
  Diamond: "border-neon-cyan/40",
  Platinum: "border-neon-purple/40",
  Gold: "border-yellow-400/40",
};

function BattleArena() {
  const [state, setState] = useState<BattleState>("idle");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [playerHP, setPlayerHP] = useState(100);
  const [opponentHP, setOpponentHP] = useState(100);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [timeLeft, setTimeLeft] = useState(10);
  const [selected, setSelected] = useState<number | null>(null);
  const [xpGained, setXpGained] = useState(0);
  const [showDamage, setShowDamage] = useState<{ player: boolean; amount: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentQ = QUESTIONS[questionIndex % QUESTIONS.length];

  useEffect(() => {
    if (state === "battle" && selected === null) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            handleAnswer(-1);
            return 10;
          }
          return prev - 1;
        });
      }, 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }
  }, [state, questionIndex, selected]);

  const handleAnswer = (idx: number) => {
    if (selected !== null) return;
    setSelected(idx);
    if (timerRef.current) clearInterval(timerRef.current);

    const correct = idx === currentQ.correct;
    const damage = correct ? 20 + combo * 5 : 0;
    const selfDamage = correct ? 0 : 15;

    if (correct) {
      setOpponentHP(prev => Math.max(0, prev - damage));
      setCombo(prev => prev + 1);
      setScore(prev => prev + 100 + combo * 25);
      setShowDamage({ player: false, amount: damage });
    } else {
      setPlayerHP(prev => Math.max(0, prev - selfDamage));
      setCombo(0);
      setShowDamage({ player: true, amount: selfDamage });
    }

    setTimeout(() => {
      setShowDamage(null);
      setSelected(null);
      setTimeLeft(10);

      if (opponentHP - damage <= 0) {
        setXpGained(score + 200);
        setState("result");
      } else if (playerHP - selfDamage <= 0) {
        setXpGained(Math.floor(score * 0.3));
        setState("result");
      } else {
        setQuestionIndex(prev => prev + 1);
      }
    }, 1200);
  };

  const startSearch = () => {
    setState("searching");
    setTimeout(() => {
      setState("battle");
      setPlayerHP(100);
      setOpponentHP(100);
      setScore(0);
      setCombo(0);
      setQuestionIndex(0);
      setTimeLeft(10);
      setSelected(null);
    }, 2500);
  };

  const reset = () => {
    setState("idle");
    setPlayerHP(100);
    setOpponentHP(100);
    setScore(0);
    setCombo(0);
    setXpGained(0);
  };

  if (state === "idle") {
    return (
      <motion.div
        className="glass-panel p-10 text-center"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <div className="w-20 h-20 mx-auto mb-6 bg-neon-pink/10 border border-neon-pink/30 flex items-center justify-center">
          <Swords className="w-10 h-10 text-neon-pink" />
        </div>
        <h3 className="text-2xl font-bold font-display mb-2">Knowledge Battle</h3>
        <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
          Challenge an opponent in real-time. Answer questions from your enrolled courses. Speed and accuracy deal damage.
        </p>
        <motion.button
          onClick={startSearch}
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

  if (state === "searching") {
    return (
      <motion.div
        className="glass-panel p-10 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <motion.div
          className="w-20 h-20 mx-auto mb-6 border-2 border-neon-pink/50 flex items-center justify-center"
          animate={{ rotate: 360, borderColor: ["hsl(330,90%,56%)", "hsl(270,90%,56%)", "hsl(180,90%,56%)", "hsl(330,90%,56%)"] }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
          <Target className="w-8 h-8 text-neon-pink" />
        </motion.div>
        <h3 className="text-xl font-bold font-display mb-2">Searching for opponent...</h3>
        <motion.div
          className="flex justify-center gap-1 mt-4"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          {[0, 1, 2].map(i => (
            <div key={i} className="w-2 h-2 bg-neon-pink rounded-full" />
          ))}
        </motion.div>
      </motion.div>
    );
  }

  if (state === "result") {
    const won = opponentHP <= 0;
    return (
      <motion.div
        className="glass-panel p-10 text-center"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", bounce: 0.5 }}
        >
          {won ? (
            <Crown className="w-16 h-16 text-neon-pink mx-auto mb-4" />
          ) : (
            <Shield className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          )}
        </motion.div>
        <h3 className="text-3xl font-bold font-display mb-2">
          {won ? "VICTORY!" : "DEFEATED"}
        </h3>
        <p className="text-muted-foreground text-sm mb-6">
          {won ? "Dominant performance. Your knowledge prevails." : "Learn from this. Come back stronger."}
        </p>
        <div className="flex justify-center gap-6 mb-8">
          <div className="text-center">
            <div className="text-2xl font-bold font-display text-neon-purple">{score}</div>
            <div className="text-[10px] tracking-widest text-muted-foreground">SCORE</div>
          </div>
          <div className="text-center">
            <motion.div
              className="text-2xl font-bold font-display text-neon-cyan"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3, type: "spring" }}
            >
              +{xpGained} XP
            </motion.div>
            <div className="text-[10px] tracking-widest text-muted-foreground">EARNED</div>
          </div>
        </div>
        <div className="flex justify-center gap-3">
          <motion.button
            onClick={startSearch}
            className="px-6 py-2.5 bg-neon-pink text-primary-foreground font-bold text-xs tracking-widest"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            BATTLE AGAIN
          </motion.button>
          <button onClick={reset} className="px-6 py-2.5 border border-border text-xs font-bold tracking-widest text-muted-foreground hover:text-foreground transition-colors">
            BACK
          </button>
        </div>
      </motion.div>
    );
  }

  // Battle state
  return (
    <motion.div className="glass-panel p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* HP Bars */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold tracking-widest text-neon-cyan">YOU</span>
            <span className="text-xs font-bold text-foreground">{playerHP}/100</span>
          </div>
          <div className="h-3 bg-secondary overflow-hidden">
            <motion.div
              className="h-full bg-neon-cyan"
              animate={{ width: `${playerHP}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          {showDamage?.player && (
            <motion.span
              className="text-neon-pink text-xs font-bold"
              initial={{ opacity: 1, y: 0 }}
              animate={{ opacity: 0, y: -20 }}
              transition={{ duration: 1 }}
            >
              -{showDamage.amount}
            </motion.span>
          )}
        </div>
        <Swords className="w-5 h-5 text-neon-pink shrink-0" />
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold tracking-widest text-neon-pink">OPPONENT</span>
            <span className="text-xs font-bold text-foreground">{opponentHP}/100</span>
          </div>
          <div className="h-3 bg-secondary overflow-hidden">
            <motion.div
              className="h-full bg-neon-pink"
              animate={{ width: `${opponentHP}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          {showDamage && !showDamage.player && (
            <motion.span
              className="text-neon-cyan text-xs font-bold"
              initial={{ opacity: 1, y: 0 }}
              animate={{ opacity: 0, y: -20 }}
              transition={{ duration: 1 }}
            >
              -{showDamage.amount}
            </motion.span>
          )}
        </div>
      </div>

      {/* Combo & Timer */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          {combo > 0 && (
            <motion.div
              className="flex items-center gap-1 text-neon-pink"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              key={combo}
            >
              <Flame className="w-4 h-4" />
              <span className="text-xs font-bold tracking-widest">{combo}x COMBO</span>
            </motion.div>
          )}
          <span className="text-xs text-muted-foreground font-bold">Score: {score}</span>
        </div>
        <div className="flex items-center gap-1">
          <Timer className="w-4 h-4 text-muted-foreground" />
          <span className={`text-sm font-bold font-display ${timeLeft <= 3 ? "text-neon-pink" : "text-foreground"}`}>
            {timeLeft}s
          </span>
        </div>
      </div>

      {/* Question */}
      <div className="mb-5">
        <h4 className="font-bold text-base mb-4">{currentQ.q}</h4>
        <div className="grid grid-cols-1 gap-2">
          {currentQ.options.map((opt, i) => {
            let style = "border-border hover:border-neon-purple/50 text-foreground";
            if (selected !== null) {
              if (i === currentQ.correct) style = "border-neon-cyan bg-neon-cyan/10 text-neon-cyan";
              else if (i === selected) style = "border-neon-pink bg-neon-pink/10 text-neon-pink";
              else style = "border-border text-muted-foreground opacity-50";
            }
            return (
              <motion.button
                key={i}
                onClick={() => handleAnswer(i)}
                disabled={selected !== null}
                className={`text-left px-4 py-3 border text-sm font-medium transition-colors ${style}`}
                whileHover={selected === null ? { x: 4 } : {}}
                whileTap={selected === null ? { scale: 0.98 } : {}}
              >
                <span className="text-[10px] font-bold tracking-widest text-muted-foreground mr-3">
                  {String.fromCharCode(65 + i)}
                </span>
                {opt}
              </motion.button>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

export function KnowledgeBattles() {
  return (
    <section className="min-h-screen pt-24 pb-16">
      <div className="max-w-6xl mx-auto px-6">
        {/* Header */}
        <motion.div
          className="text-center mb-14"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 border border-neon-pink/30 bg-neon-pink/10 text-neon-pink text-xs font-bold tracking-widest mb-6">
            <Swords className="w-3 h-3" />
            PVP ARENA
          </div>
          <h1 className="text-5xl md:text-7xl font-bold font-display tracking-tight mb-4">
            Knowledge{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-neon-pink via-neon-purple to-neon-cyan">
              Battles
            </span>
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Pokémon-style duels powered by what you've learned. Answer fast, build combos, and climb the ranks. 
            Addictive like Nitro Type — but you're building real knowledge.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Battle Arena */}
          <div className="lg:col-span-3">
            <BattleArena />
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-2 space-y-4">
            {/* How it works */}
            <motion.div
              className="glass-panel p-6"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              <h3 className="text-sm font-bold font-display tracking-widest mb-4 text-neon-purple">HOW BATTLES WORK</h3>
              <div className="space-y-3">
                {[
                  { icon: Target, text: "Questions come from courses you're enrolled in" },
                  { icon: Zap, text: "Speed + accuracy = more damage to your opponent" },
                  { icon: Flame, text: "Build combos for multiplied damage and XP" },
                  { icon: TrendingUp, text: "Win to climb ranks and unlock rewards" },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <item.icon className="w-4 h-4 text-neon-pink shrink-0 mt-0.5" />
                    <span className="text-xs text-muted-foreground">{item.text}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Leaderboard */}
            <motion.div
              className="glass-panel p-6"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold font-display tracking-widest text-neon-cyan">LEADERBOARD</h3>
                <Trophy className="w-4 h-4 text-neon-cyan" />
              </div>
              <div className="space-y-2">
                {LEADERBOARD.map(player => (
                  <div
                    key={player.rank}
                    className={`flex items-center gap-3 px-3 py-2 border ${player.rank <= 3 ? tierBorders[player.tier] : "border-transparent"} transition-colors hover:bg-secondary/30`}
                  >
                    <span className={`text-xs font-bold w-5 text-center ${player.rank <= 3 ? "text-neon-pink" : "text-muted-foreground"}`}>
                      {player.rank}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-bold text-foreground">{player.name}</span>
                      <span className={`text-[10px] ml-2 font-bold ${tierColors[player.tier]}`}>{player.tier}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold text-foreground">{player.xp.toLocaleString()} XP</div>
                      <div className="text-[10px] text-muted-foreground">{player.wins}W · {player.streak}🔥</div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Daily streak */}
            <motion.div
              className="glass-panel p-5 border border-neon-purple/20"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-neon-purple/10 border border-neon-purple/30 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-neon-purple" />
                </div>
                <div>
                  <h4 className="text-xs font-bold tracking-widest">DAILY CHALLENGE</h4>
                  <p className="text-[10px] text-muted-foreground">Win 3 battles today for 2x XP bonus</p>
                </div>
                <div className="ml-auto text-right">
                  <div className="text-lg font-bold font-display text-neon-purple">0/3</div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
