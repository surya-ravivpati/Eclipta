import { motion } from "framer-motion";
import { LunaMark } from "./LunaMark";

type LunaState = "idle" | "thinking" | "alert" | "happy";

interface LunaIconProps {
  state: LunaState;
  hasNudge: boolean;
  onClick: () => void;
}

export function LunaIcon({ state, hasNudge, onClick }: LunaIconProps) {
  const pulseVariants = {
    // Slow orbital breath — Luna is present but resting
    idle: {
      scale: [1, 1.03, 0.99, 1.02, 1],
      y: [0, -2, 1, -1, 0],
      transition: { duration: 4.5, repeat: Infinity, ease: "easeInOut" as const },
    },
    // Processing pulse — rapid irregular scale mimics active computation
    thinking: {
      scale: [1, 1.06, 1.01, 1.08, 1.02, 1],
      rotate: [0, -4, 4, -3, 2, 0],
      transition: { duration: 1.3, repeat: Infinity, ease: "easeInOut" as const },
    },
    // Attention — sharp bounce to demand the user's focus
    alert: {
      scale: [1, 1.18, 0.93, 1.12, 0.97, 1],
      y: [0, -4, 1, -2, 0],
      transition: { duration: 0.65, repeat: Infinity, ease: "easeInOut" as const },
    },
    // Celebration — big joyful burst with rotation, settles back
    happy: {
      scale: [1, 1.28, 0.86, 1.18, 0.95, 1],
      rotate: [0, 14, -14, 8, -4, 0],
      transition: { duration: 0.55, repeat: 2, ease: "easeOut" as const },
    },
  };

  return (
    <motion.button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-neon-purple text-primary-foreground flex items-center justify-center neon-glow-purple hover:scale-105 transition-transform"
      animate={pulseVariants[state]}
      whileTap={{ scale: 0.95 }}
      aria-label="Open Luna AI assistant"
    >
      <LunaMark size={22} />
      {/* Thinking ring — orbits when Luna is processing */}
      {state === "thinking" && (
        <motion.span
          className="absolute inset-0 rounded-full border border-neon-cyan/50 pointer-events-none"
          animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 1.3, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      {hasNudge && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 0.5, repeat: 3, ease: "easeOut" }}
          className="absolute -top-1 -right-1 w-4 h-4 bg-neon-pink rounded-full border-2 border-background"
        />
      )}
    </motion.button>
  );
}
