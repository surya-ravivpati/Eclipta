import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Flame, Snowflake, Trophy, Check, Lock } from "lucide-react";
import { StreakHub } from "@/components/streak/StreakHub";
import { useDailyStreak } from "@/hooks/use-daily-streak";
import {
  STREAK_MILESTONES,
  milestoneReward,
  lastNDays,
  todayUtc,
  flameTierLabel,
} from "@/lib/daily-streak";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/streak")({
  head: () => ({
    meta: [
      { title: "Your Streak - Eclipta" },
      { name: "description", content: "Your daily-practice streak, calendar, and milestones." },
    ],
  }),
  component: StreakPage,
});

function Heatmap({ practiced }: { practiced: Set<string> }) {
  const window = lastNDays(56); // 8-week cap
  // Trimming to the earliest practiced day avoids padding the grid with
  // weeks that predate the user's first session - those cells can only ever
  // be empty, so they're not "gap" information, just dead space.
  const earliest = practiced.size > 0 ? [...practiced].sort()[0] : null;
  const days = earliest ? window.filter((d) => d >= earliest) : window.slice(-7);
  const today = todayUtc();
  // chunk into weeks (columns of 7)
  const weeks: string[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {weeks.map((wk, wi) => (
        <div key={wi} className="flex flex-col gap-1.5">
          {wk.map((d) => {
            const on = practiced.has(d);
            const isToday = d === today;
            return (
              <div
                key={d}
                title={d}
                className={cn(
                  "w-4 h-4 rounded-sm",
                  on ? "bg-primary" : "bg-white/[0.05]",
                  isToday && "ring-2 ring-primary/70",
                )}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function StreakPage() {
  const streak = useDailyStreak();
  const practiced = new Set(streak.practiceDates);
  const practicedCount = streak.practiceDates.length;

  const stats = [
    { label: "Current", value: streak.dailyStreak, sub: "days", Icon: Flame },
    { label: "Longest", value: streak.longestDailyStreak, sub: "days", Icon: Trophy },
    { label: "Freezes", value: streak.streakFreezes, sub: "saved", Icon: Snowflake },
    { label: "Active days", value: practicedCount, sub: "last 90", Icon: Check },
  ];

  return (
    <div
      className="min-h-screen pt-24 pb-16 px-5"
      style={{ background: "var(--brand-bg, #0B1020)", color: "var(--brand-ink, #F4F1EA)" }}
    >
      <div className="max-w-3xl mx-auto">
        <header className="mb-7">
          <p className="font-mono text-[11px] tracking-[0.32em] uppercase text-primary mb-2">
            Daily Practice
          </p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold leading-none">
            {streak.dailyStreak > 0
              ? `${flameTierLabel(streak.dailyStreak)} | ${streak.dailyStreak} days`
              : "Build your streak"}
          </h1>
          <p className="text-muted-foreground text-sm mt-2 max-w-prose">
            Show up once a day - a battle, a lesson, a Luna session - and your streak grows. Miss a
            day and a freeze saves you (you earn one every week). Hit a milestone for bonus XP.
          </p>
        </header>

        <div className="mb-6">
          <StreakHub />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {stats.map((s) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
            >
              <s.Icon className="w-4 h-4 text-primary mb-2" />
              <div className="font-display text-2xl font-bold tabular-nums">{s.value}</div>
              <div className="font-mono text-[9px] tracking-widest uppercase text-muted-foreground">
                {s.label} | {s.sub}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Heatmap */}
        <section className="mb-8">
          <h2 className="font-mono text-[11px] tracking-[0.24em] uppercase text-muted-foreground mb-3">
            Last 8 weeks
          </h2>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <Heatmap practiced={practiced} />
          </div>
        </section>

        {/* Milestone ladder */}
        <section>
          <h2 className="font-mono text-[11px] tracking-[0.24em] uppercase text-muted-foreground mb-3">
            Milestones
          </h2>
          <div className="space-y-2">
            {STREAK_MILESTONES.map((m) => {
              const achieved = streak.longestDailyStreak >= m;
              const current =
                !achieved &&
                streak.dailyStreak < m &&
                STREAK_MILESTONES.find((x) => x > streak.dailyStreak) === m;
              return (
                <div
                  key={m}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-4 py-3",
                    achieved
                      ? "border-primary/40 bg-primary/[0.06]"
                      : current
                        ? "border-neon-cyan/40 bg-neon-cyan/[0.05]"
                        : "border-white/10 bg-white/[0.02]",
                  )}
                >
                  <div
                    className={cn(
                      "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                      achieved
                        ? "bg-primary/20 text-primary"
                        : "bg-white/[0.04] text-muted-foreground",
                    )}
                  >
                    {achieved ? <Check className="w-4 h-4" /> : <Lock className="w-3.5 h-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-bold text-base">{m}-day streak</div>
                    <div className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">
                      {flameTierLabel(m)}
                      {current ? " | next up" : ""}
                    </div>
                  </div>
                  <div
                    className={cn(
                      "font-bold tabular-nums text-sm",
                      achieved ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    +{milestoneReward(m)} XP
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
