import { motion } from "framer-motion";
import { Lock, Star, CheckCircle } from "lucide-react";

const milestones = [
  { label: "Foundations", status: "completed", xp: "500 XP" },
  { label: "Core Concepts", status: "completed", xp: "1,200 XP" },
  { label: "Advanced Theory", status: "current", xp: "2,840 XP" },
  { label: "Practical Application", status: "locked", xp: "4,000 XP" },
  { label: "Mastery Challenge", status: "locked", xp: "6,000 XP" },
];

export function TrophyRoad() {
  return (
    <section className="py-24 border-t border-border bg-card/30">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl font-bold mb-6 font-display">
              Your <span className="text-neon-purple text-glow-purple">Trophy Road</span>
            </h2>
            <p className="text-muted-foreground mb-8 leading-relaxed">
              Inspired by Brawl Stars, your learning journey is visualized as a competitive
              progression path. Every milestone unlocks new challenges, rewards, and recognition.
            </p>
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm">
                <div className="w-3 h-3 bg-neon-purple" />
                <span className="text-muted-foreground">Daily practice streaks multiply XP gains</span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="w-3 h-3 bg-neon-pink" />
                <span className="text-muted-foreground">Time-limited challenges for bonus rewards</span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="w-3 h-3 bg-neon-cyan" />
                <span className="text-muted-foreground">Certified completion records and badges</span>
              </div>
            </div>
          </motion.div>

          <motion.div
            className="glass-panel rounded-2xl p-8 relative overflow-hidden"
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-neon-purple/5 to-transparent" />
            <div className="relative space-y-0">
              {milestones.map((m, i) => (
                <div key={m.label} className="flex items-center gap-4 relative">
                  {/* Connector line */}
                  {i < milestones.length - 1 && (
                    <div className={`absolute left-5 top-10 w-0.5 h-12 ${
                      m.status === "completed" ? "bg-neon-purple" : "bg-border"
                    }`} />
                  )}
                  <div className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    m.status === "completed"
                      ? "bg-neon-purple neon-glow-purple"
                      : m.status === "current"
                      ? "bg-neon-pink neon-glow-pink ring-4 ring-neon-pink/20"
                      : "bg-secondary border border-border"
                  }`}>
                    {m.status === "completed" && <CheckCircle className="w-5 h-5 text-primary-foreground" />}
                    {m.status === "current" && <Star className="w-5 h-5 text-foreground" />}
                    {m.status === "locked" && <Lock className="w-4 h-4 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 py-5">
                    <div className="flex items-center justify-between">
                      <span className={`font-bold font-display text-sm ${
                        m.status === "locked" ? "text-muted-foreground" : "text-foreground"
                      }`}>{m.label}</span>
                      <span className={`text-xs font-mono ${
                        m.status === "current" ? "text-neon-pink" : "text-muted-foreground"
                      }`}>{m.xp}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
