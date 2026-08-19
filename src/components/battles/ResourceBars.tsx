import { motion, AnimatePresence } from "framer-motion";
import { Heart } from "lucide-react";
import { ACTIONS } from "./action-config";

/**
 * The two resource bars above each fighter.
 *
 * Both carry their state in words as well as in colour and motion - a bar that
 * only turns pink when it matters is invisible to a screen reader and to a
 * player who cannot tell the two pinks apart.
 *
 * Split out of KnowledgeBattles.tsx.
 */

export function HpBar({
  current,
  max,
  color,
  label,
}: {
  current: number;
  max: number;
  color: string;
  label: string;
}) {
  const pct = Math.max(0, (current / max) * 100);
  const isCritical = max > 0 && current / max < 0.2;
  return (
    <div
      className="w-full"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.max(0, Math.round(current))}
      // A bare "70%" is meaningless: name the bar, and spell out the critical
      // state, which is otherwise carried only by the colour turning pink.
      aria-valuetext={`${label}: ${Math.max(0, Math.round(current))} / ${max}${isCritical ? " - critical" : ""}`}
    >
      <div className="flex justify-between items-center mb-1">
        <span
          className={`text-[10px] font-bold tracking-widest transition-colors ${isCritical ? "text-neon-pink" : "text-muted-foreground"}`}
        >
          {label}
        </span>
        <div className="flex items-center gap-1">
          <motion.span
            animate={isCritical ? { scale: [1, 1.25, 1] } : {}}
            transition={{ repeat: Infinity, duration: 0.65 }}
          >
            <Heart className={`w-3 h-3 ${isCritical ? "text-neon-pink" : "text-neon-pink/70"}`} />
          </motion.span>
          <span
            className={`text-xs font-bold font-display transition-colors ${isCritical ? "text-neon-pink" : ""}`}
          >
            {current}/{max}
          </span>
        </div>
      </div>
      <div className="btt-hp-track">
        <motion.div
          className={`btt-hp-fill ${isCritical ? "btt-hp-fill--critical" : color === "bg-neon-cyan" ? "btt-hp-fill--cyan" : "btt-hp-fill--pink"}`}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

export function FocusBar({
  current,
  max,
  isPlayer = false,
  canCharge = false,
}: {
  current: number;
  max: number;
  isPlayer?: boolean;
  canCharge?: boolean;
}) {
  const chargeCost = ACTIONS.charge.focusCost;
  // Charged means: enough focus, AND if we're showing this on the local player
  // side, the player can actually use Charge right now (phase allows it, no
  // action already locked for this turn, etc.). Without the second gate the
  // pink "CHARGE READY" ticker would stay on screen forever after the first
  // time focus crossed 25, regardless of whether spending it was possible.
  const isCharged = current >= chargeCost && (!isPlayer || canCharge);
  const isWarm = current >= chargeCost - 10 && !isCharged;
  const pulseSpeed = isCharged ? 0.55 : isWarm ? 0.95 : 1.6;
  return (
    <div
      className="w-full"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.max(0, Math.round(current))}
      // "Charged" is signalled visually by a pink pulse - state that in words
      // too, so the cue is not colour-and-motion only.
      aria-valuetext={`Focus: ${Math.max(0, Math.round(current))} / ${max}${isCharged ? " - charged, Charge available" : ""}`}
    >
      <div className="flex justify-between items-center mb-1">
        <motion.span
          className={`text-[10px] font-bold tracking-widest transition-colors ${isCharged ? "text-neon-pink" : isWarm ? "text-neon-purple" : "text-muted-foreground"}`}
          animate={isCharged ? { opacity: [1, 0.6, 1] } : {}}
          transition={{ repeat: Infinity, duration: pulseSpeed }}
        >
          {isCharged ? "CHARGED" : "FOCUS"}
        </motion.span>
        <motion.span
          className={`text-xs font-bold font-display transition-colors ${isCharged ? "text-neon-pink" : "text-neon-purple"}`}
          animate={isCharged ? { scale: [1, 1.06, 1] } : {}}
          transition={{ repeat: Infinity, duration: pulseSpeed }}
        >
          {current}/{max}
        </motion.span>
      </div>
      <div className="flex gap-0.5">
        {Array.from({ length: max / 10 }).map((_, i) => {
          const filled = i < current / 10;
          return (
            <motion.div
              key={i}
              className={`btt-focus-pip ${filled ? (isCharged ? "btt-focus-pip--charged" : "btt-focus-pip--on") : ""}`}
              animate={filled && isCharged ? { opacity: [1, 0.55, 1] } : {}}
              transition={{ repeat: Infinity, duration: pulseSpeed, delay: i * 0.04 }}
            />
          );
        })}
      </div>
      <AnimatePresence>
        {isCharged && isPlayer && (
          <motion.p
            key="charge-ready"
            className="text-[8px] font-bold tracking-widest text-neon-pink mt-0.5 text-right"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.6, 1, 0.6] }}
            exit={{ opacity: 0 }}
            transition={{
              opacity: { repeat: Infinity, duration: 0.55, ease: "easeInOut" },
            }}
          >
            CHARGE READY
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
