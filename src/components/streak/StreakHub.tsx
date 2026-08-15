import { motion } from "framer-motion";
import { Flame, Snowflake, Trophy, ArrowRight, ShieldCheck, AlertTriangle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useDailyStreak } from "@/hooks/use-daily-streak";
import {
  practicedToday,
  isAtRisk,
  riskMessage,
  nextMilestone,
  flameTierLabel,
  milestoneReward,
  lastNDays,
  weekdayLetter,
  todayUtc,
  STREAK_MILESTONES,
} from "@/lib/daily-streak";
import { cn } from "@/lib/utils";

/**
 * StreakHub - the compelling daily-practice surface. Shows the live streak, a
 * 7-day calendar "chain", loss-aversion urgency when the streak's on the line,
 * the next milestone + its XP reward, and freeze shields. Strictly blue / navy
 * / gold. Used on the battles page and the /streak page.
 */
export function StreakHub({ compact = false }: { compact?: boolean }) {
  const streak = useDailyStreak();
  const done = practicedToday(streak);
  const atRisk = isAtRisk(streak);
  const next = nextMilestone(streak.dailyStreak);
  const reward = next ? milestoneReward(next) : 0;
  const prevMs = next
    ? ([0, ...STREAK_MILESTONES].filter((m) => m < next).pop() ?? 0)
    : streak.dailyStreak;
  const progress =
    next && next > prevMs
      ? Math.max(0, Math.min(1, (streak.dailyStreak - prevMs) / (next - prevMs)))
      : 1;

  const days = lastNDays(compact ? 7 : 14);
  const practiced = new Set(streak.practiceDates);
  const today = todayUtc();

  return (
    <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-5 sm:p-6 relative overflow-hidden">
      {/* ambient flame glow */}
      {streak.dailyStreak > 0 && (
        <div
          className="absolute -top-16 -left-10 w-56 h-56 rounded-full pointer-events-none opacity-40"
          style={{
            background: "radial-gradient(circle, oklch(0.78 0.13 88 / 0.20), transparent 70%)",
          }}
        />
      )}

      <div className="relative flex items-center gap-5">
        <div className="flex flex-col items-center justify-center shrink-0 w-20">
          <motion.div
            animate={
              done
                ? { scale: [1, 1.09, 1] }
                : atRisk
                  ? { scale: [1, 1.04, 1], rotate: [0, -3, 3, 0] }
                  : {}
            }
            transition={{ repeat: Infinity, duration: atRisk ? 1.4 : 2.6, ease: "easeInOut" }}
          >
            <Flame
              className={cn(
                "w-14 h-14",
                streak.dailyStreak > 0 ? "text-primary" : "text-muted-foreground/40",
              )}
              style={
                streak.dailyStreak > 0
                  ? { filter: "drop-shadow(0 0 18px oklch(0.78 0.13 88 / 0.6))" }
                  : undefined
              }
            />
          </motion.div>
          <span className="font-display text-4xl leading-none mt-1 tabular-nums">
            {streak.dailyStreak}
          </span>
          <span className="font-mono text-[8.5px] tracking-[0.22em] text-muted-foreground uppercase mt-1">
            Day Streak
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-primary">
              {streak.dailyStreak > 0 ? flameTierLabel(streak.dailyStreak) : "Daily Practice"}
            </span>
            <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              {Array.from({ length: Math.min(streak.streakFreezes, 5) }).map((_, i) => (
                <Snowflake key={i} className="w-3 h-3 text-neon-cyan" />
              ))}
              {streak.streakFreezes > 0 && (
                <span className="tabular-nums">{streak.streakFreezes}</span>
              )}
            </span>
          </div>

          {/* 7/14-day calendar chain */}
          <div className="flex items-end gap-1.5 mb-3">
            {days.map((d) => {
              const on = practiced.has(d);
              const isToday = d === today;
              return (
                <div key={d} className="flex flex-col items-center gap-1 flex-1 min-w-0">
                  <motion.div
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className={cn(
                      "w-full aspect-square max-w-[26px] rounded-md flex items-center justify-center",
                      on
                        ? "bg-primary/90 text-primary-foreground"
                        : isToday
                          ? "border-2 border-dashed border-primary/60 bg-primary/5"
                          : "border border-foreground/10 bg-foreground/[0.02]",
                    )}
                  >
                    {on && <Flame className="w-3 h-3" />}
                  </motion.div>
                  <span
                    className={cn(
                      "font-mono text-[8px] uppercase",
                      isToday ? "text-primary" : "text-muted-foreground/60",
                    )}
                  >
                    {weekdayLetter(d)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Status / urgency line */}
          {atRisk ? (
            <div className="flex items-start gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 mb-2">
              <AlertTriangle className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
              <p className="text-[11px] leading-snug text-foreground/90">{riskMessage(streak)}</p>
            </div>
          ) : done ? (
            <p className="font-mono text-[10px] tracking-widest text-primary uppercase mb-2 inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> Practiced today - streak secured
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground mb-2">
              Start your streak today - one session is all it takes.
            </p>
          )}

          {/* Next milestone + reward */}
          {next && (
            <>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                <span className="inline-flex items-center gap-1">
                  <Trophy className="w-3 h-3 text-primary" /> {next}-day milestone
                  {reward > 0 && <span className="text-primary font-bold ml-1">+{reward} XP</span>}
                </span>
                <span className="tabular-nums">
                  {streak.dailyStreak}/{next}
                </span>
              </div>
              <div className="h-2 rounded-full bg-foreground/8 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-neon-cyan to-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress * 100}%` }}
                  transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </>
          )}

          {/* CTA when not yet done today */}
          {!done && (
            <Link
              to="/battles"
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-primary to-primary/70 px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 transition-opacity"
            >
              {atRisk ? "Save my streak" : "Practice now"} <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
