/**
 * Eclipta homepage — battle-first redesign.
 *
 * Structure (top to bottom, deliberately battle-forward):
 *   1. Hero with live "battle in progress" HUD
 *   2. Live battle results ticker (social presence / FOMO)
 *   3. Anatomy of a battle (the core hook explained)
 *   4. Pick Your Class (8 archetypes — identity)
 *   5. Rank ladder (status / progression)
 *   6. Trophy Road & Ecliptars (collection / identity)
 *   7. Today's daily challenge (retention loop)
 *   8. Beyond Battles (Luna / Tests / Courses / Forum — supporting cast)
 *   9. Final CTA
 */
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight, Swords, Zap, Heart, Flame, Target, Crown, Trophy, Shield,
  Brain, GraduationCap, MessagesSquare, Sparkles, Timer, ChevronRight,
  PlayCircle, Activity,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { ARCHETYPES } from "@/components/battles/archetypes";
import { getTodayChallenge } from "@/lib/daily-challenge";

/* ════════════════════════════════════════════════════════════════════
   1. HERO  —  "Study is dead. Fight for it."
   ════════════════════════════════════════════════════════════════════ */

function Hero() {
  const { isAuthenticated } = useAuth();
  const ctaTo = isAuthenticated ? "/battles" : "/signup";
  const ctaLabel = isAuthenticated ? "BATTLE NOW" : "FIGHT FREE";

  return (
    <section className="pt-28 pb-16 px-6 relative overflow-hidden">
      {/* Ambient arena glow */}
      <div className="absolute top-[-20%] right-[-10%] w-[42rem] h-[42rem] bg-neon-pink/15 rounded-full blur-[140px] animate-arena-drift" />
      <div className="absolute bottom-[-15%] left-[-15%] w-[36rem] h-[36rem] bg-neon-purple/15 rounded-full blur-[140px] animate-arena-drift [animation-delay:-7s]" />

      <div className="max-w-7xl mx-auto relative grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        {/* Left: copy */}
        <div className="lg:col-span-7">
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 mb-6 border border-neon-pink/40 bg-neon-pink/5 text-neon-pink text-[10px] font-bold tracking-[0.25em] uppercase"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-neon-pink opacity-60 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-neon-pink" />
            </span>
            Season 01 · Live · 1,284 in queue
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="text-[3.4rem] md:text-[5.5rem] lg:text-[6.2rem] font-bold tracking-tighter leading-[0.88] mb-6 font-display"
          >
            STUDY IS DEAD. <br />
            <span className="text-neon-pink animate-neon-flicker">FIGHT FOR IT.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="max-w-xl text-base md:text-lg text-muted-foreground mb-9 leading-relaxed"
          >
            Eclipta turns learning into 1v1 knowledge duels. Pick a class, queue up,
            land combos, climb the ranks. AI tutoring is the warm-up — the arena is the point.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.2 }}
            className="flex flex-wrap gap-3 items-center"
          >
            <Link
              to={ctaTo}
              className="px-8 py-4 bg-neon-pink text-foreground font-bold text-sm tracking-[0.2em] inline-flex items-center gap-3 group hover:scale-[1.03] transition-transform animate-battle-charge"
            >
              <Swords className="w-4 h-4" />
              {ctaLabel}
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <a
              href="#anatomy"
              className="px-6 py-4 border border-border hover:border-neon-purple text-foreground font-bold text-sm tracking-[0.2em] inline-flex items-center gap-2 transition-colors"
            >
              <PlayCircle className="w-4 h-4" />
              SEE A BATTLE
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.35 }}
            className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground"
          >
            <span className="inline-flex items-center gap-1.5"><Zap className="w-3 h-3 text-neon-purple" /> Free to play</span>
            <span className="inline-flex items-center gap-1.5"><Trophy className="w-3 h-3 text-neon-pink" /> 8 classes · 16 Ecliptars</span>
            <span className="inline-flex items-center gap-1.5"><Crown className="w-3 h-3 text-tier-gold" /> 8 ranked tiers</span>
          </motion.div>
        </div>

        {/* Right: live battle HUD */}
        <div className="lg:col-span-5">
          <LiveBattleHUD />
        </div>
      </div>
    </section>
  );
}

/* ────────── Live Battle HUD card ────────── */

function LiveBattleHUD() {
  const [playerHp, setPlayerHp] = useState(78);
  const [oppHp, setOppHp] = useState(54);
  const [combo, setCombo] = useState(3);
  const [popup, setPopup] = useState<{ id: number; text: string; crit?: boolean } | null>(null);
  const [logIdx, setLogIdx] = useState(0);
  const log = useMemo(() => [
    { text: "+34 DMG · Algebra · 2x combo", crit: false, opp: true,  hp: -34 },
    { text: "CRIT! +52 DMG · Derivatives",   crit: true,  opp: true,  hp: -52 },
    { text: "Healed +18 HP · Focus spent",   crit: false, opp: false, hp: +18, mine: true },
    { text: "+28 DMG · Vectors · 3x combo",  crit: false, opp: true,  hp: -28 },
    { text: "BLOCKED · Wrong answer −12 HP", crit: false, opp: false, hp: -12, mine: true },
  ], []);

  useEffect(() => {
    const id = setInterval(() => {
      const entry = log[logIdx % log.length];
      setPopup({ id: Date.now(), text: entry.text, crit: entry.crit });
      if (entry.mine) {
        setPlayerHp((h) => Math.min(100, Math.max(0, h + entry.hp)));
      } else {
        setOppHp((h) => Math.min(100, Math.max(0, h + entry.hp)));
        if (entry.crit) setCombo((c) => c + 2);
        else setCombo((c) => c + 1);
      }
      setLogIdx((i) => i + 1);
      // Auto-reset on KO so the loop never stalls.
      setTimeout(() => {
        setPlayerHp((h) => h <= 5 ? 78 : h);
        setOppHp((h) => h <= 5 ? 64 : h);
      }, 2200);
    }, 2400);
    return () => clearInterval(id);
  }, [log, logIdx]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 28, skewX: -3 }} animate={{ opacity: 1, x: 0, skewX: 0 }}
      transition={{ duration: 0.55, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="relative"
    >
      <div className="absolute -inset-2 bg-gradient-to-tr from-neon-pink/30 via-neon-purple/20 to-neon-cyan/20 blur-2xl opacity-60" />
      <div className="relative glass-panel p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-neon-pink" />
            <span className="text-[10px] font-bold tracking-[0.25em] uppercase text-neon-pink">Live · Round 3</span>
          </div>
          <span className="text-[10px] font-mono tracking-widest text-muted-foreground">BO5 · RANKED</span>
        </div>

        {/* Player */}
        <FighterRow
          name="YOU" sub="Speedster · Diamond II" hp={playerHp}
          icon={Zap} colorClass="text-neon-cyan" borderClass="border-neon-cyan/40" barClass="bg-neon-cyan"
          alignRight={false}
        />

        {/* Center mid bar with combo + damage popup */}
        <div className="relative my-4 h-14 flex items-center justify-center border-y border-border/60">
          <div className="flex items-center gap-3">
            <Flame className="w-4 h-4 text-neon-pink" />
            <span className="text-2xl font-bold font-display tabular-nums text-neon-pink">
              {combo}<span className="text-xs text-muted-foreground">x COMBO</span>
            </span>
            <span className="hidden sm:inline w-px h-5 bg-border" />
            <span className="hidden sm:inline-flex items-center gap-1 text-xs text-muted-foreground"><Timer className="w-3 h-3" /> 0:08</span>
          </div>
          <AnimatePresence>
            {popup && (
              <motion.div
                key={popup.id}
                initial={{ opacity: 0, y: 8, scale: 0.9 }}
                animate={{ opacity: 1, y: -18, scale: 1 }}
                exit={{ opacity: 0, y: -36, scale: 0.95 }}
                transition={{ duration: 0.7 }}
                className={`absolute right-2 top-1 px-2 py-0.5 text-[10px] font-bold tracking-wider ${
                  popup.crit ? "bg-neon-pink text-foreground" : "bg-neon-purple/20 text-neon-purple border border-neon-purple/40"
                }`}
              >
                {popup.text}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Opponent */}
        <FighterRow
          name="@kazu_47" sub="Chud · Diamond I" hp={oppHp}
          icon={Crown} colorClass="text-tier-champion" borderClass="border-tier-champion/40" barClass="bg-tier-champion"
          alignRight
        />

        {/* Footer pill */}
        <div className="mt-5 flex items-center justify-between text-[10px] font-bold tracking-widest uppercase">
          <span className="text-muted-foreground">Reward · <span className="text-neon-cyan">+185 XP</span></span>
          <span className="text-muted-foreground">On the line · <span className="text-neon-pink">Diamond Promo</span></span>
        </div>
      </div>
    </motion.div>
  );
}

function FighterRow(props: {
  name: string; sub: string; hp: number;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string; borderClass: string; barClass: string; alignRight: boolean;
}) {
  const { name, sub, hp, icon: Icon, colorClass, borderClass, barClass, alignRight } = props;
  return (
    <div className={`flex items-center gap-3 ${alignRight ? "flex-row-reverse text-right" : ""}`}>
      <div className={`w-12 h-12 shrink-0 border ${borderClass} bg-secondary/40 flex items-center justify-center`}>
        <Icon className={`w-5 h-5 ${colorClass}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className={`flex items-baseline justify-between gap-2 ${alignRight ? "flex-row-reverse" : ""}`}>
          <span className="font-bold text-sm font-display tracking-wider truncate">{name}</span>
          <span className="text-[10px] font-mono tabular-nums text-muted-foreground">{Math.round(hp)}/100</span>
        </div>
        <p className="text-[10px] tracking-[0.18em] uppercase text-muted-foreground mb-1.5 truncate">{sub}</p>
        <div className="h-2 bg-secondary/60 relative overflow-hidden">
          <motion.div
            className={`h-full ${barClass}`}
            animate={{ width: `${hp}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 18 }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-xp-shimmer pointer-events-none" />
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   2. LIVE TICKER  —  recent results scroll
   ════════════════════════════════════════════════════════════════════ */

const TICKER = [
  { winner: "@nova_q",  klass: "Speedster",   loser: "@brio",      time: "0:47", topic: "Calculus" },
  { winner: "@kira_x",  klass: "Healer",      loser: "@hyx",       time: "1:12", topic: "Vocab" },
  { winner: "@orin",    klass: "Chud",        loser: "@drei_v",    time: "0:38", topic: "Physics" },
  { winner: "@zee",     klass: "Fulcrum",     loser: "@mara",      time: "1:02", topic: "Geometry" },
  { winner: "@tav",     klass: "Accelerator", loser: "@ilya",      time: "0:55", topic: "French" },
  { winner: "@mio",     klass: "Tank",        loser: "@cyx_r",     time: "1:24", topic: "Chemistry" },
  { winner: "@ren_44",  klass: "Gambler",     loser: "@noor",      time: "0:29", topic: "History" },
  { winner: "@aki",     klass: "God",         loser: "@silas",     time: "1:41", topic: "Linear Alg." },
] as const;

function LiveTicker() {
  const items = [...TICKER, ...TICKER]; // duplicate for seamless loop
  return (
    <div className="border-y border-border bg-arena-light/40 overflow-hidden">
      <div className="relative flex items-center h-12">
        <div className="absolute left-0 top-0 bottom-0 z-10 px-4 flex items-center gap-2 bg-arena-light border-r border-border">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-neon-pink opacity-60 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-neon-pink" />
          </span>
          <span className="text-[10px] font-bold tracking-[0.25em] uppercase">Live Feed</span>
        </div>
        <div className="absolute left-0 right-0 overflow-hidden pl-32">
          <div className="flex items-center gap-8 animate-[ticker_45s_linear_infinite] whitespace-nowrap">
            {items.map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <Swords className="w-3 h-3 text-neon-pink shrink-0" />
                <span className="text-foreground font-medium">{t.winner}</span>
                <span className="text-[10px] uppercase tracking-widest text-neon-cyan font-bold">{t.klass}</span>
                <span className="text-muted-foreground">defeated</span>
                <span className="text-foreground">{t.loser}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">{t.topic}</span>
                <span className="text-muted-foreground">·</span>
                <span className="font-mono text-neon-pink tabular-nums">{t.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <style>{`@keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   3. ANATOMY OF A BATTLE  —  the core hook
   ════════════════════════════════════════════════════════════════════ */

const MECHANICS = [
  { icon: Heart,  label: "HP",     accent: "text-neon-pink",   rule: "Wrong answers cost HP. Run out and you're knocked out." },
  { icon: Flame,  label: "COMBO",  accent: "text-neon-pink",   rule: "Streaks compound damage. Break the chain and you reset." },
  { icon: Zap,    label: "FOCUS",  accent: "text-neon-cyan",   rule: "Spent on heals and abilities. Earned by clutch answers." },
  { icon: Timer,  label: "TIME",   accent: "text-neon-purple", rule: "Faster answers hit harder. Hesitation is damage halved." },
] as const;

function BattleAnatomy() {
  return (
    <section id="anatomy" className="px-6 py-24 scroll-mt-20">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-[11px] font-bold tracking-[0.3em] uppercase text-neon-pink mb-3">The Core Loop</p>
          <h2 className="text-4xl md:text-6xl font-bold font-display tracking-tight mb-4">
            Every match is a duel.
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Forget multiple choice and progress bars. Battles use four real-time systems
            stacked on top of each other — knowing the answer is the table stakes.
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {MECHANICS.map((m, i) => {
            const Icon = m.icon;
            return (
              <motion.div
                key={m.label}
                initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ delay: i * 0.08, duration: 0.45 }}
                className="glass-panel p-5 group hover:border-neon-pink/40 transition-colors"
              >
                <Icon className={`w-6 h-6 ${m.accent} mb-4 group-hover:scale-110 transition-transform`} />
                <p className={`text-[10px] font-bold tracking-[0.3em] uppercase ${m.accent} mb-2`}>{m.label}</p>
                <p className="text-xs text-foreground/80 leading-relaxed">{m.rule}</p>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-10 text-center">
          <Link
            to="/battles"
            className="inline-flex items-center gap-2 px-6 py-3 border border-neon-pink/50 text-neon-pink hover:bg-neon-pink hover:text-foreground text-xs font-bold tracking-[0.25em] transition-colors"
          >
            QUEUE FOR A MATCH <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   4. PICK YOUR CLASS  —  8 archetypes (identity)
   ════════════════════════════════════════════════════════════════════ */

function ClassPicker() {
  const order: (keyof typeof ARCHETYPES)[] = [
    "speedster", "tank", "chud", "healer", "fulcrum", "accelerator", "gambler", "god",
  ];

  return (
    <section className="px-6 py-24 border-y border-border bg-secondary/15">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-[11px] font-bold tracking-[0.3em] uppercase text-neon-cyan mb-3">Eight Classes · One Main</p>
          <h2 className="text-4xl md:text-6xl font-bold font-display tracking-tight mb-4">
            Pick how you fight.
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Every archetype changes the rules. Glass-cannon Chuds, immortal Tanks,
            chaos-roll Gamblers. Find your style — then make it a personality.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {order.map((id, i) => {
            const a = ARCHETYPES[id];
            const Icon = a.icon;
            return (
              <motion.div
                key={id}
                initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ delay: (i % 4) * 0.06, duration: 0.4 }}
              >
                <Link
                  to="/battles"
                  className="group block glass-panel p-4 h-full hover:border-neon-pink/40 transition-all hover:-translate-y-1"
                >
                  <div className={`w-10 h-10 border ${a.borderColor} bg-background/30 flex items-center justify-center mb-3`}>
                    <Icon className={`w-5 h-5 ${a.color}`} />
                  </div>
                  <h3 className={`text-sm font-bold font-display tracking-wider mb-1 ${a.color}`}>
                    {a.name.replace("The ", "").toUpperCase()}
                  </h3>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">{a.passive}</p>
                  <div className="grid grid-cols-3 gap-1 text-center border-t border-border/50 pt-2">
                    <Stat label="HP"  value={String(a.maxHp)} />
                    <Stat label="DMG" value={String(a.baseDamage)} />
                    <Stat label="DIFF" value={`${a.diffMin}-${a.diffMax}`} />
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[8px] font-bold tracking-widest text-muted-foreground uppercase">{label}</p>
      <p className="text-xs font-bold font-display tabular-nums">{value}</p>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   5. RANK LADDER  —  status / progression
   ════════════════════════════════════════════════════════════════════ */

const TIERS = [
  { name: "Bronze",   color: "text-tier-bronze",    glow: "neon-glow-bronze" },
  { name: "Silver",   color: "text-tier-silver",    glow: "neon-glow-silver" },
  { name: "Gold",     color: "text-tier-gold",      glow: "neon-glow-gold" },
  { name: "Platinum", color: "text-tier-platinum",  glow: "neon-glow-platinum" },
  { name: "Diamond",  color: "text-tier-diamond",   glow: "neon-glow-diamond" },
  { name: "Champion", color: "text-tier-champion",  glow: "neon-glow-champion" },
  { name: "Unreal",   color: "text-tier-unreal",    glow: "neon-glow-unreal" },
  { name: "God",      color: "text-tier-god",       glow: "neon-glow-god" },
] as const;

function RankLadder() {
  return (
    <section className="px-6 py-24">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-[11px] font-bold tracking-[0.3em] uppercase text-tier-gold mb-3">The Climb</p>
          <h2 className="text-4xl md:text-6xl font-bold font-display tracking-tight mb-4">
            Eight tiers. One throne.
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Every win moves you up. Every loss costs. Hit Champion to unlock seasonal
            cosmetics; hit God and your name appears on the global leaderboard.
          </p>
        </div>

        <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
          {TIERS.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ delay: i * 0.06, duration: 0.4 }}
              className="glass-panel p-3 text-center group hover:-translate-y-1 transition-transform"
            >
              <div className={`w-10 h-10 mx-auto mb-2 rounded-full bg-background/40 flex items-center justify-center ${t.glow}`}>
                <Crown className={`w-5 h-5 ${t.color}`} />
              </div>
              <p className={`text-[10px] font-bold tracking-widest uppercase ${t.color}`}>{t.name}</p>
              <p className="text-[9px] font-mono tabular-nums text-muted-foreground mt-0.5">T{i + 1}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   6. TROPHY ROAD & ECLIPTARS  —  collection / identity
   ════════════════════════════════════════════════════════════════════ */

function TrophyTease() {
  const tiles = [
    { icon: Zap,        name: "Velo",     color: "text-neon-cyan",      role: "Speedster" },
    { icon: Shield,     name: "Aegis",    color: "text-tier-silver",    role: "Tank" },
    { icon: Flame,      name: "Pyre",     color: "text-tier-champion",  role: "Chud" },
    { icon: Heart,      name: "Soren",    color: "text-neon-pink",      role: "Healer" },
    { icon: Target,     name: "Axion",    color: "text-neon-purple",    role: "Fulcrum" },
    { icon: Sparkles,   name: "Comet",    color: "text-tier-platinum",  role: "Accelerator" },
    { icon: Trophy,     name: "Newton",   color: "text-tier-gold",      role: "God · Boss" },
    { icon: Crown,      name: "Ecliptadon", color: "text-tier-god",     role: "God · Boss" },
  ];
  return (
    <section className="px-6 py-24 border-y border-border bg-arena-light/40">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-5">
          <p className="text-[11px] font-bold tracking-[0.3em] uppercase text-neon-purple mb-3">Trophy Road</p>
          <h2 className="text-4xl md:text-5xl font-bold font-display tracking-tight mb-5">
            Collect what you defeat.
          </h2>
          <p className="text-muted-foreground mb-6 leading-relaxed">
            Win battles. Hit checkpoints. Claim Ecliptars — collectible creatures
            tied to the archetypes you've mastered. Equip one as your profile sigil.
            16 to catch. Two are end-game bosses you only get by beating them.
          </p>
          <Link
            to="/progress"
            className="inline-flex items-center gap-2 px-5 py-3 border border-neon-purple/50 text-neon-purple hover:bg-neon-purple hover:text-background text-xs font-bold tracking-[0.25em] transition-colors"
          >
            VIEW THE ROAD <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <div className="lg:col-span-7 grid grid-cols-4 gap-3">
          {tiles.map((t, i) => {
            const Icon = t.icon;
            return (
              <motion.div
                key={t.name}
                initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }} transition={{ delay: i * 0.05, type: "spring", stiffness: 240, damping: 20 }}
                className="glass-panel aspect-square flex flex-col items-center justify-center p-3 group hover:-translate-y-1 transition-transform"
              >
                <Icon className={`w-7 h-7 ${t.color} mb-2 group-hover:scale-110 transition-transform`} />
                <p className="text-[10px] font-bold font-display tracking-wider text-center">{t.name}</p>
                <p className="text-[8px] uppercase tracking-widest text-muted-foreground mt-0.5">{t.role}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   7. DAILY CHALLENGE  —  retention loop
   ════════════════════════════════════════════════════════════════════ */

function DailyChallenge() {
  const ch = getTodayChallenge();
  return (
    <section className="px-6 py-20">
      <div className="max-w-5xl mx-auto">
        <div className="relative glass-panel p-8 md:p-12 overflow-hidden">
          <div className="absolute -top-20 -right-20 w-72 h-72 bg-neon-pink/20 rounded-full blur-[100px]" />
          <div className="relative grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            <div className="md:col-span-2">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 border border-neon-pink/40 bg-neon-pink/5 text-neon-pink text-[10px] font-bold tracking-[0.25em] uppercase mb-4">
                <Sparkles className="w-3 h-3" /> Today's Challenge · resets 00:00 UTC
              </div>
              <h3 className="text-3xl md:text-4xl font-bold font-display tracking-tight mb-2">{ch.title}</h3>
              <p className="text-muted-foreground mb-4">{ch.goal}</p>
              <div className="flex flex-wrap gap-2 text-[10px] font-bold tracking-widest uppercase">
                <span className="px-2.5 py-1 border border-neon-cyan/40 text-neon-cyan">+{ch.target} {ch.unit} required</span>
                <span className="px-2.5 py-1 border border-neon-pink/40 text-neon-pink">Reward · {ch.reward}</span>
              </div>
            </div>
            <div className="flex md:justify-end">
              <Link
                to="/battles"
                className="px-7 py-4 bg-neon-pink text-foreground font-bold text-sm tracking-[0.2em] inline-flex items-center gap-2 hover:scale-105 transition-transform animate-battle-charge"
              >
                ACCEPT <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   8. BEYOND BATTLES  —  supporting cast (de-emphasized)
   ════════════════════════════════════════════════════════════════════ */

const SUPPORT = [
  { icon: Brain,           label: "Luna",            tag: "AI Tutor",      blurb: "Hint-first AI that won't hand you the answer.", to: "/luna" as const },
  { icon: Target,          label: "Adaptive Tests",  tag: "Practice",      blurb: "Tests that branch on every answer to find the cracks.", to: "/adaptive-tests" as const },
  { icon: GraduationCap,   label: "Courses",         tag: "Curriculum",    blurb: "Curated tracks + custom syllabi you can build yourself.", to: "/certified" as const },
  { icon: MessagesSquare,  label: "Forum",           tag: "Community",     blurb: "Stack-Exchange-style threads tagged by course.", to: "/forum" as const },
] as const;

function BeyondBattles() {
  return (
    <section className="px-6 py-24">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-[11px] font-bold tracking-[0.3em] uppercase text-neon-cyan mb-3">Between Matches</p>
          <h2 className="text-3xl md:text-4xl font-bold font-display tracking-tight mb-3">
            Sharpen the edge.
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm">
            Battles are the arena. These are the training rooms.
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {SUPPORT.map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ delay: i * 0.06, duration: 0.4 }}
              >
                <Link
                  to={s.to}
                  className="block glass-panel p-5 h-full hover:border-neon-purple/40 transition-colors group"
                >
                  <Icon className="w-5 h-5 text-neon-purple mb-3 group-hover:scale-110 transition-transform" />
                  <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-1">{s.tag}</p>
                  <h3 className="text-sm font-bold font-display tracking-wider mb-2">{s.label}</h3>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{s.blurb}</p>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   9. FINAL CTA
   ════════════════════════════════════════════════════════════════════ */

function FinalCta() {
  const { isAuthenticated } = useAuth();
  return (
    <section className="px-6 pt-8 pb-24">
      <div className="max-w-5xl mx-auto relative overflow-hidden glass-panel p-12 md:p-16 text-center">
        <div className="absolute -top-20 -right-20 w-72 h-72 bg-neon-pink/25 rounded-full blur-[100px]" />
        <div className="absolute -bottom-20 -left-20 w-72 h-72 bg-neon-purple/25 rounded-full blur-[100px]" />
        <div className="relative">
          <motion.div
            animate={{ rotate: [0, 6, -6, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="mx-auto mb-5 w-fit"
          >
            <Swords className="w-9 h-9 text-neon-pink" />
          </motion.div>
          <h2 className="text-4xl md:text-6xl font-bold font-display tracking-tight mb-4">
            The arena is open.
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto mb-8">
            Free to start. No credit card. Pick a class, take your first match, and find out
            what kind of fighter you actually are.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {isAuthenticated ? (
              <>
                <Link to="/battles" className="px-8 py-4 bg-neon-pink text-foreground font-bold text-sm tracking-[0.2em] inline-flex items-center gap-2 hover:scale-105 transition-transform animate-battle-charge">
                  <Swords className="w-4 h-4" /> BATTLE NOW <ArrowRight className="w-4 h-4" />
                </Link>
                <Link to="/progress" className="px-7 py-4 border border-border hover:border-neon-purple text-foreground font-bold text-sm tracking-[0.2em] transition-colors">
                  TROPHY ROAD
                </Link>
              </>
            ) : (
              <>
                <Link to="/signup" className="px-8 py-4 bg-neon-pink text-foreground font-bold text-sm tracking-[0.2em] inline-flex items-center gap-2 hover:scale-105 transition-transform animate-battle-charge">
                  <Swords className="w-4 h-4" /> CREATE ACCOUNT <ArrowRight className="w-4 h-4" />
                </Link>
                <Link to="/login" className="px-7 py-4 border border-border hover:border-neon-purple text-foreground font-bold text-sm tracking-[0.2em] transition-colors">
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

/* ════════════════════════════════════════════════════════════════════
   ROOT
   ════════════════════════════════════════════════════════════════════ */

export function LandingShowcase() {
  return (
    <>
      <Hero />
      <LiveTicker />
      <BattleAnatomy />
      <ClassPicker />
      <RankLadder />
      <TrophyTease />
      <DailyChallenge />
      <BeyondBattles />
      <FinalCta />
    </>
  );
}