import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import type { LogEntry } from "./types";

/**
 * The running record of a match.
 *
 * Split out of KnowledgeBattles.tsx.
 */

export function BattleLog({ logs }: { logs: LogEntry[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo(0, ref.current.scrollHeight);
  }, [logs]);

  function colorFor(e: LogEntry): string {
    if (e.actor === "system") {
      if (e.actionType === "combo") return "text-neon-pink";
      if (e.actionType === "separator") return "text-muted-foreground";
      if (e.actionType === "info") return "text-tier-gold";
      return "text-muted-foreground";
    }
    if (e.actor === "player") {
      if (e.actionType === "miss") return "text-neon-pink/80";
      if (e.actionType === "heal") return "text-neon-cyan";
      if (e.actionType === "ultimate") return "text-neon-purple";
      return "text-foreground";
    }
    // opponent
    if (e.actionType === "miss") return "text-muted-foreground";
    if (e.actionType === "heal") return "text-neon-cyan";
    return "text-neon-pink";
  }

  const turn = logs.filter((e) => e.actionType === "separator").length || 1;

  return (
    <div className="btt-log overflow-hidden">
      <div className="btt-log-head">
        <span className="btt-mono-text text-[10px] tracking-widest text-muted-foreground">
          BATTLE LOG
        </span>
        <span className="btt-mono-text text-[10px] tabular-nums text-muted-foreground">
          T-{String(turn).padStart(2, "0")}
        </span>
      </div>
      <div ref={ref} className="p-3 h-48 overflow-y-auto space-y-1">
        {logs.length === 0 && (
          <p className="text-[10px] text-muted-foreground italic">Battle log will appear here...</p>
        )}
        {logs.map((e) => (
          <motion.p
            key={e.id}
            className={`btt-mono-text text-[10px] leading-snug ${colorFor(e)}`}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <span className="text-muted-foreground/60 tabular-nums mr-1.5 font-mono">
              {String(e.id).padStart(2, "0")}
            </span>
            {e.result}
            {e.value !== undefined && e.actor !== "system" && (
              <span className="ml-1 text-[9px] text-muted-foreground/50 tabular-nums font-mono">
                [{e.value}]
              </span>
            )}
          </motion.p>
        ))}
      </div>
    </div>
  );
}
