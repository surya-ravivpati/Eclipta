import { motion, AnimatePresence } from "framer-motion";
import { isHarmful, type ActiveEffect } from "./effects";

/**
 * The two things drawn over the arena rather than in it: an ultimate's
 * announcement, and the status chips under each fighter's bars.
 *
 * Split out of KnowledgeBattles.tsx.
 */

// An ultimate is the loudest thing that happens in a battle, so the cast gets
// its own overlay: the move's name, who cast it, and any random branches it
// rolled (the Gambler ultimates lean on this to show what the dice gave).
export function UltimateCastOverlay({
  cast,
}: {
  cast: { name: string; caster: "player" | "opponent"; rolls: string[] };
}) {
  const mine = cast.caster === "player";
  const color = mine ? "text-neon-purple" : "text-neon-pink";
  const border = mine ? "border-neon-purple/60" : "border-neon-pink/60";
  const bg = mine ? "bg-neon-purple/10" : "bg-neon-pink/10";
  return (
    <motion.div
      className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, 0] }}
      transition={{ duration: 1.8, times: [0, 0.06, 0.78, 1] }}
    >
      <motion.div
        className={`px-10 py-6 border-2 ${border} ${bg} text-center backdrop-blur-sm max-w-[90%]`}
        initial={{ scale: 0.55, y: 24 }}
        animate={{ scale: [0.55, 1.12, 1], y: [24, -4, 0] }}
        transition={{ duration: 0.38, ease: "easeOut" }}
      >
        <p className={`text-[10px] font-bold tracking-[0.3em] ${color} opacity-70`}>
          {mine ? "ULTIMATE" : "ENEMY ULTIMATE"}
        </p>
        <p className={`text-2xl font-bold font-display tracking-widest ${color} mt-1`}>
          {cast.name.toUpperCase()}
        </p>
        {cast.rolls.length > 0 && (
          <p className={`text-xs font-bold mt-2 ${color} opacity-80 tracking-wider`}>
            {cast.rolls.join("  |  ")}
          </p>
        )}
      </motion.div>
    </motion.div>
  );
}

/** Active status effects as compact chips under a fighter's bars. */
export function EffectChips({
  effects,
  side,
}: {
  effects: ActiveEffect[];
  side: "left" | "right";
}) {
  if (effects.length === 0) return null;
  return (
    <div className={`mt-1.5 flex flex-wrap gap-1 ${side === "right" ? "justify-end" : ""}`}>
      <AnimatePresence>
        {effects.map((e) => (
          <motion.span
            key={`${e.kind}-${e.label}`}
            className={`px-1.5 py-0.5 border text-[8px] font-bold tracking-widest tabular-nums ${
              isHarmful(e.kind)
                ? "border-neon-pink/50 text-neon-pink bg-neon-pink/5"
                : "border-neon-cyan/50 text-neon-cyan bg-neon-cyan/5"
            }`}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
          >
            {e.label}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}
