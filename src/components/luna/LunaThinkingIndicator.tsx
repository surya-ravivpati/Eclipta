import { useEffect, useRef } from "react";

/**
 * Luna thinking indicator — moon cycling through all phases at 60 fps.
 *
 * Smoothness strategy:
 *   - requestAnimationFrame mutates only the SVG `d` attribute via a ref.
 *     React reconciliation is bypassed entirely.
 *   - All other animated properties (glow, text fade) run as pure CSS
 *     keyframe animations so the browser compositor handles them without
 *     touching the JS thread.
 *   - The halo/glow ring is a static SVG element; the SVG filter is computed
 *     once by the GPU and cached — no per-frame filter recalculation.
 */

const R  = 10;
const CX = 12;
const CY = 12;
const CYCLE_MS = 5000;

function litPath(t: number): string {
  const angle = t * 2 * Math.PI;
  const cos   = Math.cos(angle);
  const rx    = (Math.abs(cos) * R).toFixed(3);
  const top   = `${CX},${CY - R}`;
  const bot   = `${CX},${CY + R}`;
  if (t <= 0.5) {
    const a2 = cos < 0 ? 1 : 0;
    return `M${top} A${R},${R},0,0,1,${bot} A${rx},${R},0,0,${a2},${top}Z`;
  } else {
    const a2 = cos < 0 ? 0 : 1;
    return `M${top} A${R},${R},0,0,0,${bot} A${rx},${R},0,0,${a2},${top}Z`;
  }
}

export function LunaThinkingIndicator({ compact = false }: { compact?: boolean }) {
  const pathRef = useRef<SVGPathElement>(null);
  const rafRef  = useRef<number>(0);
  const t0Ref   = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    function frame(now: number) {
      if (!alive) return;
      if (t0Ref.current === null) t0Ref.current = now;
      const t = ((now - t0Ref.current) % CYCLE_MS) / CYCLE_MS;
      pathRef.current?.setAttribute("d", litPath(t));
      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);
    return () => { alive = false; cancelAnimationFrame(rafRef.current); };
  }, []);

  const sz = compact ? 20 : 24;

  return (
    <div className={`flex items-center gap-2.5 ${compact ? "px-3 py-2" : "px-4 py-3"}`}>
      {/* CSS-animated glow wrapper — no JS, runs on compositor */}
      <div className="luna-thinking-moon shrink-0">
        <svg width={sz} height={sz} viewBox="0 0 24 24" aria-hidden>
          <defs>
            {/* Lit-face gradient: bright highlight top-right, deep purple at edge */}
            <radialGradient id="luna-lit" cx="68%" cy="28%" r="68%">
              <stop offset="0%"   stopColor="oklch(0.92 0.10 285)" />
              <stop offset="50%"  stopColor="oklch(0.72 0.22 290)" />
              <stop offset="100%" stopColor="oklch(0.48 0.30 296)" />
            </radialGradient>

            {/* Static blur for the ambient halo ring — GPU caches this once */}
            <filter id="luna-halo" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" />
            </filter>
          </defs>

          {/* Ambient halo — static circle, filter computed once and cached */}
          <circle
            cx={CX} cy={CY} r={R + 0.8}
            fill="none"
            stroke="oklch(0.65 0.22 290 / 0.22)"
            strokeWidth="2.8"
            filter="url(#luna-halo)"
          />

          {/* Moon body */}
          <circle cx={CX} cy={CY} r={R} fill="oklch(0.14 0.022 278)" />

          {/* Lit face — only this element's `d` attribute changes each frame */}
          <path ref={pathRef} d={litPath(0)} fill="url(#luna-lit)" />

          {/* Craters — permanently on the dark body, partially masked by light */}
          <circle cx="8.4"  cy="10.6" r="1.15" fill="oklch(0.10 0.016 278)" opacity="0.62" />
          <circle cx="13.8" cy="14.9" r="0.74" fill="oklch(0.10 0.016 278)" opacity="0.52" />
          <circle cx="10.3" cy="7.1"  r="0.54" fill="oklch(0.10 0.016 278)" opacity="0.46" />
          <circle cx="15.2" cy="9.4"  r="0.48" fill="oklch(0.10 0.016 278)" opacity="0.38" />

          {/* Limb ring — thin highlight at the edge */}
          <circle
            cx={CX} cy={CY} r={R}
            fill="none"
            stroke="oklch(0.70 0.18 290 / 0.20)"
            strokeWidth="0.55"
          />
        </svg>
      </div>

      <span className={`luna-thinking-label ${compact ? "text-xs" : "text-sm"} text-muted-foreground`}>
        Luna is thinking…
      </span>
    </div>
  );
}
