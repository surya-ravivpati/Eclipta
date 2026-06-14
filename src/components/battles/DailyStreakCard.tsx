import { motion } from "framer-motion";
import { Flame, Snowflake, Trophy } from "lucide-react";
import { useDailyStreak } from "@/hooks/use-daily-streak";
import { practicedToday, nextMilestone, flameTierLabel, streakMessage } from "@/lib/daily-streak";

/**
 * Daily-practice streak card for the Battles page. Shows the live streak, a
 * "did I practice today" status, progress to the next milestone, and freeze
 * shields. Encouraging, never guilt-y (see docs/daily-practice-streak.md).
 */
export function DailyStreakCard() {
  const streak = useDailyStreak();
  const done = practicedToday(streak);
  const next = nextMilestone(streak.dailyStreak);
  const prevMilestone = next ? [0, 3, 7, 14, 30, 60, 100, 180].filter((m) => m < next).pop() ?? 0 : streak.dailyStreak;
  const progress = next && next > prevMilestone
    ? Math.max(0, Math.min(1, (streak.dailyStreak - prevMilestone) / (next - prevMilestone)))
    : 1;

  return (
    <motion.div
      className="btt-card p-5 relative overflow-hidden"
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
    >
      <div className="flex items-center gap-5">
        {/* Flame + count */}
        <div className="flex flex-col items-center justify-center shrink-0 w-24">
          <motion.div
            animate={done ? { scale: [1, 1.08, 1] } : {}}
            transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
            className="relative"
          >
            <Flame
              className={`w-12 h-12 ${streak.dailyStreak > 0 ? "text-neon-pink" : "text-muted-foreground/40"}`}
              style={streak.dailyStreak > 0 ? { filter: "drop-shadow(0 0 16px oklch(0.6 0.24 350 / 0.55))" } : undefined}
            />
          </motion.div>
          <span className="btt-shout text-4xl leading-none mt-1">{streak.dailyStreak}</span>
          <span className="btt-mono-text text-[9px] tracking-[0.22em] text-muted-foreground uppercase mt-1">
            Day Streak
          </span>
        </div>

        {/* Status + milestone */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3 mb-1">
            <span className="btt-mono-text text-[10px] tracking-[0.2em] uppercase text-neon-pink">
              {streak.dailyStreak > 0 ? flameTierLabel(streak.dailyStreak) : "Daily Practice"}
            </span>
            <span className="flex items-center gap-2 text-[10px] text-muted-foreground">
              {/* Freeze shields */}
              {Array.from({ length: Math.min(streak.streakFreezes, 5) }).map((_, i) => (
                <Snowflake key={i} className="w-3 h-3 text-neon-cyan" />
              ))}
              {streak.streakFreezes > 0 && (
                <span className="tabular-nums">{streak.streakFreezes} freeze{streak.streakFreezes === 1 ? "" : "s"}</span>
              )}
            </span>
          </div>

          <p className="text-sm text-foreground/90 leading-snug mb-3">{streakMessage(streak)}</p>

          {next && (
            <>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                <span className="inline-flex items-center gap-1">
                  <Trophy className="w-3 h-3 text-neon-purple" /> Next: {next}-day milestone
                </span>
                <span className="tabular-nums">{streak.dailyStreak}/{next}</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-neon-pink to-neon-purple"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress * 100}%` }}
                  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </>
          )}

          {done && (
            <p className="btt-mono-text text-[10px] tracking-widest text-neon-cyan uppercase mt-2">
              ✓ Practiced today
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
