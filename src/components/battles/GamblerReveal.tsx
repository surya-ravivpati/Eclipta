import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dices, Swords } from "lucide-react";
import type { GamblerRoll } from "./types";

/**
 * The Gambler's stat roll, revealed one slot at a time.
 *
 * A slot machine rather than a table because the Gambler's whole proposition is
 * that the numbers are not yours to choose - watching them settle is the point,
 * and a table would just be the result.
 *
 * Split out of KnowledgeBattles.tsx.
 */

// Stat definitions for the slot-machine reveal sequence.
interface RevealDef {
  key: keyof GamblerRoll;
  label: string;
  /** Formatted value shown once locked */
  lockText: (s: GamblerRoll) => string;
  /** Integer range cycled while unlocked (avoids floating-point flicker) */
  cycleRange: [number, number];
  /** Returns a 0-1 score for quality colouring (higher = better) */
  qualityScore: (s: GamblerRoll) => number;
  hasQuality: boolean;
}

const REVEAL_DEFS: RevealDef[] = [
  {
    key: "maxHp",
    label: "HP",
    lockText: (s) => String(s.maxHp),
    cycleRange: [90, 220],
    qualityScore: (s) => (s.maxHp - 90) / 130,
    hasQuality: true,
  },
  {
    key: "baseDamage",
    label: "DMG",
    lockText: (s) => String(s.baseDamage),
    cycleRange: [10, 40],
    qualityScore: (s) => (s.baseDamage - 10) / 30,
    hasQuality: true,
  },
  {
    key: "defense",
    label: "DEF",
    lockText: (s) => `${Math.round(s.defense * 100)}%`,
    cycleRange: [0, 20],
    qualityScore: (s) => s.defense / 0.2,
    hasQuality: true,
  },
  {
    key: "timeSeconds",
    label: "TIME",
    lockText: (s) => `${s.timeSeconds}s`,
    cycleRange: [20, 80],
    qualityScore: (s) => (s.timeSeconds - 20) / 60,
    hasQuality: true,
  },
  {
    key: "healAmount",
    label: "HEAL",
    lockText: (s) => `+${s.healAmount}`,
    cycleRange: [0, 30],
    qualityScore: (s) => s.healAmount / 30,
    hasQuality: true,
  },
  {
    key: "critBonus",
    label: "CRIT",
    lockText: (s) => `+${Math.round(s.critBonus * 100)}%`,
    cycleRange: [0, 40],
    qualityScore: (s) => s.critBonus / 0.4,
    hasQuality: true,
  },
  {
    key: "diffMin",
    label: "DIFF",
    lockText: (s) => `${s.diffMin}-${s.diffMax}`,
    cycleRange: [2, 10],
    qualityScore: () => 0.5,
    hasQuality: false,
  },
];

type StatQuality = "poor" | "standard" | "good" | "legendary";

function scoreToQuality(score: number): StatQuality {
  if (score < 0.25) return "poor";
  if (score < 0.55) return "standard";
  if (score < 0.82) return "good";
  return "legendary";
}

const QUALITY_STYLE: Record<
  StatQuality,
  { label: string; value: string; border: string; bg: string }
> = {
  poor: { label: "LOW", value: "text-muted-foreground/70", border: "border-border/50", bg: "" },
  standard: { label: "BASE", value: "text-foreground", border: "border-border/70", bg: "" },
  good: {
    label: "HIGH",
    value: "text-neon-cyan",
    border: "border-neon-cyan/50",
    bg: "bg-neon-cyan/5",
  },
  legendary: {
    label: "MAX",
    value: "text-neon-pink",
    border: "border-neon-pink/60",
    bg: "bg-neon-pink/5",
  },
};

/** Pre-battle slot-machine reveal for the Gambler archetype. */
export function GamblerRevealScreen({
  stats,
  opponentName,
  onComplete,
}: {
  stats: GamblerRoll;
  opponentName: string;
  onComplete: () => void;
}) {
  const STAGGER = 850; // ms between each stat locking (7 stats - keep it snappy)

  const [lockedCount, setLockedCount] = useState(0);
  const lockedRef = useRef(0);
  lockedRef.current = lockedCount;

  const [cycleNums, setCycleNums] = useState<number[]>(() =>
    REVEAL_DEFS.map((d) => d.cycleRange[0]),
  );
  const [allDone, setAllDone] = useState(false);

  useEffect(() => {
    // Cycle all not-yet-locked stats every 80 ms (slot-machine effect)
    const interval = setInterval(() => {
      setCycleNums(
        REVEAL_DEFS.map((d, i) =>
          i < lockedRef.current
            ? 0
            : d.cycleRange[0] + Math.floor(Math.random() * (d.cycleRange[1] - d.cycleRange[0] + 1)),
        ),
      );
    }, 80);

    // Lock one stat at a time with a staggered sequence
    const lockTimers = REVEAL_DEFS.map((_, i) =>
      setTimeout(
        () => {
          lockedRef.current = i + 1;
          setLockedCount(i + 1);
        },
        STAGGER * (i + 1),
      ),
    );

    // Show the CTA once all stats are locked
    const doneTimer = setTimeout(
      () => {
        clearInterval(interval);
        setAllDone(true);
      },
      STAGGER * REVEAL_DEFS.length + 700,
    );

    return () => {
      clearInterval(interval);
      lockTimers.forEach(clearTimeout);
      clearTimeout(doneTimer);
    };
  }, []);

  // Overall build rating - average quality score across stats that have one
  const qualityStats = REVEAL_DEFS.filter((d) => d.hasQuality);
  const avgQuality =
    qualityStats.reduce((s, d) => s + d.qualityScore(stats), 0) / qualityStats.length;

  const runLabel =
    avgQuality >= 0.78
      ? "GOD ROLL"
      : avgQuality >= 0.6
        ? "BLESSED RUN"
        : avgQuality >= 0.42
          ? "SOLID BUILD"
          : avgQuality >= 0.25
            ? "BALANCED ODDS"
            : "GLASS CANNON";

  const runColor =
    avgQuality >= 0.78
      ? "text-neon-pink"
      : avgQuality >= 0.6
        ? "text-tier-gold"
        : avgQuality >= 0.42
          ? "text-neon-cyan"
          : "text-foreground";

  return (
    <motion.div
      className="btt-card p-8 text-center"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      {/* Header */}
      <div className="mb-5">
        <motion.div
          className="w-14 h-14 mx-auto mb-3 border-2 border-tier-gold/50 bg-tier-gold/10 flex items-center justify-center"
          animate={
            !allDone
              ? {
                  rotate: [0, 12, -12, 0],
                  borderColor: [
                    "oklch(0.8 0.15 80 / 0.5)",
                    "oklch(0.75 0.18 50 / 0.8)",
                    "oklch(0.8 0.15 80 / 0.5)",
                  ],
                }
              : {}
          }
          transition={{ duration: 1.2, repeat: Infinity }}
        >
          <Dices className="w-7 h-7 text-tier-gold" />
        </motion.div>
        <h3 className="btt-shout text-3xl mb-0.5">
          {allDone ? "FATE HAS SPOKEN" : "ROLLING FATE..."}
        </h3>
        <p className="text-[10px] text-muted-foreground tracking-widest">
          {allDone ? `vs ${opponentName}` : "YOUR BUILD IS BEING DETERMINED"}
        </p>
      </div>

      {/* 2-column stat grid - each cell cycles then locks with a quality pop */}
      <div className="grid grid-cols-2 gap-2 mb-5 text-left">
        {REVEAL_DEFS.map((def, i) => {
          const isLocked = i < lockedCount;
          const justLocked = i === lockedCount - 1;
          const quality = def.hasQuality ? scoreToQuality(def.qualityScore(stats)) : "standard";
          const qs = QUALITY_STYLE[quality];

          return (
            <motion.div
              key={def.key}
              className={`border p-4 transition-colors duration-300 ${
                isLocked ? `${qs.border} ${qs.bg}` : "border-border/30 bg-secondary/10"
              }`}
              animate={justLocked ? { scale: [1, 1.07, 1] } : {}}
              transition={{ duration: 0.35 }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[9px] font-bold tracking-widest text-muted-foreground">
                  {def.label}
                </span>
                {isLocked && def.hasQuality && (
                  <motion.span
                    className={`text-[8px] font-bold tracking-widest ${qs.value}`}
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    {qs.label}
                  </motion.span>
                )}
              </div>
              {/* Value: cycling integers when unlocked, formatted text when locked */}
              <div
                className={`btt-shout text-3xl tabular-nums ${
                  isLocked ? qs.value : "text-foreground/50"
                }`}
              >
                {isLocked ? def.lockText(stats) : cycleNums[i]}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Overall run rating + CTA - appears after all stats are locked */}
      <AnimatePresence>
        {allDone && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <p className={`text-sm font-bold font-display tracking-widest ${runColor}`}>
              {runLabel}
            </p>
            <motion.button
              onClick={onComplete}
              className="w-full py-3 bg-neon-pink text-primary-foreground font-bold text-sm tracking-widest hover:opacity-90 transition-opacity"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.35 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              <Swords className="w-4 h-4 inline mr-2" />
              ENTER BATTLE
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
