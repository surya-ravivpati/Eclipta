import { motion } from "framer-motion";
import { Brain, TrendingUp, Target, Clock, Sparkles, BarChart3, RefreshCw, Eye } from "lucide-react";

const learningSignals = [
  { icon: Sparkles, label: "Interests & Topics", description: "Tracks which subjects you return to and what sparks your curiosity", color: "neon-purple" as const },
  { icon: BarChart3, label: "Learning Style", description: "Detects if you prefer fast-paced theory, hands-on practice, or a balanced mix", color: "neon-pink" as const },
  { icon: Eye, label: "Struggle Points", description: "Identifies where you lose focus, slow down, or make repeated mistakes", color: "neon-cyan" as const },
];

const adaptations = [
  { icon: Brain, title: "Smarter Recommendations", description: "Courses that actually match your goals, not generic suggestions. The longer you use Eclipta, the sharper this gets." },
  { icon: TrendingUp, title: "Dynamic Difficulty", description: "Pacing that adjusts in real time — no more too-easy warmups or overwhelming leaps." },
  { icon: Target, title: "Matched Study Methods", description: "Visual learner? Problem-solver? Luna figures out what clicks and delivers content that way." },
  { icon: RefreshCw, title: "Predictive Reviews", description: "Eclipta knows when you're about to forget something and prompts a review before it fades." },
  { icon: Clock, title: "Break & Focus Timing", description: "Detects fatigue patterns and suggests breaks before burnout hits — not after." },
];

const colorMap = {
  "neon-purple": { bg: "bg-neon-purple/10", border: "border-neon-purple/30", text: "text-neon-purple", dot: "bg-neon-purple" },
  "neon-pink": { bg: "bg-neon-pink/10", border: "border-neon-pink/30", text: "text-neon-pink", dot: "bg-neon-pink" },
  "neon-cyan": { bg: "bg-neon-cyan/10", border: "border-neon-cyan/30", text: "text-neon-cyan", dot: "bg-neon-cyan" },
};

function TimelineBar() {
  const stages = [
    { label: "Day 1", detail: "Basic preferences", fill: 15 },
    { label: "Week 1", detail: "Learning style detected", fill: 35 },
    { label: "Month 1", detail: "Struggle patterns mapped", fill: 60 },
    { label: "Month 3+", detail: "Fully personalized", fill: 95 },
  ];

  return (
    <motion.div
      className="glass-panel p-8 mt-12"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
    >
      <h3 className="text-lg font-bold font-display tracking-wide mb-6 text-center">
        PERSONALIZATION TIMELINE
      </h3>
      <div className="relative">
        {/* Track */}
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-neon-purple"
            initial={{ width: 0 }}
            whileInView={{ width: "100%" }}
            viewport={{ once: true }}
            transition={{ duration: 2, ease: "easeOut" }}
          />
        </div>
        {/* Markers */}
        <div className="flex justify-between mt-4">
          {stages.map((stage, i) => (
            <motion.div
              key={stage.label}
              className="text-center flex-1"
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 + i * 0.3 }}
            >
              <div className="w-3 h-3 rounded-full bg-neon-purple mx-auto mb-2 border-2 border-background" />
              <span className="text-xs font-bold tracking-widest text-foreground">{stage.label}</span>
              <p className="text-[10px] text-muted-foreground mt-1">{stage.detail}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

export function PersonalizedLearning() {
  return (
    <section className="min-h-screen pt-24 pb-16">
      <div className="max-w-7xl mx-auto px-6">
        {/* Hero */}
        <motion.div
          className="text-center mb-20"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 border border-neon-purple/30 bg-neon-purple/10 text-neon-purple text-xs font-bold tracking-widest mb-6">
            <Brain className="w-3 h-3" />
            ADAPTIVE INTELLIGENCE
          </div>
          <h1 className="text-5xl md:text-7xl font-bold font-display tracking-tight mb-6">
            It Learns{" "}
            <span className="text-neon-purple">
              You
            </span>
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg leading-relaxed">
            The more you use Eclipta, the more it adapts. Your interests, pace, strengths, and blind spots
            shape an experience built specifically for you.
          </p>
        </motion.div>

        {/* What it tracks */}
        <div className="mb-20">
          <motion.h2
            className="text-2xl font-bold font-display tracking-wide text-center mb-10"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            WHAT ECLIPTA OBSERVES
          </motion.h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {learningSignals.map((signal, i) => {
              const colors = colorMap[signal.color];
              return (
                <motion.div
                  key={signal.label}
                  className={`glass-panel p-8 border ${colors.border} hover:border-opacity-60 transition-colors`}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                >
                  <div className={`w-12 h-12 ${colors.bg} border ${colors.border} flex items-center justify-center mb-5`}>
                    <signal.icon className={`w-5 h-5 ${colors.text}`} />
                  </div>
                  <h3 className="text-lg font-bold font-display tracking-tight mb-2">{signal.label}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{signal.description}</p>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* How it adapts */}
        <div className="mb-12">
          <motion.h2
            className="text-2xl font-bold font-display tracking-wide text-center mb-10"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            HOW IT ADAPTS
          </motion.h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {adaptations.map((item, i) => (
              <motion.div
                key={item.title}
                className="group glass-panel p-6 hover:border-neon-purple/40 transition-colors"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-neon-purple/10 border border-neon-purple/30 flex items-center justify-center shrink-0 group-hover:bg-neon-purple transition-colors">
                    <item.icon className="w-4 h-4 text-neon-purple group-hover:text-background transition-colors" />
                  </div>
                  <div>
                    <h4 className="font-bold font-display text-sm tracking-tight mb-1">{item.title}</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Timeline */}
        <TimelineBar />

        {/* Bottom CTA */}
        <motion.div
          className="text-center mt-16"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          <p className="text-muted-foreground text-sm mb-4">
            No two learners are the same. Eclipta makes sure your experience reflects that.
          </p>
          <div className="flex justify-center gap-3">
            <div className="w-2 h-2 bg-neon-purple" />
            <div className="w-2 h-2 bg-neon-pink" />
            <div className="w-2 h-2 bg-neon-cyan" />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
