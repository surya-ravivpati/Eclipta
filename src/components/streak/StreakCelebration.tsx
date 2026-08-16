import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Flame, Sparkles, X } from "lucide-react";
import { flameTierLabel } from "@/lib/daily-streak";

interface Celebration {
  milestone: number;
  reward: number;
  streak: number;
}

// Deterministic-ish confetti spread (no Math.random at module load - varied by index).
const CONFETTI = Array.from({ length: 44 }, (_, i) => {
  const angle = (i / 44) * Math.PI * 2;
  const dist = 120 + ((i * 53) % 180);
  return {
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist - 40,
    rot: (i * 47) % 360,
    delay: (i % 8) * 0.02,
    gold: i % 2 === 0,
    size: 6 + (i % 4) * 2,
  };
});

/**
 * Mounts once at the app root and listens for the global streak-milestone
 * event. When a milestone is newly crossed anywhere (battle finish, lesson,
 * Luna, etc.), it bursts a celebration overlay - the dopamine payoff that makes
 * the streak worth protecting.
 */
export function StreakCelebrationListener() {
  const [active, setActive] = useState<Celebration | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as Celebration;
      if (detail?.milestone) setActive(detail);
    };
    window.addEventListener("eclipta:streak-milestone", handler);
    return () => window.removeEventListener("eclipta:streak-milestone", handler);
  }, []);

  // Auto-dismiss after a beat (but let the user close early).
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setActive(null), 6500);
    return () => clearTimeout(t);
  }, [active]);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          // A scrim is dark in both themes by definition - it exists to push the
          // page back, and an ivory one in light mode would push nothing back.
          // eslint-disable-next-line vibesafe/theme-aware-colors
          style={{ background: "rgba(4,6,12,0.78)", backdropFilter: "blur(8px)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setActive(null)}
        >
          {/* confetti burst */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
            {CONFETTI.map((c, i) => (
              <motion.span
                key={i}
                className="absolute rounded-[2px]"
                style={{
                  width: c.size,
                  height: c.size * 1.6,
                  background: c.gold ? "oklch(0.82 0.14 88)" : "oklch(0.70 0.14 245)",
                }}
                initial={{ x: 0, y: 0, opacity: 0, rotate: 0, scale: 1 }}
                animate={{
                  x: c.x,
                  y: [c.y, c.y + 260],
                  opacity: [1, 1, 0],
                  rotate: c.rot,
                  scale: 0.6,
                }}
                transition={{ duration: 2.2, delay: c.delay, ease: "easeOut" }}
              />
            ))}
          </div>

          <motion.div
            className="relative rounded-3xl border border-primary/30 bg-card px-8 py-9 text-center max-w-sm w-full"
            style={{
              boxShadow: "0 40px 120px rgba(0,0,0,0.7), 0 0 70px oklch(0.78 0.13 88 / 0.22)",
            }}
            initial={{ scale: 0.6, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground active:scale-[0.97]"
              onClick={() => setActive(null)}
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            <motion.div
              animate={{ scale: [1, 1.15, 1], rotate: [0, -6, 6, 0] }}
              transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
              className="inline-block"
            >
              <Flame
                className="w-20 h-20 text-primary mx-auto"
                style={{ filter: "drop-shadow(0 0 30px oklch(0.78 0.13 88 / 0.7))" }}
              />
            </motion.div>

            <p className="font-mono text-[11px] tracking-[0.3em] uppercase text-primary mt-3">
              {flameTierLabel(active.streak)} unlocked
            </p>
            <h2 className="font-display text-5xl font-bold tabular-nums mt-1">
              {active.milestone}
            </h2>
            <p className="font-mono text-[11px] tracking-[0.24em] uppercase text-muted-foreground">
              Day Streak
            </p>

            <p className="text-sm text-foreground/90 mt-4 leading-snug">
              {active.milestone} days in a row. This is the habit compounding - keep showing up.
            </p>

            {active.reward > 0 && (
              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="font-bold text-primary tabular-nums">+{active.reward} XP</span>
                <span className="text-[11px] text-muted-foreground">milestone bonus</span>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
