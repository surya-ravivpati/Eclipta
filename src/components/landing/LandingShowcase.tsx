import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import "./CinematicLanding.css";

/* ─── helpers ─────────────────────────────────────────────────────── */
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp    = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth  = (t: number) => t * t * (3 - 2 * t);

const TIERS = [
  { id: "t1", name: "Bronze",   desc: "Finding footing",        c: "var(--v11-c1)" },
  { id: "t2", name: "Silver",   desc: "Reading the fight",      c: "var(--v11-c2)" },
  { id: "t3", name: "Gold",     desc: "Combo discipline",       c: "var(--v11-c3)" },
  { id: "t4", name: "Platinum", desc: "Class mastery",          c: "var(--v11-c4)" },
  { id: "t5", name: "Diamond",  desc: "Pressure consistency",   c: "var(--v11-c5)" },
  { id: "t6", name: "Champion", desc: "Season cosmetics",       c: "var(--v11-c6)" },
  { id: "t7", name: "Unreal",   desc: "Top 1% this season",     c: "var(--v11-c7)" },
  { id: "t8", name: "God",      desc: "Name on the global wall", c: "var(--v11-c8)", god: true },
] as const;

const LOOP_STATS = [
  { cls: "r1", idx: "— 01", k: "HP",    v: <>Wrong answers cost HP. <em>Run out</em> and you're knocked out — instantly.</> },
  { cls: "r2", idx: "— 02", k: "Combo", v: <>Streaks compound damage. <em>Break the chain</em> and the multiplier resets to zero.</> },
  { cls: "r3", idx: "— 03", k: "Focus", v: <>Spent on heals. <em>Earned by clutch</em> correct answers under pressure.</> },
  { cls: "r4", idx: "— 04", k: "Time",  v: <>Faster answers deal more damage. <em>Hesitation halves</em> your hit.</> },
] as const;

const TOOLS = [
  { cls: "t1", ix: "— 01", nm: <><em>Luna</em></>,           dx: "Hint-first AI coach. Forces you to reason through answers — won't hand them to you.", to: "/luna"            },
  { cls: "t2", ix: "— 02", nm: <>Adaptive tests</>,          dx: "Branches on every answer to find your blind spots. No two sessions are the same.",  to: "/adaptive-tests"  },
  { cls: "t3", ix: "— 03", nm: <>Courses</>,                 dx: "Curated tracks and custom syllabi. Build the foundations the arena will expose.",   to: "/certified"       },
  { cls: "t4", ix: "— 04", nm: <>Forum</>,                   dx: "Stack-Exchange threads tagged by subject. Ask, argue, and learn from every fight.",  to: "/forum"           },
] as const;

/* ─── main component ──────────────────────────────────────────────── */
export function LandingShowcase() {
  const { isAuthenticated } = useAuth();
  const ctaTo    = isAuthenticated ? "/battles" : "/signup";
  const ctaLabel = isAuthenticated ? "Battle now" : "Fight free";

  const [liveCount, setLiveCount] = useState(1407);

  /* Live counter */
  useEffect(() => {
    const id = setInterval(() => {
      setLiveCount(n => {
        const next = n + Math.round((Math.random() - 0.5) * 6);
        return Math.min(1470, Math.max(1380, next));
      });
    }, 2400);
    return () => clearInterval(id);
  }, []);

  /* DOM refs */
  const wrapRef       = useRef<HTMLDivElement>(null);
  const bgAuroraRef   = useRef<HTMLDivElement>(null);
  const bgGridRef     = useRef<HTMLDivElement>(null);
  const bgVigRef      = useRef<HTMLDivElement>(null);
  const progressRef   = useRef<HTMLDivElement>(null);
  const navRef        = useRef<HTMLElement>(null);

  const act1Ref       = useRef<HTMLElement>(null);
  const ch0Ref        = useRef<HTMLDivElement>(null);
  const ch1Ref        = useRef<HTMLDivElement>(null);
  const ch2Ref        = useRef<HTMLDivElement>(null);
  const strikeRef     = useRef<HTMLSpanElement>(null);
  const scrollHintRef = useRef<HTMLDivElement>(null);
  const hudRefs       = useRef<(HTMLDivElement | null)[]>([]);

  const act2Ref       = useRef<HTMLElement>(null);
  const act2HeadRef   = useRef<HTMLDivElement>(null);
  const statRefs      = useRef<(HTMLDivElement | null)[]>([]);

  const act3Ref       = useRef<HTMLElement>(null);
  const climbElRef    = useRef<HTMLDivElement>(null);
  const climbPinRef   = useRef<HTMLSpanElement>(null);

  const revealsRef    = useRef<Element[]>([]);

  /* Main RAF scroll loop */
  useEffect(() => {
    let targetY = window.scrollY;
    let smoothY = targetY;
    const EASE  = 0.10;
    let raf: number;

    const onScroll = () => { targetY = window.scrollY; };
    window.addEventListener("scroll", onScroll, { passive: true });

    function tick() {
      smoothY = lerp(smoothY, targetY, EASE);
      if (Math.abs(targetY - smoothY) < 0.05) smoothY = targetY;

      const vh = window.innerHeight;
      const h  = document.documentElement.scrollHeight - vh;
      const sY = smoothY;

      /* Progress */
      if (progressRef.current) {
        progressRef.current.style.setProperty("--p", (100 * sY / h).toFixed(2) + "%");
      }
      /* Nav */
      navRef.current?.classList.toggle("v11-scrolled", sY > 16);
      /* Grid parallax */
      if (bgGridRef.current) {
        bgGridRef.current.style.transform = `translate3d(0,${(sY * 0.04).toFixed(1)}px,0)`;
      }

      /* ── ACT 1 ──────────────────────────────────────────────── */
      if (act1Ref.current) {
        const rect  = act1Ref.current.getBoundingClientRect();
        const total = act1Ref.current.offsetHeight - vh;
        const p     = clamp01(-rect.top / total);

        // [0.00..0.25] IDLE  — hero quote visible, strike animates in
        // [0.25..0.70] PUSH  — quote dissolves, HUDs fade in, ch1 appears
        // [0.70..1.00] HOLD  — ch2 fades in
        const idleP = clamp01((p - 0.00) / 0.25);
        const pushP = clamp01((p - 0.25) / 0.45);
        const holdP = clamp01((p - 0.70) / 0.30);

        /* Chapter 0 — hero blockquote */
        if (ch0Ref.current) {
          ch0Ref.current.style.opacity   = (1 - pushP).toFixed(3);
          ch0Ref.current.style.transform =
            `translate(-50%, calc(-50% + ${(-pushP * 50).toFixed(1)}px))`;
          ch0Ref.current.style.filter    = `blur(${(pushP * 6).toFixed(1)}px)`;
        }
        if (strikeRef.current) {
          strikeRef.current.style.setProperty("--strike", idleP.toFixed(3));
        }

        /* Chapter 1 — "Eight ways to fight" */
        if (ch1Ref.current) {
          const op = smooth(pushP) * (1 - smooth(holdP) * 1.8);
          ch1Ref.current.style.opacity   = clamp01(op).toFixed(3);
          ch1Ref.current.style.transform =
            `translate(-50%, calc(-50% + ${((1 - smooth(pushP)) * 32).toFixed(1)}px))`;
          ch1Ref.current.style.filter    = `blur(${(holdP * 8).toFixed(1)}px)`;
        }

        /* Chapter 2 — "One arena" */
        if (ch2Ref.current) {
          const op2 = smooth(holdP);
          ch2Ref.current.style.opacity   = op2.toFixed(3);
          ch2Ref.current.style.transform =
            `translate(-50%, calc(-50% + ${((1 - op2) * 32).toFixed(1)}px))`;
        }

        /* HUD corners */
        const hudOn = clamp01((p - 0.30) / 0.18);
        hudRefs.current.forEach((hud) => {
          if (!hud) return;
          hud.style.opacity = (hudOn * (1 - holdP * 0.5)).toFixed(3);
          const tl = hud.classList.contains("v11-hud-tl") || hud.classList.contains("v11-hud-bl");
          const bt = hud.classList.contains("v11-hud-bl") || hud.classList.contains("v11-hud-br");
          hud.style.transform =
            `translate(${((1 - hudOn) * (tl ? -8 : 8)).toFixed(1)}px, ${((1 - hudOn) * (bt ? 8 : 0)).toFixed(1)}px)`;
        });

        /* Scroll hint */
        scrollHintRef.current?.classList.toggle("v11-in", p > 0.02 && p < 0.18);

        /* Aurora evolves */
        if (bgAuroraRef.current) {
          bgAuroraRef.current.style.setProperty("--ah",  (250 + p * 80).toFixed(1));
          bgAuroraRef.current.style.setProperty("--ah2", (320 - p * 60).toFixed(1));
          bgAuroraRef.current.style.setProperty("--ax",  (30 + p * 10) + "%");
          bgAuroraRef.current.style.setProperty("--ay",  (22 + p * 12) + "%");
        }
        if (bgVigRef.current) {
          bgVigRef.current.style.opacity = (0.7 + p * 0.3).toFixed(3);
        }
      }

      /* ── ACT 2 ──────────────────────────────────────────────── */
      if (act2Ref.current) {
        const rect  = act2Ref.current.getBoundingClientRect();
        const total = act2Ref.current.offsetHeight - vh;
        const p     = clamp01(-rect.top / total);

        const step = (0.85 - 0.12) / 4;
        statRefs.current.forEach((row, i) => {
          if (!row) return;
          row.classList.toggle("v11-lit", p >= 0.12 + i * step);
        });

        if (act2HeadRef.current) {
          const op = p < 0.05 ? p / 0.05 : p > 0.92 ? 1 - (p - 0.92) / 0.08 : 1;
          act2HeadRef.current.style.opacity = clamp01(op).toFixed(3);
        }
      }

      /* ── ACT 3 ──────────────────────────────────────────────── */
      if (act3Ref.current && climbElRef.current && climbPinRef.current) {
        const rect  = act3Ref.current.getBoundingClientRect();
        const total = act3Ref.current.offsetHeight - vh;
        const p     = clamp01(-rect.top / total);
        const maxY  = climbElRef.current.offsetHeight - (climbPinRef.current.offsetHeight || 26);
        climbPinRef.current.style.transform = `translateY(${(clamp01(p * 1.05) * maxY).toFixed(1)}px)`;
      }

      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  /* Reveal observer */
  useEffect(() => {
    const reveals: Element[] = [];
    wrapRef.current?.querySelectorAll(".v11-reveal").forEach(el => reveals.push(el));
    revealsRef.current = reveals;

    const check = () => {
      const vh = window.innerHeight;
      revealsRef.current = revealsRef.current.filter(el => {
        const r = el.getBoundingClientRect();
        if (r.top < vh * 0.92 && r.bottom > 0) {
          el.classList.add("in");
          return false;
        }
        return true;
      });
    };

    let io: IntersectionObserver | null = null;
    try {
      io = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io?.unobserve(e.target);
          }
        });
      }, { threshold: 0.18, rootMargin: "0px 0px -8% 0px" });
      reveals.forEach(el => io!.observe(el));
    } catch (_) {}

    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    requestAnimationFrame(check);
    const t1 = setTimeout(check, 60);
    const t2 = setTimeout(check, 280);
    const t3 = setTimeout(check, 700);
    const t4 = setTimeout(() => wrapRef.current?.classList.add("force-show"), 1800);

    return () => {
      io?.disconnect();
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4);
    };
  }, []);

  return (
    <div className="v11" ref={wrapRef}>

      {/* ── Fixed background ─────────────────────────────────────── */}
      <div className="v11-bg" aria-hidden="true">
        <div className="v11-aurora" ref={bgAuroraRef} />
        <div className="v11-grid"   ref={bgGridRef} />
        <div className="v11-vignette" ref={bgVigRef} />
        <div className="v11-noise" />
      </div>

      <div className="v11-progress" ref={progressRef} aria-hidden="true" />

      {/* ── Nav ──────────────────────────────────────────────────── */}
      <nav className="v11-nav" ref={navRef} id="top">
        <Link to="/" className="v11-brand">
          <span className="v11-brand-mark" />
          <span>Eclipta</span>
        </Link>
        <div className="v11-nav-meta">
          <span className="v11-live-dot" />
          <span>{liveCount.toLocaleString("en-US")}</span> in arena
        </div>
        <Link to={ctaTo} className="v11-nav-cta">Battle now</Link>
      </nav>

      {/* ── ACT 1 — Hero (centered blockquote, no tower) ─────────── */}
      <section className="v11-act1" ref={act1Ref} id="hero">
        <div className="v11-act1-pin">

          {/* HUD corners */}
          {[
            { pos: "tl", title: "System / Eclipta", sub: "v 01 · cohort 142 open" },
            { pos: "tr", title: "Live",             sub: `${liveCount.toLocaleString("en-US")} in arena` },
            { pos: "bl", title: "8 classes",        sub: "16 Ecliptars · free to play" },
            { pos: "br", title: "3:00",             sub: "avg. match length" },
          ].map(({ pos, title, sub }, i) => (
            <div
              key={pos}
              className={`v11-hud v11-hud-${pos}`}
              ref={el => { hudRefs.current[i] = el; }}
            >
              <strong>{title}</strong>
              {sub}
            </div>
          ))}

          {/* Chapter 0 — massive hero blockquote, no clutter */}
          <div className="v11-chapter" ref={ch0Ref} style={{ opacity: 1 }}>
            <blockquote className="v11-hero-quote">
              <span className="v11-strike" ref={strikeRef}>Study</span> is dead.
              <em>Fight for it.</em>
            </blockquote>
          </div>

          {/* Chapter 1 */}
          <div className="v11-chapter" ref={ch1Ref}>
            <h2><em>Eight</em> ways to fight.</h2>
          </div>

          {/* Chapter 2 */}
          <div className="v11-chapter" ref={ch2Ref}>
            <h2>Eight archetypes, <em>one arena.</em></h2>
          </div>

          {/* Scroll hint */}
          <div className="v11-scroll-hint" ref={scrollHintRef} aria-hidden="true">
            <span className="v11-sh-line" />
            Scroll
          </div>
        </div>
      </section>

      {/* ── ACT 2 — Loop ─────────────────────────────────────────── */}
      <section className="v11-act2" id="loop" ref={act2Ref}>
        <div className="v11-act2-pin">
          <div className="v11-act2-inner">

            <div className="v11-act2-head" ref={act2HeadRef}>
              <div className="v11-label">04 · The Loop</div>
              <h2 className="v11-title" style={{ marginTop: 22 }}>
                Three minutes. <em>Live stakes.</em>
              </h2>
              <p className="v11-sub">
                Knowledge checks fire in real time. Combos compound damage. Every hesitation
                costs HP — and every clutch answer can turn the fight.
              </p>
            </div>

            <div className="v11-stats-stack">
              {LOOP_STATS.map(({ cls, idx, k, v }, i) => (
                <div
                  key={cls}
                  className={`v11-stat-row ${cls}`}
                  ref={el => { statRefs.current[i] = el; }}
                >
                  <span className="v11-ix">{idx}</span>
                  <div className="v11-k">{k}</div>
                  <p className="v11-v">{v}</p>
                </div>
              ))}
            </div>

          </div>
        </div>
      </section>

      {/* ── ACT 3 — Climb ────────────────────────────────────────── */}
      <section className="v11-act3" id="climb" ref={act3Ref}>
        <div className="v11-act3-pin">
          <div className="v11-act3-inner">

            <div className="v11-climb-right">
              <div className="v11-label">05 · Ranked</div>
              <h2 className="v11-title" style={{ marginTop: 22, marginBottom: 32 }}>
                Bronze to <em>God.</em> One throne.
              </h2>
              <div className="v11-climb-stat"><em>284</em><br/>reached God this season.</div>
              <p className="v11-climb-note">
                Their names live on the leaderboard until the world ends — not until next
                season's reset.
              </p>
              <a href="#training" className="v11-btn-ghost">
                Start the climb
                <svg viewBox="0 0 12 8" width="12" height="8" fill="none" aria-hidden="true">
                  <path d="M0 4 H9 M7 1 L10 4 L7 7" stroke="currentColor" strokeWidth="1.2"/>
                </svg>
              </a>
            </div>

            <div className="v11-climb" ref={climbElRef}>
              <span className="v11-climb-pin" ref={climbPinRef} />
              {TIERS.map(({ id, name, desc, c, god }) => (
                <div
                  key={id}
                  className={`v11-tier${god ? " v11-god" : ""}`}
                  style={{ "--tier-c": c } as React.CSSProperties}
                >
                  <div className="v11-tnm">
                    <span className="v11-tnum">{id.toUpperCase()}</span>
                    {name}
                  </div>
                  <div className="v11-tdx">{desc}</div>
                </div>
              ))}
            </div>

          </div>
        </div>
      </section>

      {/* ── Training ─────────────────────────────────────────────── */}
      <section className="v11-training-sec" id="training">
        <div className="v11-wrap">
          <div className="v11-sec-head">
            <div className="v11-sec-head-left">
              <div className="v11-label v11-reveal">06 · Training</div>
              <h2 className="v11-title v11-reveal" style={{ "--rd": "120ms", marginTop: 22 } as React.CSSProperties}>
                The arena exposes weakness. <em>These tools fix it.</em>
              </h2>
            </div>
            <div>
              <p className="v11-sub v11-reveal" style={{ "--rd": "240ms" } as React.CSSProperties}>
                Every tool between matches is a competitive weapon. Use them — or face
                opponents who did.
              </p>
            </div>
          </div>

          <div className="v11-tools">
            {TOOLS.map(({ cls, ix, nm, dx, to }, i) => (
              <Link
                key={cls}
                to={to}
                className={`v11-tool ${cls} v11-reveal`}
                style={{ "--rd": `${i * 60}ms` } as React.CSSProperties}
              >
                <span className="v11-tool-ix">{ix}</span>
                <div className="v11-tool-nm">{nm}</div>
                <p className="v11-tool-dx">{dx}</p>
                <span className="v11-tool-go">
                  Open
                  <svg viewBox="0 0 12 8" width="12" height="8" fill="none" aria-hidden="true">
                    <path d="M0 4 H9 M7 1 L10 4 L7 7" stroke="currentColor" strokeWidth="1.2"/>
                  </svg>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Enter ────────────────────────────────────────────────── */}
      <section className="v11-enter" id="enter">
        <div className="v11-enter-glow" aria-hidden="true" />
        <div className="v11-wrap">
          <h2 className="v11-reveal">Enter the <em>arena.</em></h2>
          <p
            className="v11-sub v11-reveal"
            style={{ "--rd": "180ms", marginLeft: "auto", marginRight: "auto", textAlign: "center" } as React.CSSProperties}
          >
            Free to play. Pick a class. Land your first combo in three minutes.
          </p>
          <div className="v11-reveal" style={{ "--rd": "320ms" } as React.CSSProperties}>
            <Link to={ctaTo} className="v11-btn">
              {ctaLabel}
              <svg width="16" height="10" viewBox="0 0 16 10" fill="none" aria-hidden="true">
                <path d="M0 5 H13 M10 1 L14 5 L10 9" stroke="currentColor" strokeWidth="1.4"/>
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="v11-foot">
        <Link to="/" className="v11-brand">
          <span className="v11-brand-mark" />
          <span>Eclipta</span>
        </Link>
        <div>© 2026</div>
      </footer>

    </div>
  );
}
