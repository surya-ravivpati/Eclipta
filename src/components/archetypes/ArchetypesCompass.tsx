/**
 * ArchetypesCompass — scroll-driven cinematic showcase of every Eclipta
 * archetype. The user travels a rotating compass; the needle locks onto
 * each archetype in turn while a panel cross-fades its identity.
 *
 * Layout (three pinned z-layers inside a tall sticky section):
 *   - Background:  volumetric aura wash in the active colour + slow sweep
 *   - Midground:   rotating wheel of archetype icons + a fixed lock-on arc
 *   - Foreground:  active archetype panel (name, blurb, stats)
 *
 * Motion plumbing (kept from the battle-tested version — do not "simplify"):
 *   * useScroll() → scrollYProgress (0→1) across the section.
 *   * activeIndex is discrete; wheel rotation springs toward it so wheel
 *     position and panel text are always driven by the SAME event and can
 *     never drift out of phase (a real bug we hit when they read scroll
 *     through different mechanisms).
 *   * Colours STEP between archetypes via callback transforms — never fed
 *     to framer-motion as an array, which can't interpolate oklch().
 *   * prefers-reduced-motion holds the wheel still and shows panels plainly.
 */
import { useRef, useState, useEffect } from "react";
import {
  motion, AnimatePresence, useScroll, useTransform, useSpring,
  useReducedMotion, useMotionValueEvent, type MotionValue,
} from "framer-motion";
import { ARCHETYPES } from "@/components/battles/archetypes";
import type { ArchetypeId } from "@/components/battles/types";

const ORDER: ArchetypeId[] = [
  "speedster", "tank", "chud", "gambler", "healer", "fulcrum", "accelerator", "god",
];

// Scroll budget per archetype, in viewport heights. Section height is
// (N + 2) * SLOT_VH — one buffer slot at each end so the first/last
// archetype still gets a full dwell inside [0,1] of scrollYProgress.
const SLOT_VH = 40;

// Film fonts (loaded globally from the <head> in __root.tsx).
const F_DISPLAY = "'Helvetica Neue', Helvetica, Arial, system-ui, sans-serif";
const F_SERIF   = "'Instrument Serif', 'Times New Roman', serif";
const F_MONO    = "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace";

// Per-archetype identity colour. Hex (not oklch) so framer-motion can use
// them in style props and withAlpha() math works everywhere.
const AURA: Record<ArchetypeId, string> = {
  speedster:   "#5dd9ff",
  tank:        "#cbd2dd",
  chud:        "#ff5d6c",
  gambler:     "#f5c542",
  healer:      "#ff5fa1",
  fulcrum:     "#8a6bff",
  accelerator: "#9fc4e8",
  god:         "#ffd86b",
};

// One-word serif label per archetype — the "role" beneath the name.
const ROLE: Record<ArchetypeId, string> = {
  speedster:   "Tempo",
  tank:        "Bulwark",
  chud:        "Glass cannon",
  gambler:     "Chaos",
  healer:      "Sustain",
  fulcrum:     "Balance",
  accelerator: "Momentum",
  god:         "Apex",
};

/* Wheel geometry — viewBox is 400×400 centred on origin.
   Nodes orbit near the outer ring (R_NODE high) so they hug the edge of
   the wheel and leave a clear "stage" in the middle for the panel text. */
const VIEW = 400;
const R_OUTER  = 190;
const R_TICK_IN = 178;
const R_NODE   = 162; // icon-node ring — pushed out so icons never sit on the text

export function ArchetypesCompass() {
  const containerRef = useRef<HTMLElement | null>(null);
  const reduce = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  const N = ORDER.length;
  const wedge = 360 / N;

  // Active archetype = whichever sits in the "active band" (between the
  // intro/outro buffer slots), so dwell time is even across all eight.
  const activeIndex = useTransform(scrollYProgress, (p) => {
    const t = Math.max(0, Math.min(1, (p - 1 / (N + 2)) / (N / (N + 2))));
    return Math.max(0, Math.min(N - 1, Math.floor(t * N)));
  });
  const auraColour = useTransform(activeIndex, (i) => AURA[ORDER[i]]);

  // Wheel rotates so the active wedge sits under the (fixed, top) needle.
  // Springing the discrete target keeps wheel + text in lockstep.
  const wheelTarget = useTransform(activeIndex, (i) => -(i + 0.5) * wedge);
  const wheelRotate = useSpring(wheelTarget, { stiffness: 110, damping: 22, mass: 0.7 });

  // Continuous segIndex drives per-icon scale/opacity falloff (eases, not snaps).
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
        <ForegroundLayer activeIndex={activeIndex} reduce={!!reduce} />
        <ProgressRail activeIndex={activeIndex} reduce={!!reduce} />
      </div>
    </section>
  );
}

/* ─── Background ─────────────────────────────────────────────────────── */

function BackgroundLayer({
  auraColour, reduce,
}: { auraColour: MotionValue<string>; reduce: boolean }) {
  const wash = useTransform(
    auraColour,
    (c) => `radial-gradient(58% 56% at 50% 46%, ${withAlpha(c, 0.16)} 0%, transparent 68%)`,
  );
  const sweepTint = useTransform(
    auraColour,
    (c) => `conic-gradient(from 0deg at 50% 46%, transparent 0deg, ${withAlpha(c, 0.07)} 38deg, transparent 110deg, transparent 360deg)`,
  );
  return (
    <>
      {/* Aura wash in the active colour */}
      <motion.div
        className="absolute inset-0 pointer-events-none transition-[background] duration-700 ease-out"
        style={{ background: wash }}
        aria-hidden
      />
      {/* Fine dot field — faint, masked to the outer ring so the centre
          stage stays clean behind the panel text */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.12]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(180,205,255,0.16) 1px, transparent 1.5px)",
          backgroundSize: "52px 52px",
          maskImage: "radial-gradient(circle at 50% 46%, transparent 24%, black 60%, transparent 82%)",
          WebkitMaskImage: "radial-gradient(circle at 50% 46%, transparent 24%, black 60%, transparent 82%)",
        }}
        aria-hidden
      />
      {/* Slow volumetric light sweep — one beam, recoloured to the active aura */}
      {!reduce && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{ background: sweepTint }}
          animate={{ rotate: 360 }}
          transition={{ duration: 48, repeat: Infinity, ease: "linear" }}
          aria-hidden
        />
      )}
      {/* Edge vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(circle at 50% 50%, transparent 48%, rgba(4,5,10,0.72) 100%)" }}
        aria-hidden
      />
    </>
  );
}

/* ─── Compass wheel ──────────────────────────────────────────────────── */

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
    (c) => `0 0 140px 24px ${withAlpha(c, 0.32)}, 0 0 300px 80px ${withAlpha(c, 0.12)}`,
  );

  // Fixed lock-on arc spanning the top wedge (centred on -90°).
  const a0 = (-90 - wedge / 2) * Math.PI / 180;
  const a1 = (-90 + wedge / 2) * Math.PI / 180;
  const arcPath =
    `M ${(Math.cos(a0) * R_OUTER).toFixed(2)} ${(Math.sin(a0) * R_OUTER).toFixed(2)} ` +
    `A ${R_OUTER} ${R_OUTER} 0 0 1 ${(Math.cos(a1) * R_OUTER).toFixed(2)} ${(Math.sin(a1) * R_OUTER).toFixed(2)}`;

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      {/* Breathing halo */}
      <motion.div
        className="absolute rounded-full transition-[box-shadow] duration-700 ease-out"
        style={{ width: "min(132vh, 132vw)", height: "min(132vh, 132vw)", boxShadow: haloShadow }}
        animate={reduce ? undefined : { scale: [1, 1.04, 1] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      />

      {/* Rotating wheel */}
      <motion.div
        className="relative"
        style={{
          width: "min(112vh, 112vw)",
          height: "min(112vh, 112vw)",
          rotate: reduce ? 0 : wheelRotate,
        }}
        aria-hidden
      >
        <svg viewBox={`${-VIEW / 2} ${-VIEW / 2} ${VIEW} ${VIEW}`} className="w-full h-full absolute inset-0">
          {/* One clean outer ring */}
          <circle cx="0" cy="0" r={R_OUTER} fill="none" stroke="rgba(210,225,255,0.12)" strokeWidth="0.6" />

          {/* Boundary ticks (between wedges) — the only marks on the ring */}
          {ORDER.map((_, i) => {
            const ang = (-90 + i * wedge - wedge / 2) * Math.PI / 180;
            return (
              <line
                key={`tick-${i}`}
                x1={(Math.cos(ang) * R_TICK_IN).toFixed(2)} y1={(Math.sin(ang) * R_TICK_IN).toFixed(2)}
                x2={(Math.cos(ang) * R_OUTER).toFixed(2)}   y2={(Math.sin(ang) * R_OUTER).toFixed(2)}
                stroke="rgba(210,225,255,0.14)" strokeWidth="0.6"
              />
            );
          })}
        </svg>

        {/* Icon nodes — HTML overlay, counter-rotated to stay upright */}
        {ORDER.map((id, i) => {
          const ang = (-90 + i * wedge + wedge / 2) * Math.PI / 180;
          const radiusPct = (R_NODE / VIEW) * 100;
          const x = 50 + Math.cos(ang) * radiusPct;
          const y = 50 + Math.sin(ang) * radiusPct;
          return (
            <CompassNode
              key={id}
              id={id}
              xPct={x} yPct={y}
              i={i}
              segIndex={segIndex}
              wheelAngle={-90 + i * wedge + wedge / 2 + 90}
              reduce={reduce}
            />
          );
        })}
      </motion.div>

      {/* Fixed lock-on overlay (does NOT rotate) — frames whichever node is
          currently at the top, recolouring smoothly via CSS transition. */}
      <div className="absolute" style={{ width: "min(112vh, 112vw)", height: "min(112vh, 112vw)" }} aria-hidden>
        <svg viewBox={`${-VIEW / 2} ${-VIEW / 2} ${VIEW} ${VIEW}`} className="w-full h-full">
          {/* Glowing arc on the active wedge */}
          <motion.path
            d={arcPath}
            fill="none"
            strokeWidth="2.4"
            strokeLinecap="round"
            style={{ stroke: auraColour, transition: "stroke 0.6s ease", filter: "drop-shadow(0 0 6px currentColor)" }}
          />
          {/* Needle marker just inside the outer ring */}
          <motion.path
            d={`M -7 ${-R_OUTER + 4} L 0 ${-R_OUTER + 16} L 7 ${-R_OUTER + 4}`}
            fill="none" strokeWidth="1.6" strokeLinejoin="round"
            style={{ stroke: auraColour, transition: "stroke 0.6s ease" }}
          />
        </svg>
      </div>
    </div>
  );
}

function CompassNode({
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
  const Icon = ARCHETYPES[id].icon;
  const aura = AURA[id];

  // Shortest-path distance from this node to the live focus. Distant nodes
  // fade almost entirely, so the ring reads as ~3 icons near the needle
  // (active + neighbours) rather than eight competing glyphs.
  const distance = useTransform(segIndex, (s) => {
    const raw = Math.abs(s - (i + 0.5));
    return Math.min(raw, N - raw);
  });
  const scale   = useTransform(distance, [0, 0.5, 1.6], [1.3, 0.95, 0.62]);
  const opacity = useTransform(distance, [0, 0.6, 1.5, 3], [1, 0.55, 0.1, 0]);
  const glow    = useTransform(distance, [0, 0.5], [1, 0]);
  const ring    = useTransform(glow, (g) => withAlpha(aura, 0.2 + g * 0.65));
  const shadow  = useTransform(glow, (g) =>
    g > 0.05 ? `0 0 ${(8 + g * 26).toFixed(0)}px ${withAlpha(aura, 0.18 + g * 0.5)}` : "none");
  const bg      = useTransform(glow, (g) => withAlpha(aura, 0.04 + g * 0.18));

  return (
    <motion.div
      className="absolute pointer-events-none select-none"
      style={{
        left: `${xPct}%`,
        top: `${yPct}%`,
        transform: `translate(-50%, -50%) rotate(${-wheelAngle}deg)`,
        scale: reduce ? 1 : scale,
        opacity: reduce ? 0.85 : opacity,
      }}
    >
      <motion.div
        className="flex items-center justify-center rounded-full border"
        style={{
          width: "clamp(34px, 4vw, 50px)",
          height: "clamp(34px, 4vw, 50px)",
          borderColor: reduce ? withAlpha(aura, 0.5) : ring,
          background: reduce ? withAlpha(aura, 0.1) : bg,
          boxShadow: reduce ? "none" : shadow,
          color: aura,
          backdropFilter: "blur(2px)",
        }}
      >
        <Icon style={{ width: "42%", height: "42%" }} />
      </motion.div>
    </motion.div>
  );
}

/* ─── Foreground panel ───────────────────────────────────────────────── */

function ForegroundLayer({
  activeIndex, reduce,
}: { activeIndex: MotionValue<number>; reduce: boolean }) {
  const [active, setActive] = useState(0);
  useMotionValueEvent(activeIndex, "change", (i) => setActive(Math.round(i)));
  useEffect(() => { setActive(Math.round(activeIndex.get())); }, [activeIndex]);

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="relative w-full max-w-3xl mx-auto px-6 h-[62vh]">
        <AnimatePresence mode="wait" initial={false}>
          <ArchetypePanel key={ORDER[active]} id={ORDER[active]} i={active} reduce={reduce} />
        </AnimatePresence>
      </div>
    </div>
  );
}

function ArchetypePanel({
  id, i, reduce,
}: { id: ArchetypeId; i: number; reduce: boolean }) {
  const arch = ARCHETYPES[id];
  const aura = AURA[id];
  // Names read "The Speedster" — render the article as a quiet serif kicker
  // and the noun as the headline.
  const parts = arch.name.split(" ");
  const lead = parts.length > 1 ? parts[0] : "";
  const noun = parts.length > 1 ? parts.slice(1).join(" ") : arch.name;

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center text-center"
      initial={reduce ? false : { opacity: 0, y: 20 }}
      animate={reduce ? undefined : { opacity: 1, y: 0 }}
      exit={reduce ? undefined : { opacity: 0, y: -20 }}
      transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }}
      style={{ pointerEvents: "none" }}
    >
      {/* Eyebrow */}
      <p
        className="mb-5 inline-flex items-center gap-3"
        style={{ fontFamily: F_MONO, fontSize: 11, letterSpacing: "0.34em", textTransform: "uppercase", color: aura }}
      >
        <span style={{ width: 22, height: 1, background: "currentColor", opacity: 0.7 }} />
        {String(i + 1).padStart(2, "0")} / 08 · {ROLE[id]}
      </p>

      {/* Name */}
      <h2 className="mb-5 leading-[0.9]">
        {lead && (
          <span
            className="block mb-1"
            style={{ fontFamily: F_SERIF, fontStyle: "italic", fontSize: "clamp(19px, 2.2vw, 28px)", color: "#b9bfcc", opacity: 0.85 }}
          >
            {lead}
          </span>
        )}
        <span
          className="block"
          style={{
            fontFamily: F_DISPLAY, fontWeight: 200,
            fontSize: "clamp(44px, 6vw, 88px)", letterSpacing: "-0.03em",
            textShadow: `0 0 48px ${withAlpha(aura, 0.4)}`,
          }}
        >
          {noun}
        </span>
      </h2>

      {/* Blurb — narrow so it never reaches the node ring */}
      <p
        className="max-w-md mb-8"
        style={{ fontSize: "clamp(14px, 1.4vw, 16.5px)", lineHeight: 1.6, color: "#c8cdd8", fontWeight: 300 }}
      >
        {arch.description}
      </p>

      {/* Stats */}
      <div className="flex items-stretch gap-3">
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
    </motion.div>
  );
}

function StatCell({ label, value, aura }: { label: string; value: string; aura: string }) {
  return (
    <div
      className="px-6 py-3.5 rounded-xl border backdrop-blur-md min-w-[92px]"
      style={{ borderColor: withAlpha(aura, 0.22), background: withAlpha(aura, 0.05) }}
    >
      <div
        className="tabular-nums"
        style={{ fontFamily: F_DISPLAY, fontWeight: 200, fontSize: 26, letterSpacing: "-0.01em", color: aura }}
      >
        {value}
      </div>
      <div
        className="mt-1"
        style={{ fontFamily: F_MONO, fontSize: 9, letterSpacing: "0.26em", textTransform: "uppercase", color: "#767b87" }}
      >
        {label}
      </div>
    </div>
  );
}

/* ─── Progress rail ──────────────────────────────────────────────────── */

function ProgressRail({
  activeIndex, reduce,
}: { activeIndex: MotionValue<number>; reduce: boolean }) {
  const [active, setActive] = useState(0);
  useMotionValueEvent(activeIndex, "change", (i) => setActive(Math.round(i)));
  useEffect(() => { setActive(Math.round(activeIndex.get())); }, [activeIndex]);
  const N = ORDER.length;

  return (
    <div className="absolute right-7 top-1/2 -translate-y-1/2 flex flex-col items-center gap-3 pointer-events-none" aria-hidden>
      {ORDER.map((id, i) => {
        const on = i === active;
        const done = i < active;
        const aura = AURA[id];
        return (
          <motion.div
            key={id}
            className="rounded-full"
            style={{
              width: on ? 8 : 6,
              height: on ? 8 : 6,
              background: on ? aura : done ? withAlpha(aura, 0.6) : "rgba(255,255,255,0.18)",
              boxShadow: on ? `0 0 12px ${aura}` : "none",
            }}
            animate={reduce || !on ? undefined : { scale: [1, 1.35, 1] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          />
        );
      })}
    </div>
  );
}

/* ─── Helpers ────────────────────────────────────────────────────────── */

/** Add an alpha channel to a 6-digit hex colour. Safe to call repeatedly. */
function withAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
