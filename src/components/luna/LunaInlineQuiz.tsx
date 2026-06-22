import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { recordAnswer } from "@/lib/luna-context";
import { supabase } from "@/integrations/supabase/client";

type Q = { question: string; choices: string[]; answer_index: number; explanation: string };

interface Props {
  topic: string;
  count: number;
  onSendBack?: (text: string) => void;
}

/** Single-shot quiz: ask Luna gateway for JSON quiz items, then run them inline. */
export function LunaInlineQuiz({ topic, count, onSendBack }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Q[]>([]);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [startedAt, setStartedAt] = useState<number>(Date.now());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // luna-quiz authenticates the caller, so send the user's session JWT,
        // not the publishable key (which has no user → "Unauthorized").
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/luna-quiz`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ topic, count }),
        });
        if (!resp.ok) throw new Error("Failed to load quiz");
        const data = await resp.json() as { questions?: Q[]; error?: string };
        if (cancelled) return;
        if (!data.questions?.length) throw new Error(data.error || "No questions");
        setQuestions(data.questions);
        setStartedAt(Date.now());
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [topic, count]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" /> Generating quiz...
      </div>
    );
  }
  if (error || !questions.length) {
    return <div className="mt-2 text-xs text-muted-foreground">Couldn't generate quiz.</div>;
  }

  const done = idx >= questions.length;
  if (done) {
    return (
      <div className="mt-3 text-sm">
        <p className="font-bold">Score: {score} / {questions.length}</p>
        <button
          onClick={() => onSendBack?.(`I just took your ${topic} quiz and scored ${score}/${questions.length}. What should I work on next?`)}
          className="mt-2 text-[10px] font-bold tracking-widest text-neon-pink hover:text-neon-purple"
        >
          ASK LUNA WHAT'S NEXT →
        </button>
      </div>
    );
  }

  const q = questions[idx];
  const showResult = picked !== null;

  return (
    <div className="mt-3 text-sm">
      <p className="font-medium mb-2">{idx + 1}. {q.question}</p>
      <div className="space-y-1.5">
        {q.choices.map((c, i) => {
          const correct = i === q.answer_index;
          const isPicked = picked === i;
          let cls = "border-border bg-secondary/30 hover:border-neon-pink/40";
          if (showResult && correct) cls = "border-neon-cyan bg-neon-cyan/10 text-neon-cyan";
          else if (showResult && isPicked && !correct) cls = "border-neon-pink bg-neon-pink/10 text-neon-pink";
          return (
            <button
              key={i}
              disabled={showResult}
              onClick={() => {
                setPicked(i);
                const ok = i === q.answer_index;
                if (ok) setScore(s => s + 1);
                recordAnswer(ok, Date.now() - startedAt);
              }}
              className={`w-full text-left px-3 py-2 rounded border text-xs transition-colors ${cls}`}
            >
              {c}
            </button>
          );
        })}
      </div>
      {showResult && (
        <div className="mt-2 text-xs text-muted-foreground">
          {q.explanation}
          <button
            onClick={() => { setPicked(null); setIdx(i => i + 1); setStartedAt(Date.now()); }}
            className="ml-2 text-neon-pink font-bold tracking-widest hover:text-neon-purple"
          >
            NEXT →
          </button>
        </div>
      )}
    </div>
  );
}