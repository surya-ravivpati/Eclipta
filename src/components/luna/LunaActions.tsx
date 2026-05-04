import { Link } from "@tanstack/react-router";
import { ExternalLink, ArrowRight, Sparkles } from "lucide-react";
import { useState } from "react";
import type { LunaAction } from "@/lib/luna-api";
import { LunaInlineQuiz } from "./LunaInlineQuiz";

interface Props {
  actions: LunaAction[];
  onSendBack?: (text: string) => void;
}

export function LunaActions({ actions, onSendBack }: Props) {
  const [openQuiz, setOpenQuiz] = useState<string | null>(null);
  if (!actions?.length) return null;
  return (
    <div className="mt-3 flex flex-col gap-2">
      {actions.map((a, i) => {
        if (a.kind === "open") {
          return (
            <Link
              key={i}
              to={a.href}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-neon-purple/40 bg-neon-purple/10 text-xs font-bold tracking-wider text-neon-purple hover:bg-neon-purple/20 transition-colors w-fit"
            >
              <ArrowRight className="w-3 h-3" />
              {a.label.toUpperCase()}
            </Link>
          );
        }
        if (a.kind === "resource") {
          return (
            <a
              key={i}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-neon-cyan/40 bg-neon-cyan/5 text-xs text-neon-cyan hover:bg-neon-cyan/15 transition-colors w-fit"
            >
              <ExternalLink className="w-3 h-3" />
              {a.title}
            </a>
          );
        }
        if (a.kind === "quiz") {
          const key = `${i}-${a.topic}`;
          return (
            <div key={i} className="rounded-md border border-neon-pink/40 bg-neon-pink/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-neon-pink">
                  <Sparkles className="w-3 h-3" />
                  QUICK CHECK · {a.topic.toUpperCase()}
                </div>
                {openQuiz !== key && (
                  <button
                    onClick={() => setOpenQuiz(key)}
                    className="text-[10px] font-bold tracking-widest text-neon-pink hover:text-neon-purple"
                  >
                    START →
                  </button>
                )}
              </div>
              {openQuiz === key && (
                <LunaInlineQuiz topic={a.topic} count={a.count} onSendBack={onSendBack} />
              )}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}