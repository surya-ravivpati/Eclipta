/**
 * Landing page showcase — comprehensive tour of every Eclipta surface.
 *
 * Order is deliberate: hook → what it is → the six pillars → how a session
 * actually flows → social proof / live counters → final CTA. Each pillar
 * links straight to the route so curious visitors can dive in without
 * scrolling back to the navbar.
 */
import { motion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import {
  Brain, Swords, Target, Trophy, Users, Wand2, Sparkles, Zap, ArrowRight,
  GraduationCap, Map, MessagesSquare, Flame, ShieldCheck, Eye, Compass,
} from "lucide-react";

/* =============== HERO =============== */

function Hero() {
  const { isAuthenticated } = useAuth();
  const ctaTo = isAuthenticated ? "/luna" : "/signup";
  const ctaLabel = isAuthenticated ? "OPEN LUNA" : "CREATE FREE ACCOUNT";
  return (
    <section className="pt-32 pb-24 px-6 relative overflow-hidden">
      <div className="absolute top-[-15%] right-[-10%] w-[36rem] h-[36rem] bg-neon-purple/15 rounded-full blur-[140px] animate-pulse" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[28rem] h-[28rem] bg-neon-pink/10 rounded-full blur-[120px]" />
      <div className="absolute top-[40%] left-[40%] w-[22rem] h-[22rem] bg-neon-cyan/10 rounded-full blur-[120px]" />

      <div className="max-w-6xl mx-auto relative text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2 px-3 py-1 mb-8 border border-neon-pink/40 text-neon-pink text-[10px] font-bold tracking-[0.2em] uppercase"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-neon-pink animate-pulse" />
          Season 01 — The Awakening
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}
          className="text-6xl md:text-8xl font-bold tracking-tighter leading-[0.9] mb-8 font-display"
        >
          LEARN LIKE <br />
          <span className="text-neon-purple">YOU PLAY.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.15 }}
          className="max-w-2xl mx-auto text-lg text-muted-foreground mb-10 leading-relaxed"
        >
          Eclipta is an adaptive learning arena. An AI tutor named Luna guides you,
          adaptive tests find your weak spots, knowledge battles turn practice into
          a duel, and a trophy road rewards every milestone with claimable Ecliptars.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.25 }}
          className="flex flex-wrap gap-3 justify-center"
        >
          <Link
            to={ctaTo}
            className="px-7 py-4 bg-neon-pink text-foreground font-bold text-sm tracking-widest inline-flex items-center gap-3 group transition-all hover:scale-105 neon-glow-pink"
          >
            {ctaLabel}
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
          <a
            href="#tour"
            className="px-7 py-4 border border-border hover:border-neon-purple text-foreground font-bold text-sm tracking-widest inline-flex items-center gap-3 transition-colors"
          >
            <Eye className="w-4 h-4" />
            TAKE THE TOUR
          </a>
        </motion.div>

        {/* Quick value chips */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.7, delay: 0.4 }}
          className="flex flex-wrap justify-center gap-2 mt-10 text-[10px] font-bold tracking-widest uppercase text-muted-foreground"
        >
          {[
            "200 XP starter grant",
            "No credit card",
            "Free Luna sessions",
            "Web · mobile · tablet",
          ].map((c) => (
            <span key={c} className="px-3 py-1.5 border border-border bg-secondary/30 rounded-full">{c}</span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* =============== PILLARS GRID =============== */

const PILLARS = [
  {
    icon: Brain, num: "01", title: "Luna — your AI tutor", to: "/luna" as const,
    color: "neon-purple" as const,
    summary: "A live tutor that adapts to your style, gives hints before answers, escalates only when you ask, and remembers what you've struggled with.",
    bullets: ["Streaming chat with screen-share", "Reads your pace, style, weak areas", "Saves your tutoring preferences automatically"],
  },
  {
    icon: GraduationCap, num: "02", title: "Certified Courses", to: "/certified" as const,
    color: "neon-cyan" as const,
    summary: "Curated, multi-lesson tracks across math, languages, science, and more. Every lesson tracks mastery and slots into your trophy road.",
    bullets: ["Structured chapters & lessons", "Enrollment + per-course progress", "Earn XP per completion"],
  },
  {
    icon: Wand2, num: "03", title: "Build a Course", to: "/build-course" as const,
    color: "neon-purple" as const,
    summary: "Tell us your topic, level, and how many hours per week. Eclipta proposes a personalized syllabus you can submit and grow into.",
    bullets: ["Topic + depth + prerequisites", "Reviewed by curators", "Tunable weekly hours"],
  },
  {
    icon: Target, num: "04", title: "Adaptive Tests", to: "/adaptive-tests" as const,
    color: "neon-cyan" as const,
    summary: "Tests that branch on every answer. Struggle and difficulty drops; ace it and the next question gets sharper. Your weak spots get the focus.",
    bullets: ["Difficulty-adjusting engine", "Fatigue & rapid-guess detection", "Per-topic mastery report"],
  },
  {
    icon: Swords, num: "05", title: "Knowledge Battles", to: "/battles" as const,
    color: "neon-pink" as const,
    summary: "Pokémon-style 1v1 duels. Pick a class, spend XP, and trade attacks of knowledge. Speedsters, tanks, healers, and more — each plays differently.",
    bullets: ["8 monster archetypes", "Class abilities & stat mechanics", "Daily challenge bonus"],
  },
  {
    icon: Trophy, num: "06", title: "Trophy Road & Ecliptars", to: "/progress" as const,
    color: "neon-purple" as const,
    summary: "A Brawl-Stars-inspired progression map. Hit milestones to claim Ecliptars — collectible monsters tied to each archetype you've mastered.",
    bullets: ["Checkpoint rewards", "16 Ecliptars to collect", "Equip one to your profile"],
  },
  {
    icon: MessagesSquare, num: "07", title: "Community Forum", to: "/forum" as const,
    color: "neon-pink" as const,
    summary: "Stack-Exchange-style threads with rated answers, accepted solutions, and per-course tags. Get unstuck without leaving the arena.",
    bullets: ["Vote, accept, comment", "Course-tagged threads", "Mod tools & reports"],
  },
  {
    icon: Sparkles, num: "08", title: "XP, streaks & rank", to: "/profile" as const,
    color: "neon-cyan" as const,
    summary: "Every action — a lesson, a battle, a hint earned the hard way — moves your XP, streak, and rank. Your profile is the trophy case.",
    bullets: ["Lifetime + session stats", "Daily streak tracking", "Equipable Ecliptar avatar"],
  },
] as const;

const COLORS = {
  "neon-purple": { text: "text-neon-purple", border: "border-neon-purple/30", bg: "bg-neon-purple/10", hoverBorder: "hover:border-neon-purple/60", dot: "bg-neon-purple" },
  "neon-pink":   { text: "text-neon-pink",   border: "border-neon-pink/30",   bg: "bg-neon-pink/10",   hoverBorder: "hover:border-neon-pink/60",   dot: "bg-neon-pink" },
  "neon-cyan":   { text: "text-neon-cyan",   border: "border-neon-cyan/30",   bg: "bg-neon-cyan/10",   hoverBorder: "hover:border-neon-cyan/60",   dot: "bg-neon-cyan" },
} as const;

function PillarsGrid() {
  return (
    <section id="tour" className="max-w-7xl mx-auto px-6 py-24 scroll-mt-20">
      <motion.div
        className="text-center mb-14"
        initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
      >
        <p className="text-[11px] font-bold tracking-[0.3em] uppercase text-neon-pink mb-3">The Arena ⟁ Eight Pillars</p>
        <h2 className="text-4xl md:text-5xl font-bold font-display mb-4">Everything Eclipta covers.</h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          One platform, eight surfaces, all wired together. Click any tile to dive straight in.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {PILLARS.map((p, i) => {
          const c = COLORS[p.color];
          const Icon = p.icon;
          return (
            <motion.div
              key={p.num}
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ delay: (i % 4) * 0.06 }}
            >
              <Link
                to={p.to}
                className={`group relative block p-6 h-full glass-panel ${c.hoverBorder} transition-colors`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-11 h-11 ${c.border} border ${c.bg} flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${c.text}`} />
                  </div>
                  <span className={`text-[10px] font-mono tracking-widest ${c.text} opacity-70`}>{p.num}</span>
                </div>
                <h3 className="text-base font-bold uppercase tracking-tight font-display mb-2">{p.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed mb-4">{p.summary}</p>
                <ul className="space-y-1.5 mb-4">
                  {p.bullets.map((b) => (
                    <li key={b} className="text-[11px] text-foreground/80 flex items-start gap-2">
                      <span className={`w-1 h-1 mt-1.5 rounded-full ${c.dot} shrink-0`} />
                      {b}
                    </li>
                  ))}
                </ul>
                <span className={`text-[10px] font-bold tracking-widest ${c.text} inline-flex items-center gap-1 group-hover:gap-2 transition-all`}>
                  EXPLORE <ArrowRight className="w-3 h-3" />
                </span>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

/* =============== HOW IT FLOWS =============== */

const FLOW = [
  { icon: Compass,    title: "Pick a path",        body: "Browse certified courses or describe a custom track. We map it to your goals." },
  { icon: Brain,      title: "Learn with Luna",    body: "Every lesson is tutor-led. Hints first, screen-share when stuck, no answer-dumping." },
  { icon: Target,     title: "Test adaptively",    body: "An adaptive test finds the exact concept you missed and zeroes in on it." },
  { icon: Swords,     title: "Battle for XP",      body: "Take what you learned into 1v1 duels. Win a streak, climb rank, unlock the road." },
  { icon: Trophy,     title: "Claim Ecliptars",    body: "Hit milestones on the trophy road and claim collectible monsters tied to your style." },
  { icon: MessagesSquare, title: "Share & rise",   body: "Stuck? Ask the forum. Help a peer? Earn rep. The community sharpens everyone." },
] as const;

function FlowSection() {
  return (
    <section className="py-24 px-6 border-y border-border bg-secondary/20">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="text-center mb-14"
        >
          <p className="text-[11px] font-bold tracking-[0.3em] uppercase text-neon-cyan mb-3">A Day in the Arena</p>
          <h2 className="text-4xl md:text-5xl font-bold font-display mb-4">How a session flows.</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Pieces fit together. You don't have to use them all at once — but they're built to.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {FLOW.map((step, i) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                transition={{ delay: (i % 3) * 0.08 }}
                className="glass-panel p-6 relative"
              >
                <span className="absolute top-4 right-4 text-3xl font-display font-bold text-neon-purple/20 tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <Icon className="w-5 h-5 text-neon-purple mb-3" />
                <h3 className="text-sm font-bold uppercase tracking-wider font-display mb-2">{step.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{step.body}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* =============== WHY ECLIPTA =============== */

const PROOF = [
  { icon: ShieldCheck, label: "Hint-first AI", body: "Luna escalates from guiding question → direct hint → full explanation. You earn the answer." },
  { icon: Flame,       label: "Built for streaks", body: "XP, streaks, and ranks are first-class. Coming back tomorrow is the whole point." },
  { icon: Map,         label: "Personal, not generic", body: "Pace, style, weak areas, and your own preference notes shape every Luna reply." },
  { icon: Users,       label: "Better than alone", body: "Battles, forum, and shared trophy roads give learning a pulse." },
] as const;

function WhySection() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
        className="text-center mb-14"
      >
        <p className="text-[11px] font-bold tracking-[0.3em] uppercase text-neon-purple mb-3">Why It Works</p>
        <h2 className="text-4xl md:text-5xl font-bold font-display mb-4">Designed to keep you learning.</h2>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PROOF.map((p, i) => {
          const Icon = p.icon;
          return (
            <motion.div
              key={p.label}
              initial={{ opacity: 0, x: i % 2 ? 20 : -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
              transition={{ delay: i * 0.06 }}
              className="flex gap-4 p-6 glass-panel"
            >
              <div className="w-11 h-11 shrink-0 border border-neon-purple/30 bg-neon-purple/10 flex items-center justify-center">
                <Icon className="w-5 h-5 text-neon-purple" />
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider font-display mb-1">{p.label}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{p.body}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

/* =============== FINAL CTA =============== */

function FinalCta() {
  const { isAuthenticated } = useAuth();
  return (
    <section className="px-6 pt-12 pb-24">
      <div className="max-w-5xl mx-auto relative overflow-hidden glass-panel p-12 md:p-16 text-center">
        <div className="absolute -top-20 -right-20 w-72 h-72 bg-neon-pink/20 rounded-full blur-[100px]" />
        <div className="absolute -bottom-20 -left-20 w-72 h-72 bg-neon-purple/20 rounded-full blur-[100px]" />
        <div className="relative">
          <Zap className="w-8 h-8 text-neon-pink mx-auto mb-5" />
          <h2 className="text-4xl md:text-5xl font-bold font-display tracking-tight mb-4">
            Step into the arena.
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto mb-8">
            New accounts start with 200 XP — enough to claim your first Ecliptar and play your first battle.
            No card. No catch.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {isAuthenticated ? (
              <>
                <Link to="/battles" className="px-7 py-4 bg-neon-pink text-foreground font-bold text-sm tracking-widest inline-flex items-center gap-2 hover:scale-105 transition-all neon-glow-pink">
                  ENTER A BATTLE <ArrowRight className="w-4 h-4" />
                </Link>
                <Link to="/luna" className="px-7 py-4 border border-border hover:border-neon-purple text-foreground font-bold text-sm tracking-widest transition-colors">
                  TALK TO LUNA
                </Link>
              </>
            ) : (
              <>
                <Link to="/signup" className="px-7 py-4 bg-neon-pink text-foreground font-bold text-sm tracking-widest inline-flex items-center gap-2 hover:scale-105 transition-all neon-glow-pink">
                  CREATE ACCOUNT <ArrowRight className="w-4 h-4" />
                </Link>
                <Link to="/login" className="px-7 py-4 border border-border hover:border-neon-purple text-foreground font-bold text-sm tracking-widest transition-colors">
                  I HAVE ONE
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* =============== EXPORT =============== */

export function LandingShowcase() {
  return (
    <>
      <Hero />
      <PillarsGrid />
      <FlowSection />
      <WhySection />
      <FinalCta />
    </>
  );
}