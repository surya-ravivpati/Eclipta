import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, TrendingUp, Target, Zap, BarChart3, Clock, ChevronRight, Check, X, ArrowRight, Flame, ShieldCheck } from "lucide-react";

/* ── data ── */

const HOW_IT_WORKS = [
  { icon: Brain, title: "AI Analyses You", description: "Every answer feeds the engine — timing, confidence, error patterns" },
  { icon: Target, title: "Targets Weak Spots", description: "Struggling with recursion? You'll see more recursion until it clicks" },
  { icon: TrendingUp, title: "Scales Difficulty", description: "Ace a topic and the questions get harder — no wasted time on easy wins" },
  { icon: Zap, title: "Course-Matched Formats", description: "FAANG prep gets mock interviews. Math courses get proof-style problems" },
];

const COURSE_TEST_FORMATS = [
  { course: "FAANG Interview Prep", format: "Live Coding Interview", icon: "💻", description: "Timed whiteboard problems with follow-up questions, just like real interviews", difficulty: "Adaptive" },
  { course: "Machine Learning Foundations", format: "Model Analysis", icon: "🧠", description: "Debug models, interpret outputs, choose the right architecture", difficulty: "Progressive" },
  { course: "Calculus Through Intuition", format: "Proof & Visualization", icon: "📐", description: "Derive formulas, sketch graphs, explain concepts in your own words", difficulty: "Adaptive" },
  { course: "Cybersecurity Red Team", format: "Capture The Flag", icon: "🚩", description: "Find vulnerabilities in simulated systems under time pressure", difficulty: "Escalating" },
  { course: "Systems Design Mastery", format: "Architecture Review", icon: "🏗️", description: "Design systems for given constraints, defend trade-offs verbally", difficulty: "Scenario-based" },
];

/* ── demo question bank ── */
const DEMO_QUESTIONS = [
  {
    difficulty: 1,
    topic: "Arrays",
    question: "What is the time complexity of accessing an element by index in an array?",
    options: ["O(1)", "O(n)", "O(log n)", "O(n²)"],
    correct: 0,
  },
  {
    difficulty: 2,
    topic: "Arrays",
    question: "Which method removes the last element from an array and returns it?",
    options: [".shift()", ".pop()", ".splice()", ".slice()"],
    correct: 1,
  },
  {
    difficulty: 3,
    topic: "Recursion",
    question: "What is the base case in a recursive Fibonacci function?",
    options: ["fib(n-1) + fib(n-2)", "n <= 1 returns n", "n === 0 returns 1", "There is no base case"],
    correct: 1,
  },
  {
    difficulty: 4,
    topic: "Recursion",
    question: "What is the space complexity of a naive recursive Fibonacci?",
    options: ["O(1)", "O(n)", "O(2^n)", "O(n²)"],
    correct: 1,
  },
  {
    difficulty: 5,
    topic: "Dynamic Programming",
    question: "Memoized Fibonacci reduces time complexity from O(2^n) to?",
    options: ["O(n log n)", "O(n²)", "O(n)", "O(log n)"],
    correct: 2,
  },
];

/* ── component ── */

export function AdaptiveTests() {
  return (
    <div className="pt-24 pb-16 px-6">
      <div className="max-w-6xl mx-auto">
        <Header />
        <HowItWorks />
        <CourseFormats />
        <LiveDemo />
      </div>
    </div>
  );
}

/* ── sections ── */

function Header() {
  return (
    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-14">
      <div className="inline-flex items-center gap-2 px-3 py-1 border border-neon-cyan/30 bg-neon-cyan/5 text-neon-cyan text-xs font-bold tracking-widest mb-4">
        <Brain className="w-3.5 h-3.5" />
        AI-POWERED
      </div>
      <h1 className="text-4xl md:text-5xl font-display font-bold tracking-tight mb-3">
        ADAPTIVE <span className="text-neon-purple text-glow-purple">TESTS</span>
      </h1>
      <p className="text-muted-foreground max-w-lg mx-auto">
        Tests that learn how you learn. They shift difficulty, target your gaps, and match the format to your course — so every question counts.
      </p>
    </motion.div>
  );
}

function HowItWorks() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
      {HOW_IT_WORKS.map((item, i) => (
        <motion.div
          key={item.title}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 * i }}
          className="glass-panel p-5"
        >
          <item.icon className="w-5 h-5 text-neon-purple mb-3" />
          <h3 className="font-display font-bold text-sm tracking-wide mb-1">{item.title}</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
        </motion.div>
      ))}
    </div>
  );
}

function CourseFormats() {
  return (
    <div className="mb-16">
      <h2 className="font-display font-bold tracking-widest text-xs text-muted-foreground mb-5 flex items-center gap-2">
        <ShieldCheck className="w-3.5 h-3.5 text-neon-pink" />
        COURSE-SPECIFIC TEST FORMATS
      </h2>
      <div className="grid gap-3">
        {COURSE_TEST_FORMATS.map((f, i) => (
          <motion.div
            key={f.course}
            initial={{ opacity: 0, x: -15 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.06 * i }}
            className="glass-panel p-4 flex items-center gap-4 group hover:border-neon-purple/30 transition-colors"
          >
            <span className="text-2xl">{f.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-display font-bold text-sm">{f.course}</span>
                <span className="text-[10px] font-bold tracking-widest px-1.5 py-0.5 border border-neon-purple/20 text-neon-purple">{f.format.toUpperCase()}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{f.description}</p>
            </div>
            <span className="text-[10px] font-bold tracking-widest text-neon-cyan shrink-0 hidden sm:block">{f.difficulty.toUpperCase()}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ── interactive demo ── */

function LiveDemo() {
  const [started, setStarted] = useState(false);
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [difficultyLevel, setDifficultyLevel] = useState(1);
  const [history, setHistory] = useState<{ correct: boolean; topic: string; difficulty: number }[]>([]);

  const currentQ = DEMO_QUESTIONS[Math.min(qIndex, DEMO_QUESTIONS.length - 1)];
  const finished = qIndex >= DEMO_QUESTIONS.length;

  const handleAnswer = (idx: number) => {
    if (showResult) return;
    setSelected(idx);
    setShowResult(true);
    const correct = idx === currentQ.correct;
    if (correct) {
      setScore(s => s + 1);
      setStreak(s => s + 1);
      setDifficultyLevel(d => Math.min(5, d + 1));
    } else {
      setStreak(0);
      setDifficultyLevel(d => Math.max(1, d - 1));
    }
    setHistory(h => [...h, { correct, topic: currentQ.topic, difficulty: currentQ.difficulty }]);
  };

  const nextQuestion = () => {
    setQIndex(i => i + 1);
    setSelected(null);
    setShowResult(false);
  };

  const reset = () => {
    setStarted(false);
    setQIndex(0);
    setSelected(null);
    setShowResult(false);
    setScore(0);
    setStreak(0);
    setDifficultyLevel(1);
    setHistory([]);
  };

  return (
    <div>
      <h2 className="font-display font-bold tracking-widest text-xs text-muted-foreground mb-5 flex items-center gap-2">
        <Zap className="w-3.5 h-3.5 text-neon-purple" />
        TRY IT — LIVE DEMO
      </h2>

      <div className="glass-panel p-6 md:p-8">
        {!started ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-8">
            <Brain className="w-10 h-10 text-neon-purple mx-auto mb-4" />
            <h3 className="font-display font-bold text-xl mb-2">Experience Adaptive Testing</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
              Answer 5 questions. Watch the difficulty adapt in real time based on your performance. Get it right → harder. Get it wrong → the engine drills your weak spot.
            </p>
            <button
              onClick={() => setStarted(true)}
              className="px-6 py-2.5 bg-neon-purple text-primary-foreground font-display font-bold tracking-widest text-sm hover:opacity-90 transition-opacity neon-glow-purple"
            >
              START TEST
            </button>
          </motion.div>
        ) : finished ? (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-6">
            <BarChart3 className="w-10 h-10 text-neon-purple mx-auto mb-4" />
            <h3 className="font-display font-bold text-2xl mb-1">{score}/{DEMO_QUESTIONS.length} CORRECT</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Final difficulty level: <span className="text-neon-cyan font-bold">{difficultyLevel}/5</span>
            </p>
            {/* Performance breakdown */}
            <div className="grid grid-cols-5 gap-2 max-w-md mx-auto mb-6">
              {history.map((h, i) => (
                <div key={i} className={`p-2 border text-center ${h.correct ? "border-neon-cyan/30 bg-neon-cyan/5" : "border-destructive/30 bg-destructive/5"}`}>
                  <span className="text-[10px] font-bold tracking-widest text-muted-foreground">Q{i + 1}</span>
                  <div className="mt-1">
                    {h.correct ? <Check className="w-4 h-4 text-neon-cyan mx-auto" /> : <X className="w-4 h-4 text-destructive mx-auto" />}
                  </div>
                  <span className="text-[9px] text-muted-foreground">LV {h.difficulty}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              In a real session, the AI would now schedule targeted review on your weak topics and adjust future test difficulty accordingly.
            </p>
            <button onClick={reset} className="px-5 py-2 text-xs font-bold tracking-widest border border-neon-purple/30 text-neon-purple hover:bg-neon-purple hover:text-primary-foreground transition-all">
              RETRY
            </button>
          </motion.div>
        ) : (
          <div>
            {/* Status bar */}
            <div className="flex items-center justify-between mb-6 text-xs">
              <div className="flex items-center gap-3">
                <span className="font-bold tracking-widest text-muted-foreground">Q{qIndex + 1}/{DEMO_QUESTIONS.length}</span>
                <span className="px-2 py-0.5 border border-neon-purple/20 text-neon-purple font-bold tracking-widest">LV {currentQ.difficulty}</span>
                <span className="px-2 py-0.5 border border-border text-muted-foreground font-bold tracking-widest">{currentQ.topic.toUpperCase()}</span>
              </div>
              <div className="flex items-center gap-3">
                {streak > 1 && (
                  <span className="flex items-center gap-1 text-neon-pink font-bold">
                    <Flame className="w-3.5 h-3.5" />{streak} STREAK
                  </span>
                )}
                <span className="text-muted-foreground">
                  <BarChart3 className="w-3.5 h-3.5 inline mr-1" />
                  {score} pts
                </span>
              </div>
            </div>

            {/* Difficulty indicator */}
            <div className="flex items-center gap-1 mb-6">
              {[1, 2, 3, 4, 5].map(d => (
                <div
                  key={d}
                  className={`h-1 flex-1 transition-colors ${d <= difficultyLevel ? "bg-neon-purple" : "bg-border"}`}
                />
              ))}
            </div>

            {/* Question */}
            <AnimatePresence mode="wait">
              <motion.div key={qIndex} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h3 className="font-display font-bold text-lg mb-5">{currentQ.question}</h3>
                <div className="grid gap-2">
                  {currentQ.options.map((opt, i) => {
                    let cls = "border-border bg-secondary/30 hover:border-muted-foreground cursor-pointer";
                    if (showResult) {
                      if (i === currentQ.correct) cls = "border-neon-cyan/50 bg-neon-cyan/10";
                      else if (i === selected) cls = "border-destructive/50 bg-destructive/10";
                      else cls = "border-border bg-secondary/20 opacity-50";
                    } else if (i === selected) {
                      cls = "border-neon-purple bg-neon-purple/10";
                    }
                    return (
                      <button
                        key={i}
                        onClick={() => handleAnswer(i)}
                        disabled={showResult}
                        className={`p-3 border text-left font-display text-sm transition-all flex items-center gap-3 ${cls}`}
                      >
                        <span className="w-6 h-6 flex items-center justify-center border border-current text-xs font-bold shrink-0">
                          {String.fromCharCode(65 + i)}
                        </span>
                        {opt}
                        {showResult && i === currentQ.correct && <Check className="w-4 h-4 text-neon-cyan ml-auto" />}
                        {showResult && i === selected && i !== currentQ.correct && <X className="w-4 h-4 text-destructive ml-auto" />}
                      </button>
                    );
                  })}
                </div>

                {showResult && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 flex items-center justify-between">
                    <span className={`text-xs font-bold tracking-widest ${selected === currentQ.correct ? "text-neon-cyan" : "text-destructive"}`}>
                      {selected === currentQ.correct
                        ? "CORRECT — Difficulty increasing ↑"
                        : "WRONG — More practice on this topic incoming"}
                    </span>
                    <button
                      onClick={nextQuestion}
                      className="flex items-center gap-1 px-4 py-2 text-xs font-bold tracking-widest bg-neon-purple text-primary-foreground hover:opacity-90 transition-opacity"
                    >
                      NEXT <ArrowRight className="w-3 h-3" />
                    </button>
                  </motion.div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
