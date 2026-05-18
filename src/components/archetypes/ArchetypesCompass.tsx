/**
 * ArchetypesCompass — scroll-driven cinematic showcase of every Eclipta
 * archetype as if the user is travelling through a symbolic compass wheel.
 *
 * Layout:
 *   * The outer <section> is tall enough to give each archetype its own
 *     scroll window. Inside, a position:sticky viewport pins for the whole
 *     travel and hosts three z-layers:
 *       - Background:  drifting star grid + radial colour wash + vignette
 *       - Midground:   the large rotating compass wheel + active node halo
 *       - Foreground:  active archetype title, sigil, descriptor, stat tags
 *
 * Animation:
 *   * useScroll() yields scrollYProgress across the section (0 → 1).
 *   * Each archetype owns a window [i/N, (i+1)/N]; titles/glyphs are driven
 *     by useTransform over the archetype's own window for crisp entrances.
 *   * Colours step (not interpolate) between archetypes so we never feed
 *     framer-motion an oklch() string array — it can only interpolate
 *     rgb/hex/hsl, and the previous version threw at mount because of it.
 *
 * Accessibility:
 *   * Respects prefers-reduced-motion. When set, the compass holds still
 *     and every archetype panel renders fully visible.
 */
import { useRef, useMemo } from "react";
import {
  motion, useScroll, useTransform, useReducedMotion, type MotionValue,
} from "framer-motion";
import { ARCHETYPES } from "@/components/battles/archetypes";
import type { ArchetypeId } from "@/components/battles/types";

const ORDER: ArchetypeId[] = [
  "speedster", "tank", "chud", "gambler", "healer", "fulcrum", "accelerator", "god",
];

// Section layout in viewport heights. The total section becomes
//   (N + 2) * SLOT_VH
// where one extra SLOT_VH sits at the top as an intro buffer and one at
// the bottom as an outro buffer. Everything maps cleanly inside [0, 1]
// of scrollYProgress, so no out-of-range stop ever needs to be clamped
// (which was breaking pacing for the first/last archetypes).
const SLOT_VH = 70;

// Window for archetype i, expressed in scroll progress (0..1).
// Each archetype's slot is 1/(N+2) wide and is centred at
//   center = (i + 1.5) / (N + 2)
// The fade-in / fade-out half-width is tuned so neighbouring archetypes
// crossfade through each other instead of momentarily showing nothing.
function archetypeRanges(i: number): [number, number, number, number] {
  const total = ORDER.length + 2;
  const center = (i + 1.5) / total;
  const half   = 1   / total;        // 0.10 when N=8
  const fade   = half * 0.7;         // 0.07 — wide enough for crossfade
  return [
    center - fade,
    center - half * 0.3,
    center + half * 0.3,
    center + fade,
  ];
}

// Per-archetype aura colour. Kept as rgba hex so framer-motion can use
// them safely in style props (no oklch interpolation gotchas) and the
// shadow / glow math works in older browsers.
const AURA: Record<ArchetypeId, string> = {
  speedster:   "#5dd9ff",  // cyan
  tank:        "#c8c8c8",  // silver
  chud:        "#ff5566",  // champion red
  gambler:     "#f5c542",  // gold
  healer:      "#ff5fa1",  // pink
  fulcrum:     "#a64dff",  // purple
  accelerator: "#9fb0c8",  // platinum
  god:         "#ffd86b",  // god / sun
};

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
  const containerRef = useRef<HTMLElement | null>(null);
  const reduce = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  const N = ORDER.length;

  // Active archetype = the one whose centre we're closest to. We map
  // scrollYProgress through the "active band" (0.1..0.9 — the part of the
  // section that holds archetypes, sandwiched between the intro and outro
  // buffers) so the user dwells on each archetype evenly.
  const activeIndex = useTransform(scrollYProgress, (p) => {
    const t = Math.max(0, Math.min(1, (p - 1 / (N + 2)) / (N / (N + 2))));
    return Math.max(0, Math.min(N - 1, Math.floor(t * N)));
  });
  const auraColour = useTransform(activeIndex, (i) => AURA[ORDER[i]]);

  // Wheel rotates continuously across the active band so each archetype's
  // wedge lands at the top during its own dwell window.
  const wheelRotate = useTransform(
    scrollYProgress,
    [1 / (N + 2), (N + 1) / (N + 2)],
    [0, -360],
  );

  // Floating 0..N progression aligned to the active band for glyph scale.
  const segIndex = useTransform(
    scrollYProgress,
    [1 / (N + 2), (N + 1) / (N + 2)],
    [0, N],
  );

  return (
    <section
      ref={containerRef}
      className="relative bg-background text-foreground"
      style={{ height: `${(N + 2) * SLOT_VH}vh` }}
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
        <ProgressTrack scrollYProgress={scrollYProgress} />
      </div>
    </section>
  );
}

// ─── Background ──────────────────────────────────────────────────────

function BackgroundLayer({
  auraColour, reduce,
}: { auraColour: MotionValue<string>; reduce: boolean }) {
  // String-to-string transform via callback is safe — no array
  // interpolation across colour spaces.
  const radial = useTransform(
    auraColour,
    (c) => `radial-gradient(60% 60% at 50% 45%, ${withAlpha(c, 0.18)} 0%, transparent 70%)`,
  );
  return (
    <>
      <motion.div
        className="absolute inset-0 pointer-events-none transition-[background] duration-700 ease-out"
        style={{ background: radial }}
        aria-hidden
      />
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 1.5px)",
          backgroundSize: "40px 40px",
          maskImage: "radial-gradient(circle at 50% 45%, black 0%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(circle at 50% 45%, black 0%, transparent 80%)",
        }}
        aria-hidden
      />
      {!reduce && (
        <div
          className="absolute inset-0 pointer-events-none opacity-30 animate-arena-drift"
          style={{
            background:
              "conic-gradient(from 0deg at 50% 50%, transparent 0deg, rgba(166,77,255,0.06) 60deg, transparent 120deg, rgba(255,95,161,0.06) 180deg, transparent 240deg, rgba(93,217,255,0.06) 300deg, transparent 360deg)",
          }}
          aria-hidden
        />
      )}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, transparent 50%, rgba(0,0,0,0.6) 100%)",
        }}
        aria-hidden
      />
    </>
  );
}

// ─── Compass wheel ───────────────────────────────────────────────────
//
// Wheel rings + wedge separators live inside SVG. Glyphs that sit on the
// wedges are HTML overlays (absolutely positioned) instead of SVG <text>
// nodes — way fewer cross-browser transform gotchas.

function CompassLayer({
  wheelRotate, segIndex, auraColour, reduce,
}: {
  wheelRotate: MotionValue<number>;
  segIndex:    MotionValue<number>;
  auraColour:  MotionValue<string>;
  reduce:      boolean;
}) {
  const N = ORDER.length;
  const wedge = 360 / N;
  const haloShadow = useTransform(
    auraColour,
    (c) => `0 0 120px 20px ${withAlpha(c, 0.45)}, 0 0 240px 60px ${withAlpha(c, 0.18)}`,
  );
  const needleColour = useTransform(auraColour, (c) => c);

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <motion.div
        className="absolute rounded-full transition-[box-shadow] duration-700 ease-out"
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
        <svg viewBox="-200 -200 400 400" className="w-full h-full absolute inset-0">
          <defs>
            <radialGradient id="wheel-fade" cx="50%" cy="50%" r="50%">
              <stop offset="60%" stopColor="rgba(255,255,255,0)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.05)" />
            </radialGradient>
          </defs>
          <circle cx="0" cy="0" r="195" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="0.5" />
          <circle cx="0" cy="0" r="170" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
          <circle cx="0" cy="0" r="120" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
          <circle cx="0" cy="0" r="60"  fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="0.5" />
          <circle cx="0" cy="0" r="200" fill="url(#wheel-fade)" />
          {ORDER.map((_, i) => {
            const angle = -90 + i * wedge;
            const rad = (angle * Math.PI) / 180;
            const x1 = Math.cos(rad) * 60;
            const y1 = Math.sin(rad) * 60;
            const x2 = Math.cos(rad) * 195;
            const y2 = Math.sin(rad) * 195;
            return (
              <line
                key={i}
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="0.5"
              />
            );
          })}
          <circle cx="0" cy="0" r="3"  fill="rgba(255,255,255,0.6)" />
          <circle cx="0" cy="0" r="14" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.5" />
        </svg>

        {/* HTML glyph overlay — one per wedge, positioned at the wedge's
            mid-angle on a ring 145 units out. Counter-rotates the wheel
            so glyphs stay upright. */}
        {ORDER.map((id, i) => {
          const angle = -90 + i * wedge + wedge / 2;
          const rad = (angle * Math.PI) / 180;
          // Wheel viewBox is 400x400 centred on 0. The rendered size is
          // min(110vh,110vw); 145 of those 400 viewBox units → 36.25%.
          const radiusPct = (145 / 400) * 100;
          const x = 50 + Math.cos(rad) * radiusPct;
          const y = 50 + Math.sin(rad) * radiusPct;
          return (
            <CompassGlyph
              key={id}
              id={id}
              xPct={x} yPct={y}
              i={i}
              segIndex={segIndex}
              wheelAngle={angle + 90} // 0 when at 12 o'clock
              reduce={reduce}
            />
          );
        })}
      </motion.div>

      {/* Static needle pointing at 12 o'clock so the wheel feels like
          what's actually moving. */}
      <div className="absolute top-[12%] flex flex-col items-center gap-1" aria-hidden>
        <motion.div
          className="w-px h-10"
          style={{ background: needleColour }}
        />
        <motion.div
          className="w-3 h-3 rotate-45 border-2"
          style={{ borderColor: needleColour }}
        />
      </div>
    </div>
  );
}

function CompassGlyph({
  id, xPct, yPct, i, segIndex, wheelAngle, reduce,
}: {
  id: ArchetypeId;
  xPct: number; yPct: number;
  i: number;
  segIndex: MotionValue<number>;
  wheelAngle: number;
  reduce: boolean;
}) {
  const N = ORDER.length;
  // Shortest-path distance from this archetype to the live focus.
  const distance = useTransform(segIndex, (s) => {
    const raw = Math.abs(s - (i + 0.5));
    return Math.min(raw, N - raw);
  });
  const scale   = useTransform(distance, [0, 2], [1.6, 0.7]);
  const opacity = useTransform(distance, [0, 1.5, 3], [1, 0.55, 0.25]);

  return (
    <motion.div
      className="absolute font-serif font-bold pointer-events-none select-none"
      style={{
        left: `${xPct}%`,
        top:  `${yPct}%`,
        // Counter-rotate to keep upright while the wheel turns.
        transform: `translate(-50%, -50%) rotate(${-wheelAngle}deg)`,
        color: AURA[id],
        textShadow: `0 0 14px ${AURA[id]}`,
        fontSize: "clamp(1rem, 2.4vw, 1.6rem)",
        scale:    reduce ? 1   : scale,
        opacity:  reduce ? 0.8 : opacity,
      }}
    >
      {SIGIL_GLYPH[id]}
    </motion.div>
  );
}

// ─── Foreground ──────────────────────────────────────────────────────

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
  // Per-archetype windows live entirely inside the [0.1, 0.9] active band
  // by construction (see archetypeRanges), so we never need to clamp here.
  // That fixes the original first/last archetype pacing bug where the
  // clamped windows for i=0 and i=N-1 collapsed their fade-in / fade-out
  // intervals, making speedster invisible at the top of the section and
  // god never reaching full opacity.
  const ranges = useMemo(() => archetypeRanges(i), [i]);

  const opacity = useTransform(scrollYProgress, ranges, [0, 1, 1, 0]);
  const y       = useTransform(scrollYProgress, ranges, [40, 0, 0, -40]);
  const scale   = useTransform(scrollYProgress, ranges, [0.92, 1, 1, 0.92]);

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
        pointerEvents: "none",
      }}
    >
      <div className="relative w-28 h-28 mb-6">
        <div
          className="absolute inset-0 rounded-full flex items-center justify-center border"
          style={{
            borderColor: aura,
            boxShadow: `0 0 60px 0 ${withAlpha(aura, 0.5)}, inset 0 0 30px 0 ${withAlpha(aura, 0.15)}`,
            background: `radial-gradient(circle at 50% 50%, ${withAlpha(aura, 0.10)}, transparent 70%)`,
          }}
        >
          <Icon className="w-12 h-12" style={{ color: aura }} />
        </div>
        <div
          className="absolute -top-3 -right-3 text-3xl font-serif select-none"
          style={{ color: aura, textShadow: `0 0 20px ${aura}` }}
          aria-hidden
        >
          {SIGIL_GLYPH[id]}
        </div>
      </div>

      <p
        className="text-[10px] font-bold tracking-[0.4em] uppercase mb-3"
        style={{ color: aura }}
      >
        {String(i + 1).padStart(2, "0")} · ARCHETYPE
      </p>

      <h2
        className="font-display font-bold tracking-tight text-5xl md:text-7xl mb-4 leading-[1.05]"
        style={{ textShadow: `0 0 30px ${withAlpha(aura, 0.4)}` }}
      >
        {arch.name}
      </h2>

      <p className="text-base md:text-lg text-foreground/80 max-w-xl leading-relaxed mb-6">
        {arch.description}
      </p>

      <div className="flex gap-px bg-border/40 border border-border/40 backdrop-blur-md">
        <StatCell label="HP"   value={arch.statsAreRandom ? "??" : String(arch.maxHp)} aura={aura} />
        <StatCell
          label="DMG"
          value={arch.multiplierScales ? `${arch.baseDamage}↑` : arch.statsAreRandom ? "??" : String(arch.baseDamage)}
          aura={aura}
        />
        <StatCell
          label="MULT"
          value={arch.statsAreRandom ? "??" : `+${Math.round(arch.multiplierStep * 100)}%`}
          aura={aura}
        />
      </div>

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

// ─── Helpers ─────────────────────────────────────────────────────────

/** Add an alpha channel to a 6-digit hex colour. Safe to call repeatedly. */
function withAlpha(hex: string, alpha: number): string {
  // Accept "#rrggbb"; anything else → return as-is (already alpha or named).
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
