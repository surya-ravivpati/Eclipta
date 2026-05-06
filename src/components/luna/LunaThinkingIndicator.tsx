import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const PHASES = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"] as const;

/** Cycles through all 8 lunar phases while Luna is generating a reply. */
export function LunaThinkingIndicator({ compact = false }: { compact?: boolean }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setPhase(p => (p + 1) % PHASES.length), 260);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={`flex items-center gap-2 ${compact ? "px-3 py-2" : "px-4 py-3"}`}>
      <AnimatePresence mode="wait">
        <motion.span
          key={phase}
          initial={{ opacity: 0, scale: 0.7, rotate: -30 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={{ opacity: 0, scale: 0.7, rotate: 30 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className={`select-none leading-none ${compact ? "text-base" : "text-xl"}`}
        >
          {PHASES[phase]}
        </motion.span>
      </AnimatePresence>
      <motion.span
        className={`text-muted-foreground ${compact ? "text-xs" : "text-sm"}`}
        animate={{ opacity: [0.45, 1, 0.45] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      >
        Luna is thinking…
      </motion.span>
    </div>
  );
}
