import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Sparkles, Target, Swords, Trophy, Brain, Users } from "lucide-react";
import { Navbar } from "@/components/Navbar";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Eclipta – A Smarter Way to Learn" },
      { name: "description", content: "Eclipta turns learning into a battle arena. Meet the team and mission behind the world's first adaptive learning playground." },
      { property: "og:title", content: "About Eclipta" },
      { property: "og:description", content: "How Eclipta turns learning into a competitive arena powered by AI, battles, and trophy roads." },
    ],
  }),
  component: AboutPage,
});

const PILLARS = [
  { icon: Brain, title: "Adaptive AI", desc: "Luna learns your pace, your weak spots, and the way you think — then meets you there." },
  { icon: Swords, title: "Battles, Not Worksheets", desc: "Knowledge battles turn rote practice into competitive duels with real stakes." },
  { icon: Trophy, title: "Trophy Road Progression", desc: "Every XP point unlocks new ranks, monsters, and Ecliptars worth claiming." },
  { icon: Target, title: "Personalized Mastery", desc: "Adaptive tests and personalized courses target the exact skills you need next." },
  { icon: Users, title: "Built for Learners", desc: "Forums, leaderboards, and community challenges keep momentum alive." },
  { icon: Sparkles, title: "Designed to Delight", desc: "A neon arena aesthetic that makes you actually want to come back tomorrow." },
];

function AboutPage() {
  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <Navbar />
      <section className="pt-24 pb-16 max-w-5xl mx-auto px-6">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 border border-neon-pink/30 bg-neon-pink/10 text-neon-pink text-xs font-bold tracking-widest mb-6">
            <Sparkles className="w-3 h-3" />
            ABOUT ECLIPTA
          </div>
          <h1 className="text-5xl md:text-7xl font-bold font-display tracking-tight mb-6">
            Learning, but make it{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-neon-pink via-neon-purple to-neon-cyan">
              an arena
            </span>
            .
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Eclipta is the world's first adaptive learning arena. We rebuilt education from the
            ground up — with AI-driven growth paths, knowledge battles, and a trophy road that
            actually feels like progress.
          </p>
        </motion.div>

        <motion.div
          className="glass-panel p-8 mb-12 border border-neon-purple/20"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-2xl font-bold font-display mb-3 text-neon-purple">Our Mission</h2>
          <p className="text-muted-foreground leading-relaxed">
            Traditional learning platforms reward completion. Eclipta rewards{" "}
            <span className="text-foreground font-bold">growth</span>. Every battle you win,
            every course you finish, every adaptive test you crush feeds a single progression
            engine — your XP — that unlocks new Ecliptars, ranks, and challenges. We believe
            mastery should feel like leveling up, not grinding.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
          {PILLARS.map((p, i) => {
            const Icon = p.icon;
            return (
              <motion.div
                key={p.title}
                className="glass-panel p-6 border border-border hover:border-neon-purple/30 transition-colors"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
              >
                <div className="w-10 h-10 mb-4 bg-neon-purple/10 border border-neon-purple/30 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-neon-purple" />
                </div>
                <h3 className="font-bold font-display text-lg mb-2">{p.title}</h3>
                <p className="text-sm text-muted-foreground">{p.desc}</p>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          className="text-center glass-panel p-10 border border-neon-pink/20"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl font-bold font-display mb-3">Ready to enter the arena?</h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Pick an archetype, claim your first Ecliptar, and start climbing the Trophy Road.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link
              to="/signup"
              className="px-6 py-3 bg-neon-pink text-primary-foreground text-xs font-bold tracking-widest hover:opacity-90 transition-opacity"
            >
              CREATE ACCOUNT
            </Link>
            <Link
              to="/"
              className="px-6 py-3 border border-border text-xs font-bold tracking-widest hover:border-neon-purple transition-colors"
            >
              EXPLORE FIRST
            </Link>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
