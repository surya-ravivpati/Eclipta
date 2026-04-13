import { motion } from "framer-motion";
import { Brain, Swords, Target, Trophy, Users, Zap } from "lucide-react";

const features = [
  {
    icon: Brain,
    number: "01",
    title: "AI Guidance",
    description: "An AI companion that learns your style, gives hints instead of answers, and introduces trick questions to deepen understanding.",
    color: "neon-purple" as const,
  },
  {
    icon: Swords,
    number: "02",
    title: "Knowledge Battles",
    description: "Pokémon-style battles where you compete with peers in real-time knowledge duels. Earn XP, climb ranks, and unlock rewards.",
    color: "neon-pink" as const,
  },
  {
    icon: Target,
    number: "03",
    title: "Adaptive Tests",
    description: "Tests that evolve with your performance. Struggle? More practice. Excel? Higher difficulty. Your weak spots get laser focus.",
    color: "neon-cyan" as const,
  },
  {
    icon: Trophy,
    number: "04",
    title: "Trophy Road",
    description: "Brawl Stars-inspired progression. Milestones, checkpoints, and rewards that keep you pushing forward through every course.",
    color: "neon-purple" as const,
  },
  {
    icon: Users,
    number: "05",
    title: "Community Forum",
    description: "Stack Exchange-style discussions with rated answers. Course-specific threads keep learners on track with quality responses.",
    color: "neon-pink" as const,
  },
  {
    icon: Zap,
    number: "06",
    title: "Real-World Pressure",
    description: "Daily practice limits, deadlines, simulated exams, and time constraints that mirror real-world learning environments.",
    color: "neon-cyan" as const,
  },
];

const colorMap = {
  "neon-purple": {
    border: "border-neon-purple/30",
    hoverBorder: "hover:border-neon-purple/50",
    bg: "bg-neon-purple/10",
    hoverBg: "group-hover:bg-neon-purple",
    text: "text-neon-purple",
    dot: "bg-neon-purple",
  },
  "neon-pink": {
    border: "border-neon-pink/30",
    hoverBorder: "hover:border-neon-pink/50",
    bg: "bg-neon-pink/10",
    hoverBg: "group-hover:bg-neon-pink",
    text: "text-neon-pink",
    dot: "bg-neon-pink",
  },
  "neon-cyan": {
    border: "border-neon-cyan/30",
    hoverBorder: "hover:border-neon-cyan/50",
    bg: "bg-neon-cyan/10",
    hoverBg: "group-hover:bg-neon-cyan",
    text: "text-neon-cyan",
    dot: "bg-neon-cyan",
  },
};

export function FeaturesGrid() {
  return (
    <section className="max-w-7xl mx-auto px-6 py-24">
      <motion.div
        className="text-center mb-16"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
      >
        <h2 className="text-5xl font-bold font-display mb-4">The Arsenal</h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Every tool you need to dominate your learning journey. Built for speed, precision, and mastery.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((feature, i) => {
          const colors = colorMap[feature.color];
          return (
            <motion.div
              key={feature.number}
              className={`group relative p-8 glass-panel ${colors.hoverBorder} transition-colors`}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
            >
              <div className={`w-12 h-12 ${colors.border} border ${colors.bg} flex items-center justify-center mb-6 ${colors.hoverBg} transition-all`}>
                <feature.icon className={`w-5 h-5 ${colors.text} group-hover:text-background transition-colors`} />
              </div>
              <h4 className="text-xl font-bold mb-3 uppercase tracking-tight font-display">{feature.title}</h4>
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">{feature.description}</p>
              <div className="flex gap-2">
                {[...Array(3)].map((_, j) => (
                  <div key={j} className={`w-2 h-2 ${j <= i % 3 ? colors.dot : "bg-border"}`} />
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
