import { motion } from "framer-motion";

type LunaState = "idle" | "thinking" | "alert" | "happy";

interface LunaIconProps {
  state: LunaState;
  hasNudge: boolean;
  onClick: () => void;
}

export function LunaIcon({ state, hasNudge, onClick }: LunaIconProps) {
  const pulseVariants = {
    idle: {
      scale: [1, 1.02, 1],
      transition: { duration: 3, repeat: Infinity, ease: "easeInOut" },
    },
    thinking: {
      scale: [1, 1.05, 1],
      rotate: [0, 3, -3, 0],
      transition: { duration: 1.5, repeat: Infinity, ease: "easeInOut" },
    },
    alert: {
      scale: [1, 1.08, 1],
      transition: { duration: 0.8, repeat: Infinity, ease: "easeInOut" },
    },
    happy: {
      scale: [1, 1.1, 1],
      transition: { duration: 0.6, repeat: 2, ease: "easeInOut" },
    },
  };

  const emoji = state === "thinking" ? "🤔" : state === "alert" ? "⚡" : state === "happy" ? "✨" : "🌙";

  return (
    <motion.button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-neon-purple text-primary-foreground flex items-center justify-center neon-glow-purple hover:scale-105 transition-transform"
      animate={pulseVariants[state]}
      whileTap={{ scale: 0.95 }}
      aria-label="Open Luna AI assistant"
    >
      <span className="text-xl font-display font-bold">{emoji}</span>
      {hasNudge && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-1 -right-1 w-4 h-4 bg-neon-pink rounded-full border-2 border-background"
        />
      )}
    </motion.button>
  );
}
