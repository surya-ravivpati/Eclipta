/**
 * ArchetypesCompass — scroll-driven cinematic showcase of every Eclipta
 * archetype as if the user is travelling through a symbolic compass wheel.
 *
 * Layout:
 *   * The outer <section> is tall enough to give each archetype ~100vh of
 *     scroll distance, plus an intro and an outro.
 *   * Inside, a position:sticky viewport pins for the whole travel and
 *     hosts three z-layers:
 *       - Background:  drifting starfield, radial colour wash, scanline grid
 *       - Midground:   the large rotating compass wheel + active node halo
 *       - Foreground:  active archetype title, sigil, descriptor, stat tags
 *
 * Animation:
 *   * useScroll() yields scrollYProgress across the section (0 → 1).
 *   * Each archetype owns a window [i/N, (i+1)/N]; titles/glyphs are driven
 *     by useTransform over the archetype's own window for crisp entrances
 *     and exits. The wheel rotates continuously across the full section.
 *   * Per-archetype colours blend smoothly via useTransform on a single
 *     CSS variable, so the background, halo, and active-node accent all
 *     stay in lockstep without an explicit "current index" timer.
 *
 * Accessibility:
 *   * Respects prefers-reduced-motion. When the user has it on, the
 *     compass stops rotating and each archetype renders as a static stack
 *     beneath the wheel.
 */
import { useRef, useMemo } from "react";
import {
  motion, useScroll, useTransform, useReducedMotion, type MotionValue,
} from "framer-motion";
import { ARCHETYPES } from "@/components/battles/archetypes";
import type { ArchetypeId } from "@/components/battles/types";

// Eight archetypes → eight wheel segments. The order is deliberate: it
// reads as a journey from speed → endurance → chaos → mastery → ascension.
const ORDER: ArchetypeId[] = [
  "speedster", "tank", "chud", "gambler", "healer", "fulcrum", "accelerator", "god",
];

// CSS colour per archetype. Mirrors the `color` field in ARCHETYPES but
// resolves to a literal oklch() so we can interpolate it.
const AURA: Record<ArchetypeId, string> = {
  speedster:   "oklch(0.75 0.15 180)",  // cyan
  tank:        "oklch(0.78 0.02 95)",   // silver
  chud:        "oklch(0.62 0.20 25)",   // champion / red
  gambler:     "oklch(0.78 0.16 90)",   // gold
  healer:      "oklch(0.60 0.24 350)",  // pink
  fulcrum:     "oklch(0.55 0.25 290)",  // purple
  accelerator: "oklch(0.80 0.04 250)",  // platinum
  god:         "oklch(0.88 0.18 95)",   // god / sun
};

// Symbol attached to each archetype's sigil panel. Layered with the icon
// from ARCHETYPES so the foreground has two semi-related shapes that drift
// at different speeds — extra depth without any extra art assets.
const SIGIL_GLYPH: Record<ArchetypeId, string> = {
  speedster:   "⟫",
  tank:        "◇",
  chud:        "✶",
  gambler:     "⚄",
  healer:      "✚",
  fulcrum:     "⚖",
  accelerator: "↟",
  god:         "✺",
};

export function ArchetypesCompass() {
  const containerRef = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();

  // Scroll progress across the entire section, 0 at top, 1 at bottom.
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  // Eight archetypes share the scroll range; segIndex is a continuous
  // 0..N float so we can drive smooth blends without snapping.
  const segIndex = useTransform(scrollYProgress, [0, 1], [0, ORDER.length]);

  // Compass rotation: a full revolution across the section so each
  // archetype hits the top at its own scroll window.
  const wheelRotate = useTransform(scrollYProgress, [0, 1], [0, -360]);

  // Colour wash that follows the active archetype. Build the input range
  // as the centre of each archetype's window so transitions glide instead
  // of snapping at boundaries.
  const colourStops = useMemo(() => {
    return ORDER.map((_, i) => (i + 0.5) / ORDER.length);
  }, []);
  const auraColour = useTransform(
    scrollYProgress,
    [0, ...colourStops, 1],
    [AURA[ORDER[0]], ...ORDER.map((id) => AURA[id]), AURA[ORDER[ORDER.length - 1]]],
  );

  return (
    <section
      ref={containerRef}
      className="relative bg-background text-foreground"
      // Eight archetypes × 110vh, plus a 50vh intro and 50vh outro. The
      // 110 (not 100) gives each title room to breathe in/out instead of
      // hot-handing to the next one.
      style={{ height: `${ORDER.length * 110 + 100}vh` }}
    >
      <div className="sticky top-0 h-screen overflow-hidden">
        <BackgroundLayer auraColour={auraColour} reduce={!!reduce} />
        <CompassLayer
          wheelRotate={wheelRotate}
          segIndex={segIndex}
          auraColour={auraColour}
          reduce={!!reduce}
        />
        <ForegroundLayer scrollYProgress={scrollYProgress} reduce={!!reduce} />
        <ScrollHint />
      </div>
    </section>
  );
}

// ─── Background ──────────────────────────────────────────────────────
// Atmospheric gradients, drifting star grid, vignette. The radial
// gradient takes its colour from the active archetype.

function BackgroundLayer({
  auraColour, reduce,
}: { auraColour: MotionValue<string>; reduce: boolean }) {
  const radial = useTransform(
    auraColour,
    (c) => `radial-gradient(60% 60% at 50% 45%, ${c.replace(")", " / 18%)")} 0%, transparent 70%)`,
  );
  return (
    <>
      {/* Base aurora wash */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{ background: radial }}
        aria-hidden
      />
      {/* Star field (fixed grid of dots, slow drift) */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, oklch(1 0 0 / 0.15) 1px, transparent 1.5px)",
          backgroundSize: "40px 40px",
          maskImage: "radial-gradient(circle at 50% 45%, black 0%, transparent 80%)",
        }}
        aria-hidden
      />
      {/* Slow drifting nebula — single layer is plenty; CSS animation, not
          motion, so it doesn't fight the scroll transforms. */}
      {!reduce && (
        <div
          className="absolute inset-0 pointer-events-none opacity-30 animate-arena-drift"
          style={{
            background:
              "conic-gradient(from 0deg at 50% 50%, transparent 0deg, oklch(0.55 0.25 290 / 0.05) 60deg, transparent 120deg, oklch(0.60 0.24 350 / 0.05) 180deg, transparent 240deg, oklch(0.75 0.15 180 / 0.05) 300deg, transparent 360deg)",
          }}
          aria-hidden
        />
      )}
      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, transparent 50%, oklch(0 0 0 / 0.6) 100%)",
        }}
        aria-hidden
      />
    </>
  );
}

// ─── Compass wheel ───────────────────────────────────────────────────
// SVG wheel with one wedge per archetype. Each wedge carries the archetype
// glyph at its outer edge. Rotates continuously with scroll. The active
// archetype's wedge gets a brighter halo so the viewer perceives "this
// segment is illuminated as it passes through the top."

function CompassLayer({
  wheelRotate, segIndex, auraColour, reduce,
}: {
  wheelRotate: MotionValue<number>;
  segIndex:    MotionValue<number>;
  auraColour:  MotionValue<string>;
  reduce: boolean;
}) {
  const N = ORDER.length;
  const wedge = 360 / N;
  // Halo expands with scroll progress, breathing slightly.
  const haloShadow = useTransform(
    auraColour,
    (c) => `0 0 120px 20px ${c.replace(")", " / 0.45)")}, 0 0 240px 60px ${c.replace(")", " / 0.18)")}`,
  );

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      {/* Outer halo behind the wheel */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width:  "min(140vh, 140vw)",
          height: "min(140vh, 140vw)",
          boxShadow: haloShadow,
        }}
        aria-hidden
      />
      <motion.div
        className="relative"
        style={{
          width:  "min(110vh, 110vw)",
          height: "min(110vh, 110vw)",
          rotate: reduce ? 0 : wheelRotate,
        }}
        aria-hidden
      >
        <svg viewBox="-200 -200 400 400" className="w-full h-full">
          <defs>
            <radialGradient id="wheel-fade" cx="50%" cy="50%" r="50%">
              <stop offset="60%" stopColor="oklch(1 0 0 / 0)" />
              <stop offset="100%" stopColor="oklch(1 0 0 / 0.05)" />
            </radialGradient>
          </defs>

          {/* Outer rim */}
          <circle cx="0" cy="0" r="195" fill="none" stroke="oklch(1 0 0 / 0.10)" strokeWidth="0.5" />
          <circle cx="0" cy="0" r="170" fill="none" stroke="oklch(1 0 0 / 0.06)" strokeWidth="0.5" />
          <circle cx="0" cy="0" r="120" fill="none" stroke="oklch(1 0 0 / 0.06)" strokeWidth="0.5" />
          <circle cx="0" cy="0" r="60"  fill="none" stroke="oklch(1 0 0 / 0.10)" strokeWidth="0.5" />
          <circle cx="0" cy="0" r="200" fill="url(#wheel-fade)" />

          {/* Wedge separators + glyph labels */}
          {ORDER.map((id, i) => {
            const angle = -90 + i * wedge; // 12 o'clock = first archetype
            const rad = (angle * Math.PI) / 180;
            // Separator from inner ring to outer rim
            const x1 = Math.cos(rad) * 60;
            const y1 = Math.sin(rad) * 60;
            const x2 = Math.cos(rad) * 195;
            const y2 = Math.sin(rad) * 195;
            // Glyph position halfway between rings
            const gx = Math.cos((rad + (wedge * Math.PI) / 360)) * 145;
            const gy = Math.sin((rad + (wedge * Math.PI) / 360)) * 145;
            return (
              <g key={id}>
                <line x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke="oklch(1 0 0 / 0.08)" strokeWidth="0.5" />
                <CompassGlyph
                  id={id}
                  x={gx}
                  y={gy}
                  i={i}
                  segIndex={segIndex}
                  wheelAngle={angle + wedge / 2}
                  reduce={reduce}
                />
              </g>
            );
          })}

          {/* Centre core */}
          <circle cx="0" cy="0" r="3"  fill="oklch(1 0 0 / 0.6)" />
          <circle cx="0" cy="0" r="14" fill="none" stroke="oklch(1 0 0 / 0.25)" strokeWidth="0.5" />
        </svg>
      </motion.div>

      {/* Compass needle pointing at top, stays vertical regardless of wheel
          rotation so the user feels the wheel is what's moving. */}
      <div className="absolute top-[12%] flex flex-col items-center gap-1" aria-hidden>
        <motion.div
          className="w-px h-10"
          style={{ background: auraColour }}
        />
        <motion.div
          className="w-3 h-3 rotate-45 border-2"
          style={{ borderColor: auraColour }}
        />
      </div>
    </div>
  );
}

// Per-wedge glyph. Counter-rotates the wheel so it always reads upright,
// scales/pulses when its archetype is the active one.
function CompassGlyph({
  id, x, y, i, segIndex, wheelAngle, reduce,
}: {
  id: ArchetypeId;
  x: number; y: number;
  i: number;
  segIndex: MotionValue<number>;
  wheelAngle: number;
  reduce: boolean;
}) {
  // distance of this archetype from the live focus, in archetype-widths.
  // 0 = active, 1 = next neighbour, etc.
  const distance = useTransform(segIndex, (s) => {
    const raw = Math.abs(s - (i + 0.5));
    return Math.min(raw, ORDER.length - raw);
  });
  const scale   = useTransform(distance, [0, 2], [1.5, 0.7]);
  const opacity = useTransform(distance, [0, 1.5, 3], [1, 0.55, 0.25]);

  return (
    <motion.text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="middle"
      style={{
        fill: AURA[id],
        scale: reduce ? 1 : scale,
        opacity: reduce ? 0.8 : opacity,
        transformOrigin: `${x}px ${y}px`,
        // Counter-rotate so the glyph stays upright as the wheel turns.
        transform: `rotate(${-wheelAngle}deg)`,
      }}
      fontSize="18"
      fontWeight="700"
      fontFamily="ui-serif, Georgia, serif"
    >
      {SIGIL_GLYPH[id]}
    </motion.text>
  );
}

// ─── Foreground ──────────────────────────────────────────────────────
// One panel per archetype. Each one fades + lifts + scales over its own
// scroll window so the viewer experiences a sequence of "arrivals."

function ForegroundLayer({
  scrollYProgress, reduce,
}: { scrollYProgress: MotionValue<number>; reduce: boolean }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="relative w-full max-w-3xl mx-auto px-6">
        {ORDER.map((id, i) => (
          <ArchetypePanel
            key={id}
            id={id}
            i={i}
            scrollYProgress={scrollYProgress}
            reduce={reduce}
          />
        ))}
      </div>
      <ProgressTrack scrollYProgress={scrollYProgress} />
    </div>
  );
}

function ArchetypePanel({
  id, i, scrollYProgress, reduce,
}: {
  id: ArchetypeId;
  i: number;
  scrollYProgress: MotionValue<number>;
  reduce: boolean;
}) {
  const N = ORDER.length;
  // Window for this archetype: a hair before and after for graceful ramp.
  const center = (i + 0.5) / N;
  const span   = 0.5 / N;
  const ranges = [center - span * 1.2, center - span * 0.4, center + span * 0.4, center + span * 1.2];

  const opacity = useTransform(scrollYProgress, ranges, [0, 1, 1, 0]);
  const y       = useTransform(scrollYProgress, ranges, [40, 0, 0, -40]);
  const scale   = useTransform(scrollYProgress, ranges, [0.92, 1, 1, 0.92]);
  const blur    = useTransform(scrollYProgress, ranges, [10, 0, 0, 10]);
  const filter  = useTransform(blur, (b) => `blur(${b}px)`);

  const arch = ARCHETYPES[id];
  const Icon = arch.icon;
  const aura = AURA[id];

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center text-center"
      style={{
        opacity: reduce ? 1 : opacity,
        y:       reduce ? 0 : y,
        scale:   reduce ? 1 : scale,
        filter:  reduce ? "none" : filter,
        pointerEvents: "none",
      }}
    >
      {/* Sigil — icon + glyph layered with slight independent drift */}
      <div className="relative w-28 h-28 mb-6">
        <motion.div
          className="absolute inset-0 rounded-full flex items-center justify-center border"
          style={{
            borderColor: aura,
            boxShadow: `0 0 60px 0 ${aura.replace(")", " / 0.5)")}, inset 0 0 30px 0 ${aura.replace(")", " / 0.15)")}`,
            background: `radial-gradient(circle at 50% 50%, ${aura.replace(")", " / 0.10)")}, transparent 70%)`,
          }}
        >
          <Icon className="w-12 h-12" style={{ color: aura }} />
        </motion.div>
        <div
          className="absolute -top-3 -right-3 text-3xl font-serif select-none"
          style={{ color: aura, textShadow: `0 0 20px ${aura}` }}
          aria-hidden
        >
          {SIGIL_GLYPH[id]}
        </div>
      </div>

      {/* Tiny meta label */}
      <p
        className="text-[10px] font-bold tracking-[0.4em] uppercase mb-3"
        style={{ color: aura }}
      >
        {String(i + 1).padStart(2, "0")} · ARCHETYPE
      </p>

      {/* Headline */}
      <h2
        className="font-display font-bold tracking-tight text-5xl md:text-7xl mb-4 leading-[1.05]"
        style={{ textShadow: `0 0 30px ${aura.replace(")", " / 0.4)")}` }}
      >
        {arch.name}
      </h2>

      {/* Descriptor */}
      <p className="text-base md:text-lg text-foreground/80 max-w-xl leading-relaxed mb-6">
        {arch.description}
      </p>

      {/* Stat trio */}
      <div className="flex gap-px bg-border/40 border border-border/40 backdrop-blur-md">
        <StatCell label="HP"  value={arch.statsAreRandom ? "??" : String(arch.maxHp)}            aura={aura} />
        <StatCell label="DMG" value={arch.multiplierScales ? `${arch.baseDamage}↑` : arch.statsAreRandom ? "??" : String(arch.baseDamage)} aura={aura} />
        <StatCell label="MULT" value={arch.statsAreRandom ? "??" : `+${Math.round(arch.multiplierStep * 100)}%`} aura={aura} />
      </div>

      {/* Passive line */}
      <p
        className="mt-5 text-[11px] font-bold tracking-widest uppercase"
        style={{ color: aura }}
      >
        {arch.passive}
      </p>
    </motion.div>
  );
}

function StatCell({ label, value, aura }: { label: string; value: string; aura: string }) {
  return (
    <div className="bg-background/40 px-5 py-3 min-w-[90px]">
      <div className="text-2xl font-display font-bold tabular-nums" style={{ color: aura }}>{value}</div>
      <div className="text-[9px] font-bold tracking-widest text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

// ─── Side rail: a thin vertical track showing how deep into the journey
// the user is, with a tick per archetype.

function ProgressTrack({ scrollYProgress }: { scrollYProgress: MotionValue<number> }) {
  const N = ORDER.length;
  const fillPct = useTransform(scrollYProgress, (p) => `${Math.min(100, Math.max(0, p * 100))}%`);
  return (
    <div className="absolute right-6 top-1/2 -translate-y-1/2 h-[50vh] w-px bg-border/40 pointer-events-none">
      <motion.div
        className="absolute top-0 left-0 w-px bg-foreground/80"
        style={{ height: fillPct }}
      />
      {ORDER.map((id, i) => {
        const aura = AURA[id];
        const top = `${((i + 0.5) / N) * 100}%`;
        return (
          <div
            key={id}
            className="absolute -left-[3px] w-[7px] h-[7px] rounded-full border"
            style={{
              top,
              borderColor: aura,
              transform: "translateY(-50%)",
              boxShadow: `0 0 10px ${aura}`,
            }}
            aria-label={ARCHETYPES[id].name}
          />
        );
      })}
    </div>
  );
}

// ─── Scroll hint at the top of the section ───────────────────────────
function ScrollHint() {
  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-center pointer-events-none">
      <p className="text-[10px] font-bold tracking-[0.4em] text-muted-foreground/70 uppercase mb-2">
        Scroll to travel
      </p>
      <motion.div
        className="w-px h-10 bg-foreground/30 mx-auto"
        animate={{ scaleY: [0.3, 1, 0.3] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
