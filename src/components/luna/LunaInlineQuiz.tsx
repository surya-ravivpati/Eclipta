import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { recordAnswer } from "@/lib/luna-context";

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
        const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/luna-chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: [{
              role: "user",
              content: `Generate exactly ${count} multiple-choice quiz questions about: ${topic}. Reply with ONLY a raw JSON array, no prose, no code fences, no [TAG]. Each item must be: { "question": string, "choices": [string,string,string,string], "answer_index": 0|1|2|3, "explanation": short string }`,
            }],
          }),
        });
        if (!resp.ok || !resp.body) throw new Error("Failed to load quiz");
        const reader = resp.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        let full = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          for (let nl: number; (nl = buf.indexOf("\n")) !== -1;) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line.startsWith("data: ")) continue;
            const j = line.slice(6).trim();
            if (j === "[DONE]") break;
            try {
              const p = JSON.parse(j);
              const c = p.choices?.[0]?.delta?.content;
              if (c) full += c;
            } catch { /* ignore */ }
          }
        }
        const clean = full.replace(/^\s*\[[A-Z]+\]\s*/, "").replace(/```json|```/g, "").trim();
        const start = clean.indexOf("[");
        const end = clean.lastIndexOf("]");
        const json = clean.slice(start, end + 1);
        const parsed = JSON.parse(json) as Q[];
        if (cancelled) return;
        setQuestions(parsed.filter(q => q && Array.isArray(q.choices) && q.choices.length === 4));
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