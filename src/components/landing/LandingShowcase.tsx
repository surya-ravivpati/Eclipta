/**
 * LandingShowcase — Cinematic homepage (v11 design).
 *
 * Three-act scroll film:
 *   Act 1 (440vh) — Glass tower hero that splits into 8 class plates
 *   Act 2 (380vh) — The Loop: sequential stat reveals
 *   Act 3 (280vh) — The Climb: tier rack with traveling pin
 *   Training / Enter CTA / Footer
 *
 * The animation engine runs entirely in a requestAnimationFrame loop
 * with direct DOM writes (no React state) for smooth 60 fps motion.
 * Tower is left-shifted via CSS (padding-left on .cl-tower-stage) so
 * the composition balances the right-anchored hero copy.
 */
import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import "./CinematicLanding.css";

/* ─── Arrow SVG helpers ─────────────────────────────────────── */
function Arrow({ className }: { className?: string }) {
  return (
    <svg className={className ?? "cl-arrow"} viewBox="0 0 16 10" fill="none">
      <path d="M0 5 H13 M10 1 L14 5 L10 9" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
function SmallArrow() {
  return (
    <svg viewBox="0 0 12 8" width="12" height="8" fill="none">
      <path d="M0 4 H9 M7 1 L10 4 L7 7" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/* ─── Animation engine (vanilla JS, runs in useEffect) ─────── */
function initCinematicEngine(root: HTMLElement) {
  const qs  = (sel: string) => root.querySelector<HTMLElement>(sel);
  const qsa = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));

  const progress      = qs(".cl-progress")!;
  const bgAurora      = qs(".cl-bg-aurora")!;
  const bgGrid        = qs(".cl-bg-grid")!;
  const bgVignette    = qs(".cl-bg-vignette")!;

  // Act 1
  const act1          = qs(".cl-act1")!;
  const tower         = qs(".cl-tower")!;
  const towerShell    = qs(".cl-tower-shell")!;
  const towerCore     = qs(".cl-tower-core")!;
  const towerHalo     = qs(".cl-tower-halo")!;
  const plates        = qsa(".cl-plate");
  const ch0           = qs("#cl-ch0")!;
  const ch1           = qs("#cl-ch1")!;
  const ch2           = qs("#cl-ch2")!;
  const huds          = qsa(".cl-hud");
  const gridBars      = qs(".cl-grid-bars")!;
  const scrollHint    = qs(".cl-scroll-hint")!;
  const strike        = qs(".cl-chapter h1 .strike")!;

  // Act 2
  const act2          = qs(".cl-act2")!;
  const act2Head      = qs(".cl-act2-head")!;
  const statRows      = qsa(".cl-stat-row");

  // Act 3
  const act3          = qs(".cl-act3")!;
  const climbEl       = qs("#cl-climbEl")!;
  const climbPin      = qs(".cl-climb-pin")!;

  // Reveal elements
  const reveals       = qsa(".cl-reveal");

  let targetY = window.scrollY;
  let smoothY = targetY;
  const EASE = 0.10;

  const onScroll = () => { targetY = window.scrollY; };
  window.addEventListener("scroll", onScroll, { passive: true });

  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const lerp    = (a: number, b: number, t: number) => a + (b - a) * t;
  const ss      = (t: number) => t * t * (3 - 2 * t);     // smoothstep

  // 4×2 final grid positions in viewport-% from centre
  const finalGrid = [
    { x: -37.5, y: -18 }, { x: -12.5, y: -18 }, { x: 12.5, y: -18 }, { x: 37.5, y: -18 },
    { x: -37.5, y:  18 }, { x: -12.5, y:  18 }, { x: 12.5, y:  18 }, { x: 37.5, y:  18 },
  ];

  function setAurora(p01: number) {
    if (!bgAurora) return;
    const hue1 = 250 + p01 * 80;
    const hue2 = 320 - p01 * 60;
    const ax   = 30 + p01 * 10;
    const ay   = 22 + p01 * 12;
    bgAurora.style.setProperty("--ah",  hue1.toFixed(1));
    bgAurora.style.setProperty("--ah2", hue2.toFixed(1));
    bgAurora.style.setProperty("--ax",  ax + "%");
    bgAurora.style.setProperty("--ay",  ay + "%");
  }

  // Measure how far tower center is from viewport center (accounts for CSS left-shift)
  // Called each frame so it updates on resize too.
  function getTowerOffsetX(vw: number) {
    if (!tower) return 0;
    const r = tower.getBoundingClientRect();
    return r.left + r.width / 2 - vw / 2;
  }

  let rafId = 0;

  function tick() {
    smoothY = lerp(smoothY, targetY, EASE);
    if (Math.abs(targetY - smoothY) < 0.05) smoothY = targetY;

    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const docH = document.documentElement.scrollHeight - vh;
    const sY = smoothY;

    // Progress bar
    if (progress) progress.style.setProperty("--p", (100 * sY / docH).toFixed(2) + "%");

    // Background grid parallax
    if (bgGrid) bgGrid.style.transform = `translate3d(0, ${(sY * 0.04).toFixed(1)}px, 0)`;

    // ─── ACT 1 — Hero → Classes ────────────────────────────────
    if (act1 && tower) {
      const rect  = act1.getBoundingClientRect();
      const total = act1.offsetHeight - vh;
      const p     = clamp01(-rect.top / total);

      const idleP   = clamp01((p - 0.00) / 0.18);
      const pushP   = clamp01((p - 0.18) / 0.24);
      const openP   = clamp01((p - 0.42) / 0.28);
      const settleP = clamp01((p - 0.70) / 0.15);

      // Tower transform
      const tScale = 1.0 + pushP * 0.5 + openP * 0.2;
      const tRotY  = (p * 6) - 3;
      const tY     = -pushP * 30 - openP * 80;
      tower.style.transform =
        `translate3d(0, ${tY.toFixed(1)}px, 0) scale(${tScale.toFixed(3)}) rotateY(${tRotY.toFixed(2)}deg)`;

      if (towerShell) towerShell.style.opacity = (1 - openP * 1.05).toFixed(3);
      if (towerCore) {
        towerCore.style.opacity = (1 - openP * 0.9).toFixed(3);
        towerCore.style.filter  = `brightness(${(1 + pushP * 0.3).toFixed(2)}) blur(${(openP * 8).toFixed(1)}px)`;
      }
      if (towerHalo) {
        towerHalo.style.opacity   = (1 - openP * 0.7 + pushP * 0.2).toFixed(3);
        towerHalo.style.transform = `translate(-50%,-50%) scale(${(1 + pushP * 0.2 + openP * 0.3).toFixed(3)})`;
      }

      // Plate dimensions
      const plateW      = Math.min(vw * 0.22, 360);
      const plateH      = Math.min(vh * 0.14, 130);
      const towerInnerW = Math.min(Math.max(vw * 0.14, 96), 180);
      const towerInnerH = Math.min(Math.max(vh * 0.70, 380), 640);

      // startX = offset of tower center from viewport center (for the left-shift)
      const towerOffsetX = getTowerOffsetX(vw);

      for (let i = 0; i < plates.length; i++) {
        const plate = plates[i];
        const seg   = towerInnerH / 8.4;
        const startY = (i - 3.5) * seg;
        const startX = towerOffsetX;          // plates start at tower's shifted center
        const startW = towerInnerW;
        const startH = seg * 0.95;
        const end    = finalGrid[i];
        const endX   = (end.x / 100) * vw;   // grid spreads from viewport center
        const endY   = (end.y / 100) * vh;

        const t  = ss(openP);
        const cx = lerp(startX, endX, t);
        const cy = lerp(startY, endY, t);
        const cw = lerp(startW, plateW, t);
        const ch = lerp(startH, plateH, t);

        plate.style.width  = cw.toFixed(1) + "px";
        plate.style.height = ch.toFixed(1) + "px";
        plate.style.transform =
          `translate3d(${cx.toFixed(1)}px, calc(-50% + ${cy.toFixed(1)}px), 0) translateX(-50%)`;
        plate.style.opacity = clamp01((openP - 0.05) / 0.25).toFixed(3);
        plate.classList.toggle("labeled", settleP > 0.4);
      }

      // Chapter overlays
      if (ch0) {
        ch0.style.opacity   = (1 - pushP).toFixed(3);
        ch0.style.transform = `translate(0, ${(-pushP * 40).toFixed(1)}px)`;
        ch0.style.filter    = `blur(${(pushP * 6).toFixed(1)}px)`;
        if (strike) strike.style.setProperty("--strike", idleP.toFixed(3));
      }
      if (ch1) {
        ch1.style.opacity   = (pushP * (1 - openP * 0.9)).toFixed(3);
        ch1.style.transform = `translate(-50%, calc(-50% + ${(-openP * 30).toFixed(1)}px))`;
        ch1.style.filter    = `blur(${(openP * 8).toFixed(1)}px)`;
      }
      if (ch2) {
        ch2.style.opacity   = settleP.toFixed(3);
        ch2.style.transform = `translate(-50%, calc(-50% + ${((1 - settleP) * 30).toFixed(1)}px))`;
      }

      // HUD bars
      const hudOn = clamp01((p - 0.20) / 0.15);
      const holdP = clamp01((p - 0.85) / 0.15);
      for (const hud of huds) {
        hud.style.opacity = (hudOn * (1 - holdP * 0.5)).toFixed(3);
        const cls = hud.classList;
        const ax  = cls.contains("tl") || cls.contains("bl") ? -8 : 8;
        const ay  = cls.contains("bl") || cls.contains("br") ? 8 : 0;
        hud.style.transform =
          `translate(${((1 - hudOn) * ax).toFixed(1)}px, ${((1 - hudOn) * ay).toFixed(1)}px)`;
      }

      // Grid pill
      if (gridBars) gridBars.classList.toggle("in", settleP > 0.3);

      // Scroll hint
      if (scrollHint) scrollHint.classList.toggle("in", p > 0.02 && p < 0.16);

      // Lighting
      setAurora(p);
      if (bgVignette) bgVignette.style.opacity = (0.7 + p * 0.3).toFixed(3);
    }

    // ─── ACT 2 — Loop (stats light in sequence) ───────────────
    if (act2 && statRows.length) {
      const rect  = act2.getBoundingClientRect();
      const total = act2.offsetHeight - vh;
      const p     = clamp01(-rect.top / total);
      const startP = 0.12, endP = 0.85;
      const range  = endP - startP;
      const step   = range / statRows.length;
      for (let i = 0; i < statRows.length; i++) {
        statRows[i].classList.toggle("lit", p >= startP + i * step);
      }
      if (act2Head) {
        const op = p < 0.05 ? p / 0.05 : p > 0.92 ? 1 - (p - 0.92) / 0.08 : 1;
        act2Head.style.opacity = clamp01(op).toFixed(3);
      }
    }

    // ─── ACT 3 — Climb (pin travels down the rail) ────────────
    if (act3 && climbEl && climbPin) {
      const rect  = act3.getBoundingClientRect();
      const total = act3.offsetHeight - vh;
      const p     = clamp01(-rect.top / total);
      const climbH = climbEl.offsetHeight;
      const pinH   = climbPin.offsetHeight || 26;
      const y      = clamp01(p * 1.05) * (climbH - pinH);
      climbPin.style.transform = `translateY(${y.toFixed(1)}px)`;
    }

    rafId = requestAnimationFrame(tick);
  }

  rafId = requestAnimationFrame(tick);

  // ── Scroll reveals for normal-flow sections ────────────────
  const activeReveals = [...reveals];
  function checkReveals() {
    const vh = window.innerHeight;
    for (let i = activeReveals.length - 1; i >= 0; i--) {
      const el = activeReveals[i];
      const r  = el.getBoundingClientRect();
      if (r.top < vh * 0.92 && r.bottom > 0) {
        el.classList.add("in");
        activeReveals.splice(i, 1);
      }
    }
  }
  try {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
          const idx = activeReveals.indexOf(e.target as HTMLElement);
          if (idx >= 0) activeReveals.splice(idx, 1);
        }
      });
    }, { threshold: 0.18, rootMargin: "0px 0px -8% 0px" });
    activeReveals.forEach(el => io.observe(el));
  } catch (_) { /* noop */ }
  window.addEventListener("scroll", checkReveals, { passive: true });
  window.addEventListener("resize", checkReveals);
  requestAnimationFrame(checkReveals);
  const t1 = setTimeout(checkReveals, 60);
  const t2 = setTimeout(checkReveals, 300);
  const t3 = setTimeout(checkReveals, 700);

  // Live counter flicker
  const liveEls = [root.querySelector<HTMLElement>("#cl-liveCount"), root.querySelector<HTMLElement>("#cl-liveCount2")];
  let liveN = 1407;
  const liveInterval = setInterval(() => {
    liveN += Math.round((Math.random() - 0.5) * 6);
    if (liveN < 1380) liveN = 1380;
    if (liveN > 1470) liveN = 1470;
    liveEls.forEach(el => { if (el) el.textContent = liveN.toLocaleString("en-US"); });
  }, 2400);

  return () => {
    cancelAnimationFrame(rafId);
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("scroll", checkReveals);
    window.removeEventListener("resize", checkReveals);
    clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
    clearInterval(liveInterval);
  };
}

/* ═══════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export function LandingShowcase() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { isAuthenticated } = useAuth();
  const ctaTo    = isAuthenticated ? "/battles" : "/signup";
  const ctaLabel = "Battle now";

  useEffect(() => {
    if (!containerRef.current) return;
    return initCinematicEngine(containerRef.current);
  }, []);

  return (
    <div className="cl-root" ref={containerRef}>

      {/* ── Fixed atmospheric background ── */}
      <div className="cl-bg" aria-hidden="true">
        <div className="cl-bg-aurora" />
        <div className="cl-bg-grid" />
        <div className="cl-bg-vignette" />
        <div className="cl-bg-noise" />
      </div>

      {/* Scroll progress bar */}
      <div className="cl-progress" aria-hidden="true" />

      {/* ═══════════════════════════════════════════════════════
          ACT 1 — Hero → Classes (440vh pinned scene)
          ═══════════════════════════════════════════════════════ */}
      <section className="cl-act1" id="cl-top" data-screen-label="01 Hero · Classes">
        <div className="cl-act1-pin">

          {/* HUD corner labels */}
          <div className="cl-hud tl">
            <strong>System / Eclipta</strong>
            v 01 · cohort 142 open
          </div>
          <div className="cl-hud tr">
            <strong>Live</strong>
            <span style={{
              display: "inline-block", width: 6, height: 6, borderRadius: "50%",
              background: "var(--cl-accent)", boxShadow: "0 0 8px var(--cl-accent-halo)",
              marginRight: 4, verticalAlign: "middle",
            }} />
            <span id="cl-liveCount2">1,407</span> in arena
          </div>
          <div className="cl-hud bl">
            <strong>8 classes</strong>
            16 Ecliptars · free to play
          </div>
          <div className="cl-hud br">
            <strong>3:00</strong>
            avg. match length
          </div>

          {/* Glass tower (splits open during scroll) */}
          <div className="cl-tower-stage">
            <div className="cl-tower">
              <div className="cl-tower-halo" />
              <div className="cl-tower-shell" />
              <div className="cl-tower-core" />
            </div>
          </div>

          {/* 8 plates: stacked inside tower → spread to grid */}
          <div className="cl-plates">
            {[
              { cls: "p1", name: "Speedster",  tag: "Speed · Mult" },
              { cls: "p2", name: "Tank",        tag: "Max HP" },
              { cls: "p3", name: "Chud",        tag: "Glass cannon" },
              { cls: "p4", name: "Healer",      tag: "Regen · Sustain" },
              { cls: "p5", name: "Fulcrum",     tag: "Balanced" },
              { cls: "p6", name: "Accel.",      tag: "Scales up" },
              { cls: "p7", name: "Gambler",     tag: "Chaos" },
              { cls: "p8", name: "God",         tag: "Endgame" },
            ].map((p) => (
              <div key={p.cls} className={`cl-plate ${p.cls}`}>
                <div className="cl-plate-body" />
                <div className="cl-plate-label">
                  <span className="tg">{p.tag}</span>
                  <span className="nm">{p.name}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Chapter overlays */}
          <div className="cl-chapters">
            {/* Chapter 0 — initial hero copy, RIGHT side */}
            <div className="cl-chapter right" id="cl-ch0">
              <span className="ch-tag">Chapter 01 · Origin</span>
              <h1>
                <span className="strike">Study</span> is dead.<br />
                <em>Fight for it.</em>
              </h1>
              <p>
                The first knowledge arena. Pick a class. Queue a match.
                Land combos in real time. Climb the ranked ladder with an AI coach in your corner.
              </p>
              <div className="ch-cta">
                <Link to={ctaTo} className="cl-btn">
                  {ctaLabel}
                  <Arrow />
                </Link>
                <Link to="/battles" className="cl-btn-ghost">See the system</Link>
              </div>
            </div>

            {/* Chapter 1 — reveal phase */}
            <div className="cl-chapter" id="cl-ch1">
              <span className="ch-tag">Chapter 02 · Reveal</span>
              <h2>Inside the tower, <em>eight</em> ways to fight.</h2>
            </div>

            {/* Chapter 2 — settle phase */}
            <div className="cl-chapter" id="cl-ch2" style={{ top: "12vh" }}>
              <span className="ch-tag">Chapter 03 · Identity</span>
              <h2>Eight archetypes, <em>one arena.</em></h2>
            </div>
          </div>

          {/* "Pick your class" pill */}
          <div className="cl-grid-bars">
            <span className="pill">
              <span className="dot" />
              Pick your class &nbsp;·&nbsp; choose wisely
            </span>
          </div>

          {/* Scroll hint */}
          <div className="cl-scroll-hint">
            <span className="line" />
            Scroll
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          ACT 2 — The Loop (stats light up in sequence)
          ═══════════════════════════════════════════════════════ */}
      <section className="cl-act2" id="cl-loop" data-screen-label="02 Loop">
        <div className="cl-act2-pin">
          <div className="cl-act2-inner">
            <div className="cl-act2-head">
              <div className="cl-label">04 · The Loop</div>
              <h2 className="cl-title" style={{ marginTop: 22 }}>
                Three minutes. <em>Live stakes.</em>
              </h2>
              <p className="cl-sub" style={{ marginTop: 24 }}>
                Knowledge checks fire in real time. Combos compound damage.
                Every hesitation costs HP — and every clutch answer can turn the fight.
              </p>
            </div>

            <div className="cl-stats-stack">
              {[
                { r: "r1", i: "— 01", k: "HP",    v: <>Wrong answers cost HP. <em>Run out</em> and you&apos;re knocked out — instantly.</> },
                { r: "r2", i: "— 02", k: "Combo", v: <>Streaks compound damage. <em>Break the chain</em> and the multiplier resets to zero.</> },
                { r: "r3", i: "— 03", k: "Focus", v: <>Spent on heals. <em>Earned by clutch</em> correct answers under pressure.</> },
                { r: "r4", i: "— 04", k: "Time",  v: <>Faster answers deal more damage. <em>Hesitation halves</em> your hit.</> },
              ].map((row, idx) => (
                <div key={row.r} className={`cl-stat-row ${row.r}`} data-i={idx}>
                  <span className="ix">{row.i}</span>
                  <div className="k">{row.k}</div>
                  <p className="v">{row.v}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          ACT 3 — The Climb (vertical tier track)
          ═══════════════════════════════════════════════════════ */}
      <section className="cl-act3" id="cl-climb" data-screen-label="03 Climb">
        <div className="cl-act3-pin">
          <div className="cl-act3-inner">

            <div className="cl-climb-right">
              <div className="cl-label">05 · Ranked</div>
              <h2 className="cl-title" style={{ marginTop: 22, marginBottom: 32 }}>
                Bronze to <em>God.</em> One throne.
              </h2>
              <div className="stat">
                <em>284</em>
                <br />reached God this season.
              </div>
              <p className="note">
                Their names live on the leaderboard until the world ends —
                not until next season&apos;s reset.
              </p>
              <Link to={ctaTo} className="cl-btn-ghost">
                Start the climb &nbsp;<SmallArrow />
              </Link>
            </div>

            <div className="cl-climb" id="cl-climbEl">
              <span className="cl-climb-pin" />
              {[
                { t: "",    c: "var(--cl-c1)", n: "T1", label: "Bronze",   dx: "Finding footing"          },
                { t: "",    c: "var(--cl-c2)", n: "T2", label: "Silver",   dx: "Reading the fight"        },
                { t: "",    c: "var(--cl-c3)", n: "T3", label: "Gold",     dx: "Combo discipline"         },
                { t: "",    c: "var(--cl-c4)", n: "T4", label: "Platinum", dx: "Class mastery"            },
                { t: "",    c: "var(--cl-c5)", n: "T5", label: "Diamond",  dx: "Pressure consistency"     },
                { t: "",    c: "var(--cl-c6)", n: "T6", label: "Champion", dx: "Season cosmetics"         },
                { t: "",    c: "var(--cl-c7)", n: "T7", label: "Unreal",   dx: "Top 1% this season"       },
                { t: "god", c: "var(--cl-c8)", n: "T8", label: "God",      dx: "Name on the global wall"  },
              ].map((tier) => (
                <div
                  key={tier.n}
                  className={`cl-tier${tier.t ? " " + tier.t : ""}`}
                  style={{ "--tier-c": tier.c } as React.CSSProperties}
                >
                  <div className="nm">
                    <span className="num">{tier.n}</span>{tier.label}
                  </div>
                  <div className="dx">{tier.dx}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          TRAINING — normal scroll section
          ═══════════════════════════════════════════════════════ */}
      <section className="cl-training-sec" id="cl-training" data-screen-label="04 Training">
        <div className="cl-wrap">
          <div className="cl-sec-head">
            <div className="left">
              <div className="cl-label cl-reveal">06 · Training</div>
              <h2 className="cl-title cl-reveal" style={{ marginTop: 22, "--rd": "120ms" } as React.CSSProperties}>
                The arena exposes weakness. <em>These tools fix it.</em>
              </h2>
            </div>
            <div className="right">
              <p className="cl-sub cl-reveal" style={{ "--rd": "240ms" } as React.CSSProperties}>
                Every tool between matches is a competitive weapon.
                Use them — or face opponents who did.
              </p>
            </div>
          </div>

          <div className="cl-training">
            {[
              { cls: "t1", n: "— 01", name: <><em>Luna</em></>, desc: "Hint-first AI coach. Forces you to reason through answers — won't hand them to you.", to: "/luna", rd: "0ms" },
              { cls: "t2", n: "— 02", name: <>Adaptive tests</>,  desc: "Branches on every answer to find your blind spots. No two sessions are the same.", to: "/adaptive-tests", rd: "60ms" },
              { cls: "t3", n: "— 03", name: <>Courses</>,         desc: "Curated tracks and custom syllabi. Build the foundations the arena will expose.", to: "/courses", rd: "120ms" },
              { cls: "t4", n: "— 04", name: <>Forum</>,           desc: "Stack-Exchange threads tagged by subject. Ask, argue, and learn from every fight.", to: "/forum", rd: "180ms" },
            ].map((tool) => (
              <Link
                key={tool.cls}
                to={tool.to}
                className={`cl-tool ${tool.cls} cl-reveal`}
                style={{ "--rd": tool.rd } as React.CSSProperties}
              >
                <span className="ix">{tool.n}</span>
                <div className="nm">{tool.name}</div>
                <p className="dx">{tool.desc}</p>
                <span className="go">
                  Open &nbsp;<SmallArrow />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          ENTER — Final CTA
          ═══════════════════════════════════════════════════════ */}
      <section className="cl-enter" id="cl-enter">
        <div className="glow" />
        <div className="cl-wrap">
          <h2 className="cl-reveal">
            Enter the <em>arena.</em>
          </h2>
          <p className="cl-sub cl-reveal" style={{ "--rd": "180ms", marginLeft: "auto", marginRight: "auto" } as React.CSSProperties}>
            Free to play. Pick a class. Land your first combo in three minutes.
          </p>
          <div className="cl-reveal" style={{ "--rd": "320ms" } as React.CSSProperties}>
            <Link to={ctaTo} className="cl-btn">
              {ctaLabel}
              <Arrow />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="cl-foot">
        <Link to="/" className="cl-brand">
          <span className="mark" />
          <span>Eclipta</span>
        </Link>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 11 }}>
          <span style={{
            display: "inline-block", width: 6, height: 6, borderRadius: "50%",
            background: "var(--cl-accent)", boxShadow: "0 0 8px var(--cl-accent-halo)",
          }} />
          <span id="cl-liveCount">1,407</span> in arena
        </div>
        <div>© 2026</div>
      </footer>

    </div>
  );
}