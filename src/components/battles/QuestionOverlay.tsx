/**
 * The question itself, over the arena.
 *
 * Split out of KnowledgeBattles.tsx.
 */
import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Timer } from "lucide-react";
import type { MathQuestion } from "./types";

export function QuestionOverlay({
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
