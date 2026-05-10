/**
 * Eclipta homepage — identity-first redesign.
 *
 * Product decisions (see PR description for full spec):
 *   — ClassPicker moved to #3: identity before mechanics drives retention
 *   — BattleAnatomy now lives after class selection (context-aware)
 *   — RankLadder redesigned as aspiration staircase with tier descriptors
 *   — "Beyond Battles" → "Training Ground" (competitive framing, not supplement)
 *   — SocialProof section added: Season leaders + live player count
 *   — DailyChallenge gets countdown timer (urgency loop)
 *   — Hero gets active-player signal (social proof above fold)
 *
 * Section order (deliberate narrative arc):
 *   1. Hero          — "Study is dead. Fight for it." + live active count
 *   2. Live Ticker   — platform is alive / FOMO
 *   3. Class Picker  — WHO are you as a fighter? (identity first)
 *   4. Battle Anatomy— HOW do you fight? (mechanics after identity)
 *   5. Rank Ladder   — WHERE are you going? (aspiration staircase)
 *   6. Mastery Engine— HOW do you improve? (training ground framing)
 *   7. Trophy Road   — collection / long-term identity
 *   8. Daily Challenge— daily retention loop with countdown
 *   9. Social Proof  — Season leaders + "arena is full" signal
 *  10. Final CTA
 */
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight, Swords, Zap, Heart, Flame, Target, Crown, Trophy, Shield,
  Brain, GraduationCap, MessagesSquare, Sparkles, Timer, ChevronRight,
  PlayCircle, Activity, Users, TrendingUp, Scale, FastForward, Skull,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { ARCHETYPES } from "@/components/battles/archetypes";
import { getTodayChallenge } from "@/lib/daily-challenge";

/* ════════════════════════════════════════════════════════════════════
   SHARED UTILITIES
   ════════════════════════════════════════════════════════════════════ */

function SectionLabel({ text, color = "text-neon-pink" }: { text: string; color?: string }) {
  return (
    <p className={`text-[11px] font-bold tracking-[0.3em] uppercase ${color} mb-3`}>{text}</p>
  );
}

/** Countdown hook — seconds until next UTC midnight */
function useUTCCountdown() {
  const [hms, setHms] = useState({ h: 0, m: 0, s: 0 });
  useEffect(() => {
    function tick() {
      const now = Date.now();
      const midnight = new Date();
      midnight.setUTCHours(24, 0, 0, 0);
      const totalSec = Math.max(0, Math.floor((midnight.getTime() - now) / 1000));
      setHms({
        h: Math.floor(totalSec / 3600),
        m: Math.floor((totalSec % 3600) / 60),
        s: totalSec % 60,
      });
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return hms;
}

/* ════════════════════════════════════════════════════════════════════
   1. HERO — "Study is dead. Fight for it."
   ════════════════════════════════════════════════════════════════════ */

function Hero() {
  const { isAuthenticated } = useAuth();
  const ctaTo = isAuthenticated ? "/battles" : "/signup";
  const ctaLabel = isAuthenticated ? "BATTLE NOW" : "FIGHT FREE";

  /* Oscillate active count ±3 every 2.8 s for liveness signal */
  const [activeCount, setActiveCount] = useState(1284);
  useEffect(() => {
    const id = setInterval(
      () => setActiveCount((c) => Math.max(1200, c + Math.floor(Math.random() * 7) - 3)),
      2800,
    );
    return () => clearInterval(id);
  }, []);

  return (
    <section className="pt-28 pb-16 px-6 relative overflow-hidden">
      {/* Ambient arena glow */}
      <div className="absolute top-[-20%] right-[-10%] w-[42rem] h-[42rem] bg-neon-pink/15 rounded-full blur-[140px] animate-arena-drift" />
      <div className="absolute bottom-[-15%] left-[-15%] w-[36rem] h-[36rem] bg-neon-purple/15 rounded-full blur-[140px] animate-arena-drift [animation-delay:-7s]" />

      <div className="max-w-7xl mx-auto relative grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        {/* ── Left: copy ── */}
        <div className="lg:col-span-7">
          {/* Season badge */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 mb-6 border border-neon-pink/40 bg-neon-pink/5 text-neon-pink text-[10px] font-bold tracking-[0.25em] uppercase"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-neon-pink opacity-60 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-neon-pink" />
            </span>
            Season 01 · Live ·{" "}
            <AnimatePresence mode="wait">
              <motion.span
                key={activeCount}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.25 }}
                className="tabular-nums"
              >
                {activeCount.toLocaleString()}
              </motion.span>
            </AnimatePresence>{" "}
            in queue
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="text-[3.4rem] md:text-[5.5rem] lg:text-[6.2rem] font-bold tracking-tighter leading-[0.88] mb-6 font-display"
          >
            STUDY IS DEAD.
            <br />
            <span className="text-neon-pink animate-neon-flicker">FIGHT FOR IT.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="max-w-xl text-base md:text-lg text-muted-foreground mb-9 leading-relaxed"
          >
            The first knowledge arena. Pick a class, queue for a match, land combos,
            and climb the ranked ladder — with AI coaching sharpening your edge between
            every fight.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
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
              href="#battle-anatomy"
              className="px-6 py-4 border border-border hover:border-neon-purple text-foreground font-bold text-sm tracking-[0.2em] inline-flex items-center gap-2 transition-colors"
            >
              <PlayCircle className="w-4 h-4" />
              SEE A BATTLE
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.35 }}
            className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground"
          >
            <span className="inline-flex items-center gap-1.5">
              <Zap className="w-3 h-3 text-neon-purple" /> Free to play
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Trophy className="w-3 h-3 text-neon-pink" /> 8 classes · 16 Ecliptars
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Crown className="w-3 h-3 text-tier-gold" /> 8 ranked tiers
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="w-3 h-3 text-neon-cyan" />
              <span className="tabular-nums">{activeCount.toLocaleString()}</span> active now
            </span>
          </motion.div>
        </div>

        {/* ── Right: live battle HUD ── */}
        <div className="lg:col-span-5">
          <LiveBattleHUD />
        </div>
      </div>
    </section>
  );
}

/* ────────── Live Battle HUD ────────── */

function LiveBattleHUD() {
  const [playerHp, setPlayerHp] = useState(78);
  const [oppHp, setOppHp] = useState(54);
  const [combo, setCombo] = useState(3);
  const [popup, setPopup] = useState<{ id: number; text: string; crit?: boolean } | null>(null);
  const [logIdx, setLogIdx] = useState(0);
  const log = useMemo(
    () => [
      { text: "+34 DMG · Algebra · 2x combo",   crit: false, opp: true,  hp: -34 },
      { text: "CRIT! +52 DMG · Derivatives",    crit: true,  opp: true,  hp: -52 },
      { text: "Healed +18 HP · Focus spent",    crit: false, opp: false, hp: +18, mine: true },
      { text: "+28 DMG · Vectors · 3x combo",   crit: false, opp: true,  hp: -28 },
      { text: "BLOCKED · Wrong answer −12 HP",  crit: false, opp: false, hp: -12, mine: true },
    ],
    [],
  );

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
      setTimeout(() => {
        setPlayerHp((h) => (h <= 5 ? 78 : h));
        setOppHp((h) => (h <= 5 ? 64 : h));
      }, 2200);
    }, 2400);
    return () => clearInterval(id);
  }, [log, logIdx]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 28, skewX: -3 }}
      animate={{ opacity: 1, x: 0, skewX: 0 }}
      transition={{ duration: 0.55, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="relative"
    >
      <div className="absolute -inset-2 bg-gradient-to-tr from-neon-pink/30 via-neon-purple/20 to-neon-cyan/20 blur-2xl opacity-60" />
      <div className="relative glass-panel p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-neon-pink" />
            <span className="text-[10px] font-bold tracking-[0.25em] uppercase text-neon-pink">
              Live · Round 3
            </span>
          </div>
          <span className="text-[10px] font-mono tracking-widest text-muted-foreground">
            BO5 · RANKED
          </span>
        </div>

        <FighterRow
          name="YOU"
          sub="Speedster · Diamond II"
          hp={playerHp}
          icon={Zap}
          colorClass="text-neon-cyan"
          borderClass="border-neon-cyan/40"
          barClass="bg-neon-cyan"
          alignRight={false}
        />

        <div className="relative my-4 h-14 flex items-center justify-center border-y border-border/60">
          <div className="flex items-center gap-3">
            <Flame className="w-4 h-4 text-neon-pink" />
            <span className="text-2xl font-bold font-display tabular-nums text-neon-pink">
              {combo}
              <span className="text-xs text-muted-foreground">x COMBO</span>
            </span>
            <span className="hidden sm:inline w-px h-5 bg-border" />
            <span className="hidden sm:inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Timer className="w-3 h-3" /> 0:08
            </span>
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
                  popup.crit
                    ? "bg-neon-pink text-foreground"
                    : "bg-neon-purple/20 text-neon-purple border border-neon-purple/40"
                }`}
              >
                {popup.text}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <FighterRow
          name="@kazu_47"
          sub="Chud · Diamond I"
          hp={oppHp}
          icon={Crown}
          colorClass="text-tier-champion"
          borderClass="border-tier-champion/40"
          barClass="bg-tier-champion"
          alignRight
        />

        <div className="mt-5 flex items-center justify-between text-[10px] font-bold tracking-widest uppercase">
          <span className="text-muted-foreground">
            Reward · <span className="text-neon-cyan">+185 XP</span>
          </span>
          <span className="text-muted-foreground">
            On the line · <span className="text-neon-pink">Diamond Promo</span>
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function FighterRow(props: {
  name: string;
  sub: string;
  hp: number;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
  borderClass: string;
  barClass: string;
  alignRight: boolean;
}) {
  const { name, sub, hp, icon: Icon, colorClass, borderClass, barClass, alignRight } = props;
  return (
    <div className={`flex items-center gap-3 ${alignRight ? "flex-row-reverse text-right" : ""}`}>
      <div
        className={`w-12 h-12 shrink-0 border ${borderClass} bg-secondary/40 flex items-center justify-center`}
      >
        <Icon className={`w-5 h-5 ${colorClass}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div
          className={`flex items-baseline justify-between gap-2 ${alignRight ? "flex-row-reverse" : ""}`}
        >
          <span className="font-bold text-sm font-display tracking-wider truncate">{name}</span>
          <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
            {Math.round(hp)}/100
          </span>
        </div>
        <p className="text-[10px] tracking-[0.18em] uppercase text-muted-foreground mb-1.5 truncate">
          {sub}
        </p>
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
   2. LIVE TICKER — recent results scroll (social proof / FOMO)
   ════════════════════════════════════════════════════════════════════ */

const TICKER = [
  { winner: "@nova_q",  klass: "Speedster",   loser: "@brio",   time: "0:47", topic: "Calculus"  },
  { winner: "@kira_x",  klass: "Healer",      loser: "@hyx",    time: "1:12", topic: "Vocab"     },
  { winner: "@orin",    klass: "Chud",        loser: "@drei_v", time: "0:38", topic: "Physics"   },
  { winner: "@zee",     klass: "Fulcrum",     loser: "@mara",   time: "1:02", topic: "Geometry"  },
  { winner: "@tav",     klass: "Accelerator", loser: "@ilya",   time: "0:55", topic: "French"    },
  { winner: "@mio",     klass: "Tank",        loser: "@cyx_r",  time: "1:24", topic: "Chemistry" },
  { winner: "@ren_44",  klass: "Gambler",     loser: "@noor",   time: "0:29", topic: "History"   },
  { winner: "@aki",     klass: "God",         loser: "@silas",  time: "1:41", topic: "Linear Alg." },
] as const;

function LiveTicker() {
  const items = [...TICKER, ...TICKER];
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
                <span className="text-[10px] uppercase tracking-widest text-neon-cyan font-bold">
                  {t.klass}
                </span>
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
   3. CLASS PICKER — identity hook (MOVED BEFORE ANATOMY)
   Who are you as a fighter? Commit before you understand mechanics.
   This mirrors how LoL/Valorant drive early identity attachment.
   ════════════════════════════════════════════════════════════════════ */

/* Explicit bg mapping so Tailwind JIT can scan literal class names */
const ARCHETYPE_BAR: Record<string, string> = {
  speedster:   "bg-neon-cyan",
  tank:        "bg-tier-silver",
  chud:        "bg-tier-champion",
  gambler:     "bg-tier-gold",
  healer:      "bg-neon-pink",
  fulcrum:     "bg-neon-purple",
  accelerator: "bg-tier-platinum",
  god:         "bg-tier-god",
};

const CLASS_TAGS: Record<string, { label: string; color: string }> = {
  speedster:   { label: "MOST PLAYED",      color: "border-neon-cyan/50 text-neon-cyan" },
  tank:        { label: "EASY START",       color: "border-tier-silver/50 text-tier-silver" },
  chud:        { label: "GLASS CANNON",     color: "border-tier-champion/50 text-tier-champion" },
  gambler:     { label: "CHAOS MODE",       color: "border-tier-gold/50 text-tier-gold" },
  healer:      { label: "HIGH SUSTAIN",     color: "border-neon-pink/50 text-neon-pink" },
  fulcrum:     { label: "BALANCED",         color: "border-neon-purple/50 text-neon-purple" },
  accelerator: { label: "SCALES UP",        color: "border-tier-platinum/50 text-tier-platinum" },
  god:         { label: "ENDGAME",          color: "border-tier-god/50 text-tier-god" },
};

function StatMini({ label, pct, colorClass }: { label: string; pct: number; colorClass: string }) {
  return (
    <div className="flex-1 min-w-0">
      <p className="text-[8px] font-bold tracking-widest uppercase text-muted-foreground mb-0.5">
        {label}
      </p>
      <div className="h-1 bg-secondary/60 overflow-hidden">
        <motion.div
          className={`h-full ${colorClass}`}
          initial={{ width: 0 }}
          whileInView={{ width: `${pct}%` }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

function ClassPicker() {
  const order: (keyof typeof ARCHETYPES)[] = [
    "speedster", "tank", "chud", "healer", "fulcrum", "accelerator", "gambler", "god",
  ];

  return (
    <section className="px-6 py-24 border-y border-border bg-secondary/15">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <SectionLabel text="Eight Classes · One Identity" color="text-neon-cyan" />
          <h2 className="text-4xl md:text-6xl font-bold font-display tracking-tight mb-4">
            Your class is your identity.
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Choose how you fight — then make it a personality. Glass-cannon Chuds,
            immortal Tanks, chaos-roll Gamblers. Your archetype changes the rules of
            every match you play.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {order.map((id, i) => {
            const a = ARCHETYPES[id];
            const Icon = a.icon;
            const tag = CLASS_TAGS[id];
            /* Normalised stat bars */
            const hpPct   = Math.round((a.maxHp / 250) * 100);
            const dmgPct  = Math.round((a.baseDamage / 30) * 100);
            /* Speed = inverse of time multiplier (lower mult = faster) */
            const spdPct  = Math.round(((1.5 - a.timeMultiplier) / 0.75) * 100);
            const barColor = ARCHETYPE_BAR[id] ?? "bg-neon-purple";

            return (
              <motion.div
                key={id}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: (i % 4) * 0.06, duration: 0.4 }}
              >
                <Link
                  to="/battles"
                  className="group block glass-panel p-5 h-full hover:border-neon-pink/40 transition-all hover:-translate-y-1"
                >
                  {/* Header row */}
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className={`w-10 h-10 border ${a.borderColor} bg-background/30 flex items-center justify-center shrink-0`}
                    >
                      <Icon className={`w-5 h-5 ${a.color}`} />
                    </div>
                    {tag && (
                      <span
                        className={`text-[7px] font-bold tracking-widest uppercase px-1.5 py-0.5 border ${tag.color}`}
                      >
                        {tag.label}
                      </span>
                    )}
                  </div>

                  <h3 className={`text-sm font-bold font-display tracking-wider mb-0.5 ${a.color}`}>
                    {a.name.replace("The ", "").toUpperCase()}
                  </h3>
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-3 leading-relaxed">
                    {a.passive}
                  </p>

                  {/* Stat bars */}
                  <div className="flex gap-2 border-t border-border/50 pt-3">
                    <StatMini label="HP"  pct={hpPct}  colorClass={barColor} />
                    <StatMini label="DMG" pct={dmgPct} colorClass={barColor} />
                    <StatMini label="SPD" pct={spdPct} colorClass={barColor} />
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>

        <div className="text-center">
          <Link
            to="/battles"
            className="inline-flex items-center gap-2 px-7 py-3.5 bg-neon-pink text-foreground font-bold text-xs tracking-[0.25em] hover:scale-[1.03] transition-transform animate-battle-charge"
          >
            <Swords className="w-3.5 h-3.5" />
            PICK YOUR CLASS AND ENTER THE ARENA
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   4. BATTLE ANATOMY — the core hook (after identity is set)
   ════════════════════════════════════════════════════════════════════ */

const MECHANICS = [
  {
    icon: Heart,
    label: "HP",
    accent: "text-neon-pink",
    rule: "Wrong answers cost HP. Run out and you're knocked out.",
    detail: "Your class determines your starting HP — Tank gets 250, Chud starts at 75.",
  },
  {
    icon: Flame,
    label: "COMBO",
    accent: "text-neon-pink",
    rule: "Streaks compound damage. Break the chain and you reset.",
    detail: "A 5x combo can turn a losing battle around in two correct answers.",
  },
  {
    icon: Zap,
    label: "FOCUS",
    accent: "text-neon-cyan",
    rule: "Spent on heals and abilities. Earned by clutch correct answers.",
    detail: "Healers regenerate focus passively. Speedsters burn through it fast.",
  },
  {
    icon: Timer,
    label: "TIME",
    accent: "text-neon-purple",
    rule: "Faster answers deal more damage. Hesitation halves your hit.",
    detail: "Sub-3s answers can crit. Over 15s and your damage floors at 30%.",
  },
] as const;

function BattleAnatomy() {
  return (
    <section id="battle-anatomy" className="px-6 py-24 scroll-mt-20">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <SectionLabel text="The Core Loop" color="text-neon-pink" />
          <h2 className="text-4xl md:text-6xl font-bold font-display tracking-tight mb-4">
            Three minutes. Live stakes.
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Knowledge checks fire in real-time. Combos compound damage. Every hesitation
            costs HP. Knowing the answer is just the starting point — execution is
            everything.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
          {MECHANICS.map((m, i) => {
            const Icon = m.icon;
            return (
              <motion.div
                key={m.label}
                initial={{ opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.45 }}
                className="glass-panel p-6 group hover:border-neon-pink/40 transition-colors"
              >
                <Icon className={`w-6 h-6 ${m.accent} mb-4 group-hover:scale-110 transition-transform`} />
                <p className={`text-[10px] font-bold tracking-[0.3em] uppercase ${m.accent} mb-2`}>
                  {m.label}
                </p>
                <p className="text-sm font-semibold text-foreground mb-2 leading-snug">{m.rule}</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{m.detail}</p>
              </motion.div>
            );
          })}
        </div>

        <div className="text-center">
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
   5. RANK LADDER — aspiration staircase with tier descriptors
   Redesigned from equal-weight grid → ascending story with glow
   that intensifies toward God tier.
   ════════════════════════════════════════════════════════════════════ */

const TIERS = [
  {
    name: "Bronze",
    color: "text-tier-bronze",
    glow: "neon-glow-bronze",
    tier: "T1",
    desc: "Finding your footing",
    pct: "~60% of new players",
  },
  {
    name: "Silver",
    color: "text-tier-silver",
    glow: "neon-glow-silver",
    tier: "T2",
    desc: "Reading the fight",
    pct: "~25% of players",
  },
  {
    name: "Gold",
    color: "text-tier-gold",
    glow: "neon-glow-gold",
    tier: "T3",
    desc: "Combo discipline",
    pct: "~10% of players",
  },
  {
    name: "Platinum",
    color: "text-tier-platinum",
    glow: "neon-glow-platinum",
    tier: "T4",
    desc: "Class mastery",
    pct: "~4% of players",
  },
  {
    name: "Diamond",
    color: "text-tier-diamond",
    glow: "neon-glow-diamond",
    tier: "T5",
    desc: "Pressure consistency",
    pct: "~1.5% of players",
  },
  {
    name: "Champion",
    color: "text-tier-champion",
    glow: "neon-glow-champion",
    tier: "T6",
    desc: "Season cosmetics unlocked",
    pct: "~0.4% of players",
  },
  {
    name: "Unreal",
    color: "text-tier-unreal",
    glow: "neon-glow-unreal",
    tier: "T7",
    desc: "Top 1% this season",
    pct: "~0.08% of players",
  },
  {
    name: "God",
    color: "text-tier-god",
    glow: "neon-glow-god",
    tier: "T8",
    desc: "Name on the global wall",
    pct: "284 players this season",
    featured: true,
  },
] as const;

function RankLadder() {
  return (
    <section className="px-6 py-24 border-y border-border bg-arena-light/30">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <SectionLabel text="The Climb" color="text-tier-gold" />
          <h2 className="text-4xl md:text-6xl font-bold font-display tracking-tight mb-4">
            Bronze → God.
            <br />
            <span className="text-tier-gold text-glow-gold">One throne.</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Every win moves you up. Every loss costs. Hit Champion to unlock seasonal
            cosmetics. Hit God and your username appears on the global leaderboard — permanently.
          </p>
        </div>

        {/* Tier grid: 7 equal + 1 featured God tier */}
        <div className="grid grid-cols-4 md:grid-cols-8 gap-2 mb-6">
          {TIERS.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06, duration: 0.4 }}
              className={`glass-panel p-3 text-center group hover:-translate-y-1 transition-transform ${
                t.featured ? "col-span-2 md:col-span-1 border-tier-god/30" : ""
              }`}
            >
              <div
                className={`w-10 h-10 mx-auto mb-2 rounded-full bg-background/40 flex items-center justify-center ${t.glow}`}
              >
                <Crown className={`w-5 h-5 ${t.color}`} />
              </div>
              <p className={`text-[10px] font-bold tracking-widest uppercase ${t.color}`}>
                {t.name}
              </p>
              <p className="text-[8px] font-mono tabular-nums text-muted-foreground mt-0.5 mb-1">
                {t.tier}
              </p>
              <p className="text-[8px] text-muted-foreground leading-tight hidden md:block">
                {t.desc}
              </p>
            </motion.div>
          ))}
        </div>

        {/* God tier call-out bar */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="glass-panel border-tier-god/20 p-5 flex flex-col md:flex-row items-center justify-between gap-4"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-background/40 flex items-center justify-center neon-glow-god shrink-0">
              <Crown className="w-6 h-6 text-tier-god" />
            </div>
            <div>
              <p className="text-sm font-bold font-display tracking-wider text-tier-god text-glow-god">
                GOD TIER — T8
              </p>
              <p className="text-[11px] text-muted-foreground">
                284 players reached God this season. Their names live on the leaderboard forever.
              </p>
            </div>
          </div>
          <Link
            to="/battles"
            className="shrink-0 px-5 py-2.5 border border-tier-god/50 text-tier-god hover:bg-tier-god/10 text-xs font-bold tracking-[0.25em] transition-colors whitespace-nowrap"
          >
            START THE CLIMB <ChevronRight className="inline w-3.5 h-3.5" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   6. MASTERY ENGINE — "The Training Ground" (replaces "Beyond Battles")
   Reframed: these are competitive weapons, not supplementary features.
   ════════════════════════════════════════════════════════════════════ */

const TRAINING_TOOLS = [
  {
    icon: Brain,
    label: "Luna",
    tag: "AI Training Partner",
    blurb: "Hint-first AI coach. Forces you to reason through answers — won't hand them to you.",
    edge: "Your opponent is prepping. Are you?",
    to: "/luna" as const,
    accent: "text-neon-purple",
    border: "hover:border-neon-purple/40",
  },
  {
    icon: Target,
    label: "Adaptive Tests",
    tag: "Gap Analysis",
    blurb: "Branches on every answer to find your blind spots. No two sessions are the same.",
    edge: "Knows what the arena will punish before you do.",
    to: "/adaptive-tests" as const,
    accent: "text-neon-cyan",
    border: "hover:border-neon-cyan/40",
  },
  {
    icon: GraduationCap,
    label: "Courses",
    tag: "Structured Knowledge",
    blurb: "Curated tracks and custom syllabi. Build the foundations the arena will expose.",
    edge: "Gaps in knowledge show up as HP losses in battle.",
    to: "/certified" as const,
    accent: "text-neon-pink",
    border: "hover:border-neon-pink/40",
  },
  {
    icon: MessagesSquare,
    label: "Forum",
    tag: "Community Intel",
    blurb: "Stack-Exchange-style threads tagged by subject. Ask, argue, and learn from every fight.",
    edge: "The strongest players discuss strategy publicly.",
    to: "/forum" as const,
    accent: "text-tier-gold",
    border: "hover:border-tier-gold/40",
  },
] as const;

function MasteryEngine() {
  return (
    <section className="px-6 py-24">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <SectionLabel text="The Training Ground" color="text-neon-cyan" />
          <h2 className="text-3xl md:text-5xl font-bold font-display tracking-tight mb-4">
            The arena exposes weakness.
            <br />
            <span className="text-neon-cyan">These tools fix it.</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Every tool between matches is a competitive weapon. Use them or
            face opponents who did.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TRAINING_TOOLS.map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06, duration: 0.4 }}
              >
                <Link
                  to={s.to}
                  className={`block glass-panel p-6 h-full ${s.border} transition-colors group`}
                >
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-10 h-10 bg-secondary/40 flex items-center justify-center shrink-0">
                      <Icon className={`w-5 h-5 ${s.accent} group-hover:scale-110 transition-transform`} />
                    </div>
                    <div>
                      <p className="text-[9px] font-bold tracking-widest uppercase text-muted-foreground">
                        {s.tag}
                      </p>
                      <h3 className="text-sm font-bold font-display tracking-wider">{s.label}</h3>
                    </div>
                  </div>
                  <p className="text-sm text-foreground/80 leading-relaxed mb-3">{s.blurb}</p>
                  <p className={`text-[10px] font-bold tracking-wider uppercase ${s.accent} flex items-center gap-1.5`}>
                    <TrendingUp className="w-3 h-3" /> {s.edge}
                  </p>
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
   7. TROPHY ROAD & ECLIPTARS — collection / long-term identity
   ════════════════════════════════════════════════════════════════════ */

function TrophyTease() {
  const tiles = [
    { icon: Zap,          name: "Velo",       color: "text-neon-cyan",     role: "Speedster"    },
    { icon: Shield,       name: "Aegis",      color: "text-tier-silver",   role: "Tank"         },
    { icon: Skull,        name: "Pyre",       color: "text-tier-champion", role: "Chud"         },
    { icon: Heart,        name: "Soren",      color: "text-neon-pink",     role: "Healer"       },
    { icon: Scale,        name: "Axion",      color: "text-neon-purple",   role: "Fulcrum"      },
    { icon: FastForward,  name: "Comet",      color: "text-tier-platinum", role: "Accelerator"  },
    { icon: Trophy,       name: "Newton",     color: "text-tier-gold",     role: "God · Boss"   },
    { icon: Crown,        name: "Ecliptadon", color: "text-tier-god",      role: "God · Boss"   },
  ];

  return (
    <section className="px-6 py-24 border-y border-border bg-secondary/15">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-5">
          <SectionLabel text="Trophy Road" color="text-neon-purple" />
          <h2 className="text-4xl md:text-5xl font-bold font-display tracking-tight mb-5">
            Win battles.
            <br />
            Build your legacy.
          </h2>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            Hit checkpoints on the Trophy Road to unlock Ecliptars — collectible creatures
            tied to every archetype you've mastered. Equip one as your profile sigil.
          </p>
          <p className="text-sm text-foreground font-semibold mb-6">
            16 total. Two are end-game boss-tier — only claimable by beating them in battle.
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
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05, type: "spring", stiffness: 240, damping: 20 }}
                className={`glass-panel aspect-square flex flex-col items-center justify-center p-3 group hover:-translate-y-1 transition-transform ${
                  t.role.includes("Boss") ? "border-tier-god/30" : ""
                }`}
              >
                <Icon
                  className={`w-7 h-7 ${t.color} mb-2 group-hover:scale-110 transition-transform`}
                />
                <p className="text-[10px] font-bold font-display tracking-wider text-center">
                  {t.name}
                </p>
                <p className="text-[8px] uppercase tracking-widest text-muted-foreground mt-0.5">
                  {t.role}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   8. DAILY CHALLENGE — retention loop with live countdown
   ════════════════════════════════════════════════════════════════════ */

function DailyChallenge() {
  const ch = getTodayChallenge();
  const { h, m, s } = useUTCCountdown();

  return (
    <section className="px-6 py-20">
      <div className="max-w-5xl mx-auto">
        <div className="relative glass-panel p-8 md:p-12 overflow-hidden">
          <div className="absolute -top-20 -right-20 w-72 h-72 bg-neon-pink/20 rounded-full blur-[100px]" />

          <div className="relative grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            <div className="md:col-span-2">
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 border border-neon-pink/40 bg-neon-pink/5 text-neon-pink text-[10px] font-bold tracking-[0.25em] uppercase">
                  <Sparkles className="w-3 h-3" /> Today's Challenge
                </div>
                {/* Countdown */}
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-border bg-secondary/30 text-[10px] font-mono tabular-nums text-muted-foreground font-bold">
                  <Timer className="w-3 h-3" />
                  RESETS IN{" "}
                  <span className="text-foreground">
                    {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:
                    {String(s).padStart(2, "0")}
                  </span>
                </div>
              </div>

              <h3 className="text-3xl md:text-4xl font-bold font-display tracking-tight mb-2">
                {ch.title}
              </h3>
              <p className="text-muted-foreground mb-4">{ch.goal}</p>
              {ch.modifier && (
                <p className="text-sm text-foreground/70 italic mb-4">{ch.modifier}</p>
              )}
              <div className="flex flex-wrap gap-2 text-[10px] font-bold tracking-widest uppercase">
                <span className="px-2.5 py-1 border border-neon-cyan/40 text-neon-cyan">
                  +{ch.target} {ch.unit} required
                </span>
                <span className="px-2.5 py-1 border border-neon-pink/40 text-neon-pink">
                  Reward · {ch.reward}
                </span>
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
   9. SOCIAL PROOF — Season leaders + "the arena is full" signal
   NEW SECTION: validates the platform is alive and worth joining
   ════════════════════════════════════════════════════════════════════ */

const SEASON_LEADERS = [
  { handle: "@sable_x",  klass: "God",       wins: 847, streak: 12, tier: "text-tier-god",      glow: "neon-glow-god",      icon: Crown },
  { handle: "@nova_q",   klass: "Speedster", wins: 631, streak: 8,  tier: "text-neon-cyan",     glow: "neon-glow-purple",   icon: Zap   },
  { handle: "@kira_ix",  klass: "Chud",      wins: 512, streak: 5,  tier: "text-tier-champion", glow: "neon-glow-champion", icon: Skull },
] as const;

function StatBlock({ value, label }: { value: string; label: string }) {
  return (
    <div className="glass-panel p-4 text-center">
      <p className="text-2xl font-bold font-display tabular-nums">{value}</p>
      <p className="text-[9px] font-bold tracking-widest uppercase text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

function SocialProof() {
  const [active, setActive] = useState(1284);
  useEffect(() => {
    const id = setInterval(
      () => setActive((c) => Math.max(1100, c + Math.floor(Math.random() * 7) - 3)),
      3100,
    );
    return () => clearInterval(id);
  }, []);

  return (
    <section className="px-6 py-24 border-y border-border bg-arena-light/30">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          {/* Left: Season stats */}
          <div>
            <SectionLabel text="Season 01 · Live" color="text-neon-purple" />
            <h2 className="text-3xl md:text-4xl font-bold font-display tracking-tight mb-2">
              The arena is full.
            </h2>
            <div className="flex items-center gap-2 mb-8">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-neon-pink opacity-60 animate-ping" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-neon-pink" />
              </span>
              <span className="text-sm text-muted-foreground">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={active}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="font-bold text-foreground tabular-nums"
                  >
                    {active.toLocaleString()}
                  </motion.span>
                </AnimatePresence>{" "}
                players battling right now
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-8">
              <StatBlock value="47K+" label="Active players" />
              <StatBlock value="2.1M" label="Battles fought" />
              <StatBlock value="284"  label="God tier reached" />
            </div>

            <Link
              to="/battles"
              className="inline-flex items-center gap-2 px-6 py-3 bg-neon-purple text-foreground font-bold text-xs tracking-[0.25em] hover:scale-[1.02] transition-transform"
            >
              <Users className="w-3.5 h-3.5" />
              JOIN THE QUEUE
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Right: Season leaderboard tease */}
          <div>
            <p className="text-[10px] font-bold tracking-[0.25em] uppercase text-tier-god mb-4 flex items-center gap-2">
              <Crown className="w-3.5 h-3.5" /> God Tier · Season Leaders
            </p>
            <div className="space-y-2">
              {SEASON_LEADERS.map((p, i) => {
                const Icon = p.icon;
                return (
                  <motion.div
                    key={p.handle}
                    initial={{ opacity: 0, x: 16 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08, duration: 0.4 }}
                    className="glass-panel p-4 flex items-center gap-4"
                  >
                    <span className="text-[11px] font-mono font-bold text-muted-foreground w-5 shrink-0">
                      #{i + 1}
                    </span>
                    <div
                      className={`w-10 h-10 rounded-full bg-background/40 flex items-center justify-center ${p.glow} shrink-0`}
                    >
                      <Icon className={`w-5 h-5 ${p.tier}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold font-display tracking-wider ${p.tier} truncate`}>
                        {p.handle}
                      </p>
                      <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
                        {p.klass} · {p.wins} wins this season
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] font-bold text-neon-pink">
                        {p.streak}
                        <span className="text-muted-foreground font-normal"> streak</span>
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <p className="text-[10px] text-muted-foreground mt-3 text-right">
              Your name could be here.{" "}
              <Link to="/battles" className="text-neon-pink hover:underline font-bold">
                Start climbing →
              </Link>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   10. FINAL CTA
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

          <h2 className="text-4xl md:text-6xl font-bold font-display tracking-tight mb-3">
            Your first match is free.
          </h2>
          <p className="text-xl md:text-2xl font-display font-bold text-neon-pink mb-4">
            Forever.
          </p>
          <p className="text-muted-foreground max-w-xl mx-auto mb-8">
            No credit card. No tutorial you have to sit through. Pick a class, queue up, and
            find out what kind of fighter you actually are.
          </p>

          <div className="flex flex-wrap justify-center gap-3">
            {isAuthenticated ? (
              <>
                <Link
                  to="/battles"
                  className="px-8 py-4 bg-neon-pink text-foreground font-bold text-sm tracking-[0.2em] inline-flex items-center gap-2 hover:scale-105 transition-transform animate-battle-charge"
                >
                  <Swords className="w-4 h-4" /> BATTLE NOW{" "}
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/progress"
                  className="px-7 py-4 border border-border hover:border-neon-purple text-foreground font-bold text-sm tracking-[0.2em] transition-colors"
                >
                  TROPHY ROAD
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/signup"
                  className="px-8 py-4 bg-neon-pink text-foreground font-bold text-sm tracking-[0.2em] inline-flex items-center gap-2 hover:scale-105 transition-transform animate-battle-charge"
                >
                  <Swords className="w-4 h-4" /> CREATE ACCOUNT{" "}
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/login"
                  className="px-7 py-4 border border-border hover:border-neon-purple text-foreground font-bold text-sm tracking-[0.2em] transition-colors"
                >
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
   ROOT EXPORT
   ════════════════════════════════════════════════════════════════════ */

export function LandingShowcase() {
  return (
    <>
      <Hero />
      <LiveTicker />
      <ClassPicker />
      <BattleAnatomy />
      <RankLadder />
      <MasteryEngine />
      <TrophyTease />
      <DailyChallenge />
      <SocialProof />
      <FinalCta />
    </>
  );
}
