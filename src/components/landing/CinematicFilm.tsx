import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { ArchetypesCompass } from "@/components/archetypes/ArchetypesCompass";
import "./CinematicFilm.css";

/**
 * CinematicFilm — the homepage as a directed, scroll-driven film.
 *
 * Narrative arc:
 *   Act I   — Curiosity.      A film-title reveal in deep space; the camera
 *                             pushes through the title into a portal of light.
 *   Act II  — Discovery.      One ring of light morphs through three chapters
 *                             (match timer → combo streak → Luna's crescent),
 *                             then the archetype compass tour.
 *   Act III — Transformation. The ascent: the environment turns from deep
 *                             blue to gold as tiers climb Bronze → God,
 *                             ending on a freeze-frame.
 *   Act IV  — Resolution.     Calm. One statement, one call to action.
 *
 * Engine: a single rAF loop lerps scrollY and mouse position, then drives
 * every scene through transform / opacity / filter and a handful of SVG
 * attributes — no layout work per frame, fully compositor-friendly.
 * prefers-reduced-motion collapses the film into a static gallery.
 */

/* ─── math helpers ──────────────────────────────────────────────── */
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);
/** Windowed visibility: fades in over [a, a+f], holds, fades out over [b-f, b]. */
const win = (p: number, a: number, b: number, f = 0.08) => {
  if (p <= a || p >= b) return 0;
  return Math.min(clamp01((p - a) / f), clamp01((b - p) / f));
};

/* ─── scene data ────────────────────────────────────────────────── */
const STARS = Array.from({ length: 26 }, (_, i) => ({
  x: 4 + ((i * 167 + 23) % 92),
  y: 4 + ((i * 113 + 41) % 92),
  s: 1 + (i % 3) * 0.7,
  o: 0.14 + (i % 5) * 0.07,
  d: 5 + (i % 7) * 1.3,
  depth: 0.4 + (i % 3) * 0.45, // parallax multiplier
}));

const TIERS = [
  { name: "Bronze",   c: "#c08a55" },
  { name: "Silver",   c: "#c2c7d1" },
  { name: "Gold",     c: "#ecc45c" },
  { name: "Platinum", c: "#9adcd2" },
  { name: "Diamond",  c: "#74b8ff" },
  { name: "Champion", c: "#ff6a5e" },
  { name: "Unreal",   c: "#c77dff" },
  { name: "God",      c: "#ffe9a8" },
] as const;

/* Ring geometry (viewBox 0 0 480 480) */
const RC = 240;
const RING_R = 200;
const RING_C = 2 * Math.PI * RING_R;
const TICKS = Array.from({ length: 72 }, (_, i) => {
  const a = (i / 72) * Math.PI * 2;
  const major = i % 18 === 0;
  const r1 = major ? 208 : 212;
  return {
    x1: RC + Math.cos(a) * r1,  y1: RC + Math.sin(a) * r1,
    x2: RC + Math.cos(a) * 218, y2: RC + Math.sin(a) * 218,
    major,
  };
});
/** SVG arc path along radius r from angle a0 to a1 (radians). */
function arcPath(r: number, a0: number, a1: number): string {
  const x0 = RC + Math.cos(a0) * r, y0 = RC + Math.sin(a0) * r;
  const x1 = RC + Math.cos(a1) * r, y1 = RC + Math.sin(a1) * r;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
const COMBO_ARCS = [0, 1, 2].map(i => {
  const start = -Math.PI / 2 + i * ((Math.PI * 2) / 3) + 0.18;
  return arcPath(178, start, start + (Math.PI * 2) / 3 - 0.36);
});

/* ─── component ─────────────────────────────────────────────────── */
export function CinematicFilm() {
  const { isAuthenticated } = useAuth();
  const ctaTo = isAuthenticated ? "/battles" : "/signup";
  const ctaLabel = isAuthenticated ? "Battle now" : "Enter free";

  const [staticMode, setStaticMode] = useState(false);
  const [activeTier, setActiveTier] = useState(0);
  const activeTierRef = useRef(0);

  /* DOM refs — everything the camera touches */
  const auroraRef    = useRef<HTMLDivElement>(null);
  const flashRef     = useRef<HTMLDivElement>(null);

  const s1Ref        = useRef<HTMLElement>(null);
  const starsRef     = useRef<HTMLDivElement>(null);
  const coreRef      = useRef<HTMLDivElement>(null);
  const titleRef     = useRef<HTMLDivElement>(null);
  const stepRefs     = useRef<(HTMLParagraphElement | null)[]>([]);
  const hintRef      = useRef<HTMLDivElement>(null);

  const s2Ref        = useRef<HTMLElement>(null);
  const ringWrapRef  = useRef<HTMLDivElement>(null);
  const ringSpinRef  = useRef<SVGGElement>(null);
  const ringRef      = useRef<SVGCircleElement>(null);
  const arcRefs      = useRef<(SVGPathElement | null)[]>([]);
  const moonRef      = useRef<SVGCircleElement>(null);
  const moonCutRef   = useRef<SVGCircleElement>(null);
  const numARef      = useRef<HTMLSpanElement>(null);
  const numBRef      = useRef<HTMLSpanElement>(null);
  const chRefs       = useRef<(HTMLDivElement | null)[]>([]);

  const s4Ref        = useRef<HTMLElement>(null);
  const beamFillRef  = useRef<HTMLDivElement>(null);
  const tierStackRef = useRef<HTMLDivElement>(null);
  const freezeRef    = useRef<HTMLDivElement>(null);

  const s5Ref        = useRef<HTMLElement>(null);

  const mouseRef  = useRef({ x: 0, y: 0 });
  const smouseRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setStaticMode(true);
      setActiveTier(7); // the gallery shows the finale tier
      ringRef.current?.setAttribute("stroke-dashoffset", "0");
      return;
    }

    let targetY = window.scrollY;
    let sY = targetY;
    let raf = 0;

    const onScroll = () => { targetY = window.scrollY; };
    const onMouse = (e: MouseEvent) => {
      mouseRef.current.x = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseRef.current.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("mousemove", onMouse, { passive: true });

    /** Scroll progress of a pinned scene: 0 when pinning starts, 1 when it releases. */
    const prog = (el: HTMLElement | null, vh: number) => {
      if (!el) return 0;
      const total = el.offsetHeight - vh;
      return total > 0 ? clamp01(-el.getBoundingClientRect().top / total) : 0;
    };

    function tick() {
      sY = lerp(sY, targetY, 0.1);
      if (Math.abs(targetY - sY) < 0.05) sY = targetY;
      smouseRef.current.x = lerp(smouseRef.current.x, mouseRef.current.x, 0.05);
      smouseRef.current.y = lerp(smouseRef.current.y, mouseRef.current.y, 0.05);
      const mx = smouseRef.current.x;
      const my = smouseRef.current.y;
      const vh = window.innerHeight;

      const p1 = prog(s1Ref.current, vh);
      const p2 = prog(s2Ref.current, vh);
      const p4 = prog(s4Ref.current, vh);

      /* ── ACT I — title push + portal ─────────────────────────── */
      if (starsRef.current) {
        starsRef.current.style.transform =
          `translate3d(${(mx * -14).toFixed(1)}px, ${(my * -10 + sY * 0.03).toFixed(1)}px, 0)`;
      }
      const push = smooth(clamp01((p1 - 0.06) / 0.30));
      if (titleRef.current) {
        titleRef.current.style.opacity = (1 - push).toFixed(3);
        titleRef.current.style.transform =
          `translate3d(${(mx * 9).toFixed(1)}px, ${(my * 6 - push * 46).toFixed(1)}px, 0) scale(${(1 + push * 0.5).toFixed(3)})`;
        titleRef.current.style.filter = push > 0.01 ? `blur(${(push * 16).toFixed(1)}px)` : "";
      }
      const grow = smooth(clamp01((p1 - 0.24) / 0.46));
      if (coreRef.current) {
        coreRef.current.style.transform =
          `translate3d(${(mx * 6).toFixed(1)}px, ${(my * 4).toFixed(1)}px, 0) scale(${(0.16 + grow * 26).toFixed(3)})`;
      }
      /* Portal flash — whites out the screen well BEFORE the text beats so
         every line lands on a fully bright field, holds, then dissolves
         over Act II's entry. */
      const whiteUp   = smooth(clamp01((p1 - 0.40) / 0.16));
      const bridgeOut = 1 - smooth(clamp01(p2 / 0.10));
      const flash     = whiteUp * bridgeOut;
      if (flashRef.current) flashRef.current.style.opacity = flash.toFixed(3);
      /* Inside the light — three dark-ink beats. Each window is comfortably
         wider than its fade, so the line rises, HOLDS at full for a real
         stretch of scroll, then dissolves before the next arrives. Multiplied
         by bridgeOut so the last beat dissolves WITH the flash into Act II
         (it lives outside the pinned section, so it can't scroll away on its
         own). */
      const STEP_FADE = 0.045;
      const STEP_WINDOWS: [number, number][] = [[0.58, 0.74], [0.76, 0.91], [0.93, 1.10]];
      stepRefs.current.forEach((el, i) => {
        if (!el) return;
        const v = win(p1, STEP_WINDOWS[i][0], STEP_WINDOWS[i][1], STEP_FADE) * bridgeOut;
        el.style.opacity = v.toFixed(3);
        el.style.transform = `translateY(${((1 - v) * 14).toFixed(1)}px) scale(${(0.97 + v * 0.03).toFixed(3)})`;
        el.style.filter = v < 0.99 ? `blur(${((1 - v) * 6).toFixed(1)}px)` : "";
      });
      hintRef.current?.classList.toggle("cf-hidden", p1 > 0.03);

      /* ── ACT II — the morphing ring ──────────────────────────── */
      if (ringWrapRef.current) {
        const enter = smooth(clamp01(p2 / 0.06));
        ringWrapRef.current.style.opacity = p2 >= 1 ? "1" : enter.toFixed(3);
        ringWrapRef.current.style.transform =
          `translate3d(${(mx * 5).toFixed(1)}px, ${((1 - enter) * 26 + my * 4).toFixed(1)}px, 0)`;
      }
      if (ringSpinRef.current) {
        ringSpinRef.current.style.transform = `rotate(${(p2 * 26).toFixed(2)}deg)`;
      }
      const drawP = smooth(clamp01((p2 - 0.01) / 0.30));
      const cres = smooth(clamp01((p2 - 0.68) / 0.24));
      if (ringRef.current) {
        ringRef.current.setAttribute("stroke-dashoffset", (RING_C * (1 - drawP)).toFixed(1));
        ringRef.current.style.opacity = (1 - cres * 0.82).toFixed(3);
      }
      const arcOut = smooth(clamp01((p2 - 0.64) / 0.07));
      arcRefs.current.forEach((arc, i) => {
        if (!arc) return;
        const aIn = smooth(clamp01((p2 - (0.38 + i * 0.07)) / 0.09));
        arc.style.opacity = (aIn * (1 - arcOut)).toFixed(3);
      });
      if (moonRef.current) moonRef.current.style.opacity = cres.toFixed(3);
      if (moonCutRef.current) {
        moonCutRef.current.setAttribute("cx", (RC + cres * 78).toFixed(1));
        moonCutRef.current.setAttribute("cy", (RC - cres * 26).toFixed(1));
      }
      if (numARef.current) {
        const v = win(p2, 0.015, 0.34, 0.07);
        numARef.current.style.opacity = v.toFixed(3);
        const secs = Math.ceil(180 * (1 - clamp01((p2 - 0.02) / 0.30)));
        numARef.current.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
      }
      if (numBRef.current) {
        const v = win(p2, 0.36, 0.66, 0.07);
        numBRef.current.style.opacity = v.toFixed(3);
        numBRef.current.textContent = `×${(1 + clamp01((p2 - 0.36) / 0.26) * 1.4).toFixed(2)}`;
      }
      const chWins: [number, number][] = [[0.02, 0.34], [0.36, 0.66], [0.68, 1.2]];
      chRefs.current.forEach((ch, i) => {
        if (!ch) return;
        const v = win(p2, chWins[i][0], chWins[i][1], 0.075);
        ch.style.opacity = v.toFixed(3);
        ch.style.transform = `translateY(calc(-50% + ${((1 - v) * 22).toFixed(1)}px))`;
        ch.style.filter = v < 0.99 ? `blur(${((1 - v) * 9).toFixed(1)}px)` : "";
      });

      /* ── ACT III — the climb ─────────────────────────────────── */
      const idx = Math.min(7, Math.floor(clamp01((p4 - 0.05) / 0.70) * 8));
      if (idx !== activeTierRef.current) {
        activeTierRef.current = idx;
        setActiveTier(idx);
      }
      if (beamFillRef.current) {
        beamFillRef.current.style.transform = `scaleY(${smooth(clamp01((p4 - 0.03) / 0.74)).toFixed(3)})`;
      }
      const freeze = smooth(clamp01((p4 - 0.80) / 0.13));
      if (tierStackRef.current) {
        tierStackRef.current.style.opacity = (1 - freeze).toFixed(3);
        tierStackRef.current.style.filter = freeze > 0.01 ? `blur(${(freeze * 12).toFixed(1)}px)` : "";
      }
      if (freezeRef.current) {
        freezeRef.current.style.opacity = freeze.toFixed(3);
        freezeRef.current.style.transform = `translateY(${((1 - freeze) * 34).toFixed(1)}px)`;
      }

      /* ── Environment — blue depths to gold heights, then calm ── */
      let gold = smooth(clamp01((p4 - 0.12) / 0.55));
      if (s5Ref.current) {
        const r5 = s5Ref.current.getBoundingClientRect();
        if (r5.top < vh) gold *= 1 - smooth(clamp01((vh - r5.top) / (vh * 0.9)));
      }
      if (auroraRef.current) {
        auroraRef.current.style.setProperty("--h1", lerp(248, 88, gold).toFixed(1));
        auroraRef.current.style.setProperty("--h2", lerp(305, 70, gold).toFixed(1));
        auroraRef.current.style.setProperty("--i", (0.45 + gold * 0.30).toFixed(3));
      }

      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("mousemove", onMouse);
    };
  }, []);

  return (
    <div className={`cf${staticMode ? " cf-static" : ""}`}>

      {/* ── Environment ─────────────────────────────────────────── */}
      <div className="cf-bg" aria-hidden="true">
        <div className="cf-aurora" ref={auroraRef} />
        <div className="cf-grain" />
        <div className="cf-vignette" />
      </div>
      <div className="cf-flash" ref={flashRef} aria-hidden="true" />

      {/* Beats inside the light — a SIBLING of the flash (same stacking
          layer) so its z-index actually sits above the white, and gated by
          the flash's dissolve so it never lingers into Act II. */}
      <div className="cf-step" aria-hidden="true">
        <p ref={el => { stepRefs.current[0] = el; }}>Step <em>inside.</em></p>
        <p ref={el => { stepRefs.current[1] = el; }}>The arena is <em>listening.</em></p>
        <p ref={el => { stepRefs.current[2] = el; }}>Show it what you <em>know.</em></p>
      </div>

      {/* ── ACT I — Title ───────────────────────────────────────── */}
      <section className="cf-act1" ref={s1Ref}>
        <div className="cf-pin">
          <div className="cf-stars" ref={starsRef} aria-hidden="true">
            {STARS.map((s, i) => (
              <span
                key={i}
                className="cf-star"
                style={{
                  left: `${s.x}%`, top: `${s.y}%`,
                  width: s.s, height: s.s,
                  "--o": s.o, "--d": `${s.d}s`,
                } as React.CSSProperties}
              />
            ))}
          </div>

          <div className="cf-core" ref={coreRef} aria-hidden="true" />

          <div className="cf-title-stack" ref={titleRef}>
            <p className="cf-kicker">Eclipta · Season 01</p>
            <h1 className="cf-title" aria-label="Eclipta">
              {"ECLIPTA".split("").map((c, i) => (
                <span key={i} className="cf-char" aria-hidden="true" style={{ "--ci": i } as React.CSSProperties}>
                  {c}
                </span>
              ))}
              <span className="cf-sweep" aria-hidden="true" />
            </h1>
            <p className="cf-tag">
              The study session is over. <em>The arena is open.</em>
            </p>
          </div>

          <div className="cf-hint" ref={hintRef} aria-hidden="true">
            <span className="cf-hint-line" />
            Scroll
          </div>
        </div>
      </section>

      {/* ── ACT II — The Loop ───────────────────────────────────── */}
      <section className="cf-act2" ref={s2Ref} id="loop">
        <div className="cf-pin">
          <div className="cf-act2-grid">
            <div className="cf-act2-copy">
              <p className="cf-actlabel">Act II · The Loop</p>
              <div className="cf-ch" ref={el => { chRefs.current[0] = el; }}>
                <h2>Three minutes.<br /><em>Live stakes.</em></h2>
                <p>Real opponents, in real time. Every correct answer lands as damage — every hesitation costs you.</p>
              </div>
              <div className="cf-ch" ref={el => { chRefs.current[1] = el; }}>
                <h2>Streaks <em>compound.</em></h2>
                <p>Chain correct answers and the multiplier climbs. Break the chain and it resets to zero.</p>
              </div>
              <div className="cf-ch" ref={el => { chRefs.current[2] = el; }}>
                <h2>Luna coaches.<br /><em>Never answers.</em></h2>
                <p>A hint-first AI that makes you reason it out — then sends you back into the fight.</p>
              </div>
            </div>

            <div className="cf-ringwrap" ref={ringWrapRef}>
              <svg className="cf-ring-svg" viewBox="0 0 480 480" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <defs>
                  <radialGradient id="cfMoonGrad" cx="42%" cy="38%" r="75%">
                    <stop offset="0%" stopColor="oklch(0.92 0.05 270)" />
                    <stop offset="60%" stopColor="oklch(0.72 0.13 285 / 0.85)" />
                    <stop offset="100%" stopColor="oklch(0.55 0.16 290 / 0.4)" />
                  </radialGradient>
                  <mask id="cfMoonMask">
                    <circle cx={RC} cy={RC} r="112" fill="#fff" />
                    <circle ref={moonCutRef} cx={RC} cy={RC} r="106" fill="#000" />
                  </mask>
                </defs>

                <g className="cf-ring-spin" ref={ringSpinRef} style={{ transformOrigin: "center", transformBox: "fill-box" }}>
                  {TICKS.map((t, i) => (
                    <line
                      key={i}
                      x1={t.x1.toFixed(1)} y1={t.y1.toFixed(1)}
                      x2={t.x2.toFixed(1)} y2={t.y2.toFixed(1)}
                      stroke={t.major ? "oklch(0.82 0.12 235 / 0.5)" : "oklch(0.82 0.12 235 / 0.16)"}
                      strokeWidth={t.major ? 1.4 : 0.7}
                    />
                  ))}
                </g>

                {/* Chapter 1 — the match ring draws itself */}
                <circle
                  ref={ringRef}
                  cx={RC} cy={RC} r={RING_R}
                  stroke="oklch(0.84 0.10 235 / 0.85)" strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeDasharray={RING_C}
                  strokeDashoffset={RING_C}
                  transform={`rotate(-90 ${RC} ${RC})`}
                />

                {/* Chapter 2 — combo arcs light in sequence */}
                {COMBO_ARCS.map((d, i) => (
                  <path
                    key={i}
                    ref={el => { arcRefs.current[i] = el; }}
                    d={d}
                    stroke="oklch(0.72 0.19 350 / 0.9)" strokeWidth="3"
                    strokeLinecap="round"
                    style={{ opacity: 0 }}
                  />
                ))}

                {/* Chapter 3 — the ring becomes Luna's crescent */}
                <circle
                  ref={moonRef}
                  cx={RC} cy={RC} r="112"
                  fill="url(#cfMoonGrad)"
                  mask="url(#cfMoonMask)"
                  style={{ opacity: 0 }}
                />
              </svg>
              <div className="cf-ring-center">
                <span className="cf-num" ref={numARef} />
                <span className="cf-num" ref={numBRef} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── ACT II, continued — eight ways to fight ─────────────── */}
      <ArchetypesCompass />

      {/* ── ACT III — The Climb ─────────────────────────────────── */}
      <section className="cf-act4" ref={s4Ref} id="climb">
        <div className="cf-pin">
          <div className="cf-climb-stage">
            <p className="cf-actlabel">Act III · The Climb</p>
            <div className="cf-beam" aria-hidden="true">
              <div className="cf-beam-fill" ref={beamFillRef} />
            </div>
            <div className="cf-tierstack" ref={tierStackRef}>
              {TIERS.map((t, i) => (
                <span
                  key={t.name}
                  className={`cf-tier${i === activeTier ? " cf-tier--on" : i < activeTier ? " cf-tier--past" : ""}`}
                  style={{ "--tc": t.c } as React.CSSProperties}
                >
                  {t.name}
                </span>
              ))}
            </div>
            <div className="cf-freeze" ref={freezeRef}>
              <div>
                <p className="cf-freeze-num">284</p>
                <p className="cf-freeze-line">reached <em>God</em> this season.</p>
                <p className="cf-freeze-note">Their names stay on the wall</p>
              </div>
            </div>
            <p className="cf-climb-meta">Ranked ascent — tier {String(activeTier + 1).padStart(2, "0")} / 08</p>
          </div>
        </div>
      </section>

      {/* ── ACT IV — Resolution ─────────────────────────────────── */}
      <section className="cf-act5" ref={s5Ref} id="enter">
        <div>
          <motion.p
            className="cf-actlabel"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.9, ease: [0.2, 0.7, 0.2, 1] }}
          >
            Act IV · Yours
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 26, filter: "blur(10px)" }}
            whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 1.0, delay: 0.1, ease: [0.2, 0.7, 0.2, 1] }}
          >
            Enter the <em>arena.</em>
          </motion.h2>
          <motion.p
            className="cf-act5-sub"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.9, delay: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
          >
            Free to play. Pick a class, land your first combo, and find out
            what you actually know — in three minutes.
          </motion.p>
          <motion.div
            className="cf-cta-row"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.9, delay: 0.34, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <Link to={ctaTo} className="cf-btn">
              {ctaLabel}
              <svg width="14" height="10" viewBox="0 0 14 10" fill="none" aria-hidden="true">
                <path d="M0 5 H11 M8 1 L12 5 L8 9" stroke="currentColor" strokeWidth="1.3" />
              </svg>
            </Link>
            <Link to="/about" className="cf-link">How it works</Link>
          </motion.div>
        </div>
      </section>

      {/* ── Credits ─────────────────────────────────────────────── */}
      <footer className="cf-foot">
        <Link to="/" className="cf-brand">
          <span className="cf-brand-mark" />
          <span>Eclipta</span>
        </Link>
        <nav className="cf-foot-links" aria-label="Footer">
          <Link to="/about">About</Link>
          <Link to="/certified">Courses</Link>
          <Link to="/forum">Forum</Link>
          <Link to="/battles">Battles</Link>
        </nav>
        <div>© 2026</div>
      </footer>

    </div>
  );
}
