import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useState } from "react";
import { toast } from "sonner";
import { Sparkles, Target, Swords, Trophy, Brain, Users, User, Mail, Github, MessageSquare, Send } from "lucide-react";
import { Navbar } from "@/components/Navbar";

function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) {
      toast.error("Please fill in your name, email, and message.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    const body = `From: ${name} <${email}>\n\n${message}`;
    const mailto = `mailto:hello@eclipta.app?subject=${encodeURIComponent(subject || "Hello from Eclipta")}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    setSent(true);
    toast.success("Opening your email client...");
  };

  return (
    <form onSubmit={handleSubmit} className="glass-panel p-6 border border-neon-purple/20 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Mail className="w-5 h-5 text-neon-purple" />
        <h3 className="font-bold font-display text-base">Send us a message</h3>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">We'll route this to hello@eclipta.app via your email client.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            className="w-full mt-1 bg-secondary/30 border border-input px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neon-purple"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={120}
            className="w-full mt-1 bg-secondary/30 border border-input px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neon-purple"
          />
        </div>
      </div>
      <div>
        <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Subject</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={120}
          placeholder="What's this about?"
          className="w-full mt-1 bg-secondary/30 border border-input px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neon-purple"
        />
      </div>
      <div>
        <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Message</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          maxLength={2000}
          placeholder="How can we help?"
          className="w-full mt-1 bg-secondary/30 border border-input px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neon-purple resize-none"
        />
        <p className="text-[10px] text-muted-foreground mt-1">{message.length}/2000</p>
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {sent ? (
          <p className="text-[11px] text-neon-cyan">Email client opened. If nothing happened, write to <a href="mailto:hello@eclipta.app" className="underline">hello@eclipta.app</a>.</p>
        ) : <span />}
        <button
          type="submit"
          className="px-5 py-2 text-xs font-bold tracking-widest bg-neon-purple text-primary-foreground hover:opacity-90 transition-opacity inline-flex items-center gap-2"
        >
          <Send className="w-3.5 h-3.5" />SEND MESSAGE
        </button>
      </div>
    </form>
  );
}

const FOUNDERS = [
  { name: "Surya Ravipati", role: "Co-Founder", bio: "Architect of Eclipta's adaptive learning engine and arena design." },
  { name: "Aarit Perswal", role: "Co-Founder", bio: "Builds the battle systems and gamified progression that make learning addictive." },
];

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
            <span className="text-neon-pink">
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
          className="mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-2xl font-bold font-display mb-6 text-center text-neon-cyan">Meet the Founders</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {FOUNDERS.map((f, i) => (
              <motion.div
                key={f.name}
                className="glass-panel p-6 border border-neon-cyan/20 flex items-start gap-4"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <div className="w-16 h-16 shrink-0 bg-neon-cyan/10 border border-neon-cyan/40 flex items-center justify-center">
                  <User className="w-8 h-8 text-neon-cyan" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold font-display text-lg">{f.name}</h3>
                  <p className="text-[10px] font-bold tracking-widest text-neon-cyan mb-2">{f.role.toUpperCase()}</p>
                  <p className="text-sm text-muted-foreground">{f.bio}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div
          id="contact"
          className="mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-2xl font-bold font-display mb-6 text-center text-neon-purple">Get in Touch</h2>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
            <ContactForm />
            <div className="grid gap-4 content-start">
              <Link
                to="/forum"
                className="glass-panel p-5 border border-neon-pink/20 hover:border-neon-pink/50 transition-colors group block"
              >
                <MessageSquare className="w-5 h-5 text-neon-pink mb-2 group-hover:scale-110 transition-transform" />
                <h3 className="font-bold font-display text-sm mb-1">Community Forum</h3>
                <p className="text-xs text-muted-foreground">Best for product questions and learner support.</p>
              </Link>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="glass-panel p-5 border border-neon-cyan/20 hover:border-neon-cyan/50 transition-colors group block"
              >
                <Github className="w-5 h-5 text-neon-cyan mb-2 group-hover:scale-110 transition-transform" />
                <h3 className="font-bold font-display text-sm mb-1">Open Source</h3>
                <p className="text-xs text-muted-foreground">Report bugs, suggest features, or contribute.</p>
              </a>
            </div>
          </div>
        </motion.div>

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
