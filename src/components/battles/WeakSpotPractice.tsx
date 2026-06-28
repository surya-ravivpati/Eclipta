import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, X, GraduationCap, Loader2, Swords, Brain } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getWeakConcepts, recordOutcomes, type WeakConcept, type MasteryState,
} from "@/lib/concept-mastery";
import { generateQuestionForTopic, TOPIC_DIFFICULTY } from "./questions";
import type { MathQuestion } from "./types";

/**
 * Practice Weak Spots — a dedicated coaching mode (docs/battle-redesign.md §8).
 * NOT a battle: no timer, no opponent, no rating. It reads the shared
 * concept_mastery store (which battles write to) to surface the topics the
 * learner keeps missing, runs calm reps, updates mastery, then offers a smooth
 * transition back into battle. Degrades gracefully if the store is empty.
 */

const SESSION_LEN = 5;

const STATE_LABEL: Record<MasteryState, string> = {
  struggling: "Struggling",
  developing: "Developing",
  solid: "Solid",
  mastered: "Mastered",
};

export function WeakSpotPractice({ onClose, onBattle }: { onClose: () => void; onBattle: () => void }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [weak, setWeak] = useState<WeakConcept[] | null>(null);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
      setWeak(user ? await getWeakConcepts(user.id) : []);
    })();
  }, []);

  const refresh = async () => {
    setActive(null);
    if (userId) setWeak(await getWeakConcepts(userId));
  };

  if (active && userId) {
    return <PracticeSession concept={active} userId={userId} onDone={refresh} onBattle={onBattle} />;
  }

  return (
    <motion.div className="btt-card p-8" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <button onClick={onClose} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-5 transition-colors">
        <ArrowLeft className="w-3 h-3" /> Back to arena
      </button>
      <div className="flex items-center gap-2 mb-1">
        <Brain className="w-5 h-5 text-primary" />
        <h3 className="font-display text-2xl font-bold">Practice your weak spots</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-6 max-w-md">
        Calm reps — no timer, no opponent. Shore up the topics you've been missing, then take them into battle.
      </p>

      {weak === null ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : weak.length === 0 ? (
        <div className="glass-panel rounded-md p-8 text-center">
          <GraduationCap className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
            No weak spots flagged yet. Play a few battles and the topics worth drilling will show up here.
          </p>
          <button onClick={onBattle} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-xs font-bold tracking-widest uppercase hover:bg-primary/90 transition-colors">
            <Swords className="w-3.5 h-3.5" /> To battle
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {weak.map((w) => (
            <div key={w.concept} className="glass-panel rounded-md p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-display font-bold">{w.concept}</span>
                  <span className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">{STATE_LABEL[w.state]}</span>
                </div>
                <div className="h-1 rounded-full bg-border overflow-hidden mt-2 w-40">
                  <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${Math.round(w.confidence * 100)}%` }} />
                </div>
              </div>
              <button onClick={() => setActive(w.concept)} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-primary/40 text-primary text-xs font-bold tracking-widest uppercase hover:bg-primary/10 transition-colors">
                Warm up <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <div className="pt-3 flex justify-end">
            <button onClick={onBattle} className="inline-flex items-center gap-2 text-xs font-bold tracking-widest uppercase text-muted-foreground hover:text-foreground transition-colors">
              Skip to battle <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function PracticeSession({ concept, userId, onDone, onBattle }: {
  concept: string; userId: string; onDone: () => void; onBattle: () => void;
}) {
  const [qs] = useState<MathQuestion[]>(() =>
    Array.from({ length: SESSION_LEN }, () => generateQuestionForTopic(concept)),
  );
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const [done, setDone] = useState(false);

  const q = qs[idx];
  const answered = picked !== null;

  const pick = (opt: number) => {
    if (answered) return;
    setPicked(opt);
    setResults((r) => [...r, opt === q.answer]);
  };

  const next = async () => {
    if (idx < SESSION_LEN - 1) {
      setIdx(idx + 1);
      setPicked(null);
    } else {
      const diff = TOPIC_DIFFICULTY[concept] ?? "medium";
      await recordOutcomes(
        userId,
        results.map((correct) => ({ concept, subject: "Mathematics", difficulty: diff, correct })),
      );
      setDone(true);
    }
  };

  if (done) {
    const correct = results.filter(Boolean).length;
    return (
      <motion.div className="btt-card p-8 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Brain className="w-10 h-10 text-primary mx-auto mb-3" />
        <h3 className="font-display text-2xl font-bold mb-1">{concept} — {correct}/{SESSION_LEN}</h3>
        <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
          {correct >= 4 ? "That's locking in. Ready to test it under real pressure?" : "Getting there — another round will help it stick."}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button onClick={onDone} className="px-4 py-2 rounded-md border border-border text-xs font-bold tracking-widest uppercase text-muted-foreground hover:text-foreground transition-colors">
            Back to weak spots
          </button>
          <button onClick={onBattle} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-xs font-bold tracking-widest uppercase hover:bg-primary/90 transition-colors">
            <Swords className="w-3.5 h-3.5" /> Take it into battle
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div className="btt-card p-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex items-center justify-between mb-6">
        <span className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">{concept} · no timer</span>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{idx + 1}/{SESSION_LEN}</span>
      </div>
      <p className="font-display text-3xl font-bold text-center my-10">{q.q}</p>
      <div className="grid grid-cols-2 gap-3">
        {q.options.map((opt) => {
          const isAnswer = opt === q.answer;
          const isPicked = picked === opt;
          const cls = !answered
            ? "glass-panel hover:border-primary/50"
            : isAnswer
              ? "border-primary bg-primary/10 text-primary"
              : isPicked
                ? "border-destructive bg-destructive/10 text-destructive"
                : "glass-panel opacity-50";
          return (
            <button
              key={opt}
              onClick={() => pick(opt)}
              disabled={answered}
              className={`rounded-md p-4 text-center font-display font-bold text-lg transition-colors border ${cls}`}
            >
              {opt}
              {answered && isAnswer && <Check className="inline w-4 h-4 ml-1" />}
              {answered && isPicked && !isAnswer && <X className="inline w-4 h-4 ml-1" />}
            </button>
          );
        })}
      </div>
      {answered && (
        <div className="mt-6 flex justify-end">
          <button onClick={next} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-primary-foreground text-xs font-bold tracking-widest uppercase hover:bg-primary/90 transition-colors">
            {idx < SESSION_LEN - 1 ? "Next" : "Finish"} <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </motion.div>
  );
}
