import { useState } from "react";
import { motion } from "framer-motion";
import { Crown, Skull, Target, Zap, Flame, AlertTriangle, BookOpen, RotateCcw } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ARCHETYPES } from "./archetypes";
import type { BattleStats, Difficulty } from "./types";

export function BattleReport({ stats, onRematch, onBack }: {
  stats: BattleStats;
  onRematch: () => void;
  onBack: () => void;
}) {
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
          <span>{arch.emoji}</span>
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
            className="text-2xl font-bold font-display text-neon-cyan"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.3, type: "spring" }}
          >
            +{stats.xp} XP
          </motion.div>
          <div className="text-[10px] tracking-widest text-muted-foreground">EARNED</div>
        </div>
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
          <div className="grid grid-cols-3 gap-3">
            {(["easy", "medium", "hard"] as Difficulty[]).map(d => {
              const data = diffCounts[d];
              const pct = data.total > 0 ? Math.round(((data.total - data.wrong) / data.total) * 100) : 0;
              return (
                <div key={d} className="glass-panel p-3 text-center">
                  <div className={`text-lg font-bold font-display ${
                    d === "easy" ? "text-neon-cyan" : d === "medium" ? "text-neon-purple" : "text-neon-pink"
                  }`}>{pct}%</div>
                  <div className="text-[9px] font-bold tracking-widest text-muted-foreground">{d.toUpperCase()}</div>
                  <div className="text-[9px] text-muted-foreground">{data.total - data.wrong}/{data.total}</div>
                </div>
              );
            })}
          </div>
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
                      <p className="text-sm font-bold font-display">{r.question.q} = ?</p>
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
      <div className="flex justify-center gap-3 mt-6">
        <motion.button
          onClick={onRematch}
          className="px-6 py-2.5 bg-neon-pink text-primary-foreground font-bold text-xs tracking-widest"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
        >
          REMATCH
        </motion.button>
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
