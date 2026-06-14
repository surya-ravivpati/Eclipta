import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Crown, Skull, Target, Zap, Flame, AlertTriangle, BookOpen, RotateCcw, Star, TrendingUp, TrendingDown, Radio, Ghost, Bot } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ARCHETYPES } from "./archetypes";
import type { BattleStats, Difficulty } from "./types";
import { recordBattleMastery, fetchMastery, getMasteryRank, getMasteryStats, emptyMastery, type ArchetypeMastery } from "@/lib/archetype-mastery";
import { supabase } from "@/integrations/supabase/client";

export function BattleReport({ stats, onRematch, onContinueWithEcliptar, onBack, ratingChange, opponentType, onLiveRematch, liveRematchState }: {
  stats: BattleStats;
  onRematch: () => void;
  onContinueWithEcliptar?: () => void;
  onBack: () => void;
  ratingChange?: number | null;
  opponentType?: string;
  /** Click handler for the "Quick Rematch" button on live PvP only. */
  onLiveRematch?: () => void;
  /** Drives the rematch button label: idle → "QUICK REMATCH", waiting → "WAITING FOR OPPONENT…", starting → "STARTING…". */
  liveRematchState?: "idle" | "waiting" | "starting";
}) {
  const xpSavedRef = useRef(false);
  const [xpCount, setXpCount] = useState(0);
  const [mastery, setMastery] = useState<ArchetypeMastery | null>(null);
  const [prevBestStreak, setPrevBestStreak] = useState(0);

  // Animate XP count-up
  useEffect(() => {
    const target = stats.xp;
    if (target <= 0) { setXpCount(0); return; }
    const duration = 1200;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setXpCount(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stats.xp]);

  // Award XP and update profile on mount
  useEffect(() => {
    if (xpSavedRef.current) return;
    xpSavedRef.current = true;

    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // XP is awarded once at battle end (see finishBattle in
        // KnowledgeBattles) — not here — so it lands even if this screen is
        // skipped by a live rematch or an early exit.

        // Update battle stats on profile
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("total_sessions, total_questions, total_correct, current_streak, best_streak, weak_areas")
          .eq("user_id", user.id)
          .maybeSingle();

        if (profile) {
          const p = profile as any;
          const newStreak = stats.won ? (p.current_streak ?? 0) + 1 : 0;
          const newBest = Math.max(p.best_streak ?? 0, newStreak);

          // Detect weak topics from missed questions
          const missedTopics = stats.records
            .filter(r => !r.correct)
            .map(r => r.question.topic);
          const existingWeak: string[] = p.weak_areas ?? [];
          const mergedWeak = [...new Set([...existingWeak, ...missedTopics])].slice(0, 10);

          await supabase
            .from("user_profiles")
            .update({
              total_sessions: (p.total_sessions ?? 0) + 1,
              total_questions: (p.total_questions ?? 0) + stats.totalQuestions,
              total_correct: (p.total_correct ?? 0) + stats.correctAnswers,
              current_streak: newStreak,
              best_streak: newBest,
              weak_areas: mergedWeak,
            })
            .eq("user_id", user.id);

          // Log battle to learning_history
          await supabase.from("learning_history").insert({
            user_id: user.id,
            session_type: "battle",
            topic: `Battle as ${ARCHETYPES[stats.archetype].name}`,
            was_correct: stats.won,
            response_time_ms: stats.fastestAnswer < Infinity ? Math.round(stats.fastestAnswer * 1000) : null,
            luna_summary: `${stats.won ? "Won" : "Lost"} battle. ${stats.correctAnswers}/${stats.totalQuestions} correct. +${stats.xp} XP.`,
          });
        }

        // Archetype mastery — record battle and expose updated stats
        try {
          const before = await fetchMastery(stats.archetype);
          setPrevBestStreak(before?.best_streak ?? 0);
          await recordBattleMastery(
            stats.archetype, stats.won,
            stats.longestStreak, stats.correctAnswers, stats.totalQuestions,
          );
          const after = await fetchMastery(stats.archetype);
          setMastery(after ?? emptyMastery(stats.archetype));
        } catch { /* non-critical */ }
      } catch { /* non-critical */ }
    })();
  }, []);

  const accuracy = stats.totalQuestions > 0 ? Math.round((stats.correctAnswers / stats.totalQuestions) * 100) : 0;
  const missed = stats.records.filter(r => !r.correct);
  const arch = ARCHETYPES[stats.archetype];

  // Find weakest difficulty
  const diffCounts: Record<Difficulty, { total: number; wrong: number }> = {
    easy: { total: 0, wrong: 0 },
    medium: { total: 0, wrong: 0 },
    hard: { total: 0, wrong: 0 },
  };
  stats.records.forEach(r => {
    diffCounts[r.question.difficulty].total++;
    if (!r.correct) diffCounts[r.question.difficulty].wrong++;
  });
  const weakestDiff = (Object.entries(diffCounts) as [Difficulty, { total: number; wrong: number }][])
    .filter(([, v]) => v.total > 0)
    .sort((a, b) => (b[1].wrong / b[1].total) - (a[1].wrong / a[1].total))[0]?.[0] || "medium";

  // Find weakest topic
  const topicCounts: Record<string, { total: number; wrong: number }> = {};
  stats.records.forEach(r => {
    if (!topicCounts[r.question.topic]) topicCounts[r.question.topic] = { total: 0, wrong: 0 };
    topicCounts[r.question.topic].total++;
    if (!r.correct) topicCounts[r.question.topic].wrong++;
  });
  const weakestTopic = Object.entries(topicCounts)
    .filter(([, v]) => v.wrong > 0)
    .sort((a, b) => (b[1].wrong / b[1].total) - (a[1].wrong / a[1].total))[0]?.[0];

  return (
    <motion.div
      className="glass-panel p-6"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      {/* Header */}
      <div className="text-center mb-6">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.5 }}>
          {stats.won
            ? <Crown className="w-14 h-14 text-neon-pink mx-auto mb-3" />
            : <Skull className="w-14 h-14 text-muted-foreground mx-auto mb-3" />
          }
        </motion.div>
        <h3 className="text-3xl font-bold font-display mb-1">{stats.won ? "VICTORY!" : "DEFEATED"}</h3>
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <arch.icon className={`w-3.5 h-3.5 ${arch.color}`} />
          <span className={arch.color}>{arch.name}</span>
        </div>
      </div>

      {/* Score row */}
      <div className="flex justify-center gap-6 mb-6">
        <div className="text-center">
          <div className="text-2xl font-bold font-display text-neon-purple">{stats.score}</div>
          <div className="text-[10px] tracking-widest text-muted-foreground">SCORE</div>
        </div>
        <div className="text-center">
          <motion.div
            className="text-2xl font-bold font-display text-neon-cyan tabular-nums"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.3, type: "spring" }}
          >
            +{xpCount} XP
          </motion.div>
          <div className="text-[10px] tracking-widest text-muted-foreground">EARNED</div>
        </div>
        {ratingChange != null && opponentType !== "bot" && (
          <div className="text-center">
            <motion.div
              className={`text-2xl font-bold font-display tabular-nums ${ratingChange >= 0 ? "text-neon-cyan" : "text-neon-pink"}`}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.5, type: "spring" }}
            >
              {ratingChange >= 0 ? <TrendingUp className="inline w-5 h-5 mr-0.5" /> : <TrendingDown className="inline w-5 h-5 mr-0.5" />}
              {ratingChange >= 0 ? `+${ratingChange}` : ratingChange}
            </motion.div>
            <div className="text-[10px] tracking-widest text-muted-foreground flex items-center gap-0.5 justify-center">
              {opponentType === "live" && <><Radio className="w-2.5 h-2.5" /> LIVE RATING</>}
              {opponentType === "ghost" && <><Ghost className="w-2.5 h-2.5" /> GHOST RATING</>}
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full bg-secondary/30 mb-4">
          <TabsTrigger value="overview" className="flex-1 text-xs font-bold tracking-widest">OVERVIEW</TabsTrigger>
          <TabsTrigger value="missed" className="flex-1 text-xs font-bold tracking-widest">
            MISSED ({missed.length})
          </TabsTrigger>
          <TabsTrigger value="practice" className="flex-1 text-xs font-bold tracking-widest">PRACTICE</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <StatCard icon={Target} label="ACCURACY" value={`${accuracy}%`} color={accuracy >= 70 ? "text-neon-cyan" : "text-neon-pink"} />
            <StatCard icon={Zap} label="FASTEST" value={stats.fastestAnswer < Infinity ? `${stats.fastestAnswer.toFixed(1)}s` : "—"} color="text-neon-purple" />
            <StatCard icon={Flame} label="BEST STREAK" value={`${stats.longestStreak}`} color="text-neon-pink" />
          </div>

          {/* Math domain breakdown — shows exactly which skills were exercised */}
          <div className="glass-panel p-4 mb-4 border border-border/40">
            <p className="text-[9px] font-bold tracking-widest text-muted-foreground mb-3">MATH DOMAINS THIS BATTLE</p>
            <div className="space-y-2">
              {Object.entries(topicCounts)
                .sort((a, b) => b[1].total - a[1].total)
                .map(([topic, data]) => {
                  const correct = data.total - data.wrong;
                  const fillPct = Math.round((correct / data.total) * 100);
                  const diffColor = data.wrong === 0
                    ? "bg-neon-cyan"
                    : data.wrong / data.total >= 0.5
                    ? "bg-neon-pink"
                    : "bg-neon-purple";
                  return (
                    <div key={topic}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-foreground">{topic}</span>
                        <span className={`text-[10px] font-bold tabular-nums ${data.wrong === 0 ? "text-neon-cyan" : "text-muted-foreground"}`}>
                          {correct}/{data.total}{data.wrong > 0 ? ` · ${data.wrong} missed` : " · perfect"}
                        </span>
                      </div>
                      <div className="h-1.5 bg-secondary/50 overflow-hidden">
                        <motion.div
                          className={`h-full ${diffColor}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${fillPct}%` }}
                          transition={{ duration: 0.6, ease: "easeOut" }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Accelerator compounding insight — brief conceptual frame, Accelerator only */}
          {stats.archetype === "accelerator" && stats.records.length >= 3 && (() => {
            const n = stats.records.length;
            const scalePct = Math.min(n / 10, 1);
            const finalDmg = Math.round(13 + scalePct * 14);
            const ratio = (finalDmg / 13).toFixed(1);
            return (
              <motion.div
                className="mb-4 glass-panel p-4 border border-tier-platinum/30 flex items-start gap-3"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <TrendingUp className="w-4 h-4 text-tier-platinum shrink-0 mt-0.5" />
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Your damage scaled from <span className="text-foreground font-bold">13 → {finalDmg}</span> over {n} turns — a <span className="text-tier-platinum font-bold">{ratio}× increase</span>. Small repeated gains compounding over time: this is how compound growth works in the real world.
                </p>
              </motion.div>
            );
          })()}

          {/* Archetype mastery panel — appears once the async upsert resolves */}
          {mastery && (() => {
            const m = mastery;
            const rank = getMasteryRank(m, stats.archetype);
            const { winRate, accuracy } = getMasteryStats(m);
            const newBestStreak = stats.longestStreak > prevBestStreak && stats.longestStreak > 0;
            const isPerfect = stats.won && stats.correctAnswers === stats.totalQuestions && stats.totalQuestions > 0;
            return (
              <motion.div
                className={`mt-4 border glass-panel p-4 ${arch.borderColor}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <arch.icon className={`w-4 h-4 ${arch.color}`} />
                  <span className="text-[10px] font-bold tracking-widest text-muted-foreground">
                    {arch.name.toUpperCase()} MASTERY
                  </span>
                  {rank.level > 0 && (
                    <span className={`ml-auto text-[10px] font-bold tracking-widest ${rank.color}`}>
                      RANK {["", "I", "II", "III", "IV", "V"][rank.level]} · {rank.label.toUpperCase()}
                    </span>
                  )}
                </div>

                {rank.level > 0 && rank.flavor && (
                  <p className={`text-[10px] italic mb-3 ${rank.color}`}>"{rank.flavor}"</p>
                )}

                <div className="grid grid-cols-4 gap-2 text-center">
                  {[
                    { label: "BATTLES", value: String(m.battles_played) },
                    { label: "WIN RATE", value: `${winRate}%` },
                    { label: "BEST STK", value: String(m.best_streak) },
                    { label: "ACCURACY", value: `${accuracy}%` },
                  ].map(({ label, value }) => (
                    <div key={label} className="glass-panel p-2">
                      <div className="text-sm font-bold font-display text-foreground">{value}</div>
                      <div className="text-[8px] tracking-widest text-muted-foreground">{label}</div>
                    </div>
                  ))}
                </div>

                {/* Personal record callouts */}
                {(newBestStreak || isPerfect) && (
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {newBestStreak && (
                      <motion.div
                        className="flex items-center gap-1 px-2 py-1 border border-neon-pink/40 bg-neon-pink/10"
                        initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.5 }}
                      >
                        <Star className="w-3 h-3 text-neon-pink" />
                        <span className="text-[9px] font-bold text-neon-pink tracking-widest">NEW BEST STREAK</span>
                      </motion.div>
                    )}
                    {isPerfect && (
                      <motion.div
                        className="flex items-center gap-1 px-2 py-1 border border-neon-cyan/40 bg-neon-cyan/10"
                        initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.5, delay: 0.1 }}
                      >
                        <Star className="w-3 h-3 text-neon-cyan" />
                        <span className="text-[9px] font-bold text-neon-cyan tracking-widest">PERFECT RUN</span>
                      </motion.div>
                    )}
                  </div>
                )}

                {m.perfect_battles > 0 && (
                  <p className="text-[9px] text-muted-foreground mt-2">
                    {m.perfect_battles} perfect {m.perfect_battles === 1 ? "run" : "runs"} · {m.total_correct}/{m.total_questions} total correct
                  </p>
                )}
              </motion.div>
            );
          })()}
        </TabsContent>

        {/* Missed Questions */}
        <TabsContent value="missed">
          {missed.length === 0 ? (
            <div className="text-center py-8">
              <Target className="w-8 h-8 text-neon-cyan mx-auto mb-2" />
              <p className="text-sm font-bold text-foreground">Perfect run!</p>
              <p className="text-xs text-muted-foreground">No missed questions.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {missed.map((r, i) => (
                <motion.div
                  key={i}
                  className="glass-panel p-3 border border-neon-pink/20"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold font-display">{r.question.q.trimEnd().endsWith("?") ? r.question.q : `${r.question.q} = ?`}</p>
                      <p className="text-xs text-neon-cyan mt-1">Answer: <span className="font-bold">{r.question.answer}</span></p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`text-[9px] font-bold tracking-widest px-1.5 py-0.5 border ${
                        r.question.difficulty === "hard" ? "text-neon-pink border-neon-pink/30" :
                        r.question.difficulty === "medium" ? "text-neon-purple border-neon-purple/30" :
                        "text-neon-cyan border-neon-cyan/30"
                      }`}>
                        {r.question.difficulty.toUpperCase()}
                      </span>
                      <p className="text-[9px] text-muted-foreground mt-1">{r.question.topic}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Practice */}
        <TabsContent value="practice">
          <div className="space-y-3">
            {missed.length > 0 && weakestTopic && (
              <div className="glass-panel p-4 border border-neon-pink/20">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-neon-pink" />
                  <span className="text-xs font-bold tracking-widest">WEAK SPOT DETECTED</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  You struggled most with <span className="text-foreground font-bold">{weakestTopic}</span> ({weakestDiff} difficulty).
                  Focus your practice here.
                </p>
              </div>
            )}

            <div className="glass-panel p-4 border border-neon-purple/20">
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="w-4 h-4 text-neon-purple" />
                <span className="text-xs font-bold tracking-widest">RECOMMENDED</span>
              </div>
              <div className="space-y-2">
                {Object.entries(topicCounts)
                  .filter(([, v]) => v.wrong > 0)
                  .sort((a, b) => b[1].wrong - a[1].wrong)
                  .slice(0, 3)
                  .map(([topic, data]) => (
                    <div key={topic} className="flex items-center justify-between">
                      <span className="text-xs text-foreground">{topic}</span>
                      <span className="text-[10px] text-neon-pink font-bold">{data.wrong} missed</span>
                    </div>
                  ))
                }
                {missed.length === 0 && (
                  <p className="text-xs text-muted-foreground">No weak areas found. Try harder difficulty!</p>
                )}
              </div>
            </div>

            <motion.button
              onClick={onRematch}
              className="w-full glass-panel p-3 border border-neon-cyan/20 flex items-center justify-center gap-2 hover:bg-neon-cyan/5 transition-colors"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
            >
              <RotateCcw className="w-4 h-4 text-neon-cyan" />
              <span className="text-xs font-bold tracking-widest text-neon-cyan">PRACTICE WEAK SPOTS</span>
            </motion.button>
          </div>
        </TabsContent>
      </Tabs>

      {/* Action buttons */}
      <div className="flex flex-wrap justify-center gap-3 mt-6">
        {onLiveRematch && opponentType === "live" && (
          <motion.button
            onClick={liveRematchState === "idle" ? onLiveRematch : undefined}
            disabled={liveRematchState !== "idle"}
            className={`px-6 py-2.5 font-bold text-xs tracking-widest transition-colors ${
              liveRematchState === "idle"
                ? "bg-neon-cyan text-primary-foreground"
                : "border border-neon-cyan/60 bg-neon-cyan/10 text-neon-cyan cursor-default"
            }`}
            whileHover={liveRematchState === "idle" ? { scale: 1.03 } : {}}
            whileTap={liveRematchState === "idle" ? { scale: 0.97 } : {}}
          >
            {liveRematchState === "waiting"  ? "WAITING FOR OPPONENT…"
             : liveRematchState === "starting" ? "STARTING REMATCH…"
             : "QUICK REMATCH"}
          </motion.button>
        )}
        <motion.button
          onClick={onRematch}
          className="px-6 py-2.5 bg-neon-pink text-primary-foreground font-bold text-xs tracking-widest"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
        >
          REMATCH (NEW CLASS)
        </motion.button>
        {onContinueWithEcliptar && (
          <motion.button
            onClick={onContinueWithEcliptar}
            className="px-6 py-2.5 bg-neon-purple text-primary-foreground font-bold text-xs tracking-widest"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            CONTINUE WITH ECLIPTAR
          </motion.button>
        )}
        <button
          onClick={onBack}
          className="px-6 py-2.5 border border-border text-xs font-bold tracking-widest text-muted-foreground hover:text-foreground transition-colors"
        >
          BACK
        </button>
      </div>
    </motion.div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: typeof Target; label: string; value: string; color: string }) {
  return (
    <motion.div
      className="glass-panel p-3 text-center"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <Icon className={`w-4 h-4 mx-auto mb-1 ${color}`} />
      <div className={`text-lg font-bold font-display ${color}`}>{value}</div>
      <div className="text-[9px] font-bold tracking-widest text-muted-foreground">{label}</div>
    </motion.div>
  );
}
