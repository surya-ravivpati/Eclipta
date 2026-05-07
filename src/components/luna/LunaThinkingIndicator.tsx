import { useEffect, useRef } from "react";
import { motion } from "framer-motion";

/**
 * Smooth lunar cycle animation for Luna's thinking state.
 *
 * The lit portion of the moon is computed geometrically on every animation
 * frame (requestAnimationFrame → ~60 fps) — no discrete phase steps, no
 * blinking. The SVG path is mutated directly via a ref to bypass React
 * reconciliation entirely.
 *
 * Geometry:
 *   The moon is a circle of radius R. The lit region is bounded by:
 *     1. A semicircle on the "lit side" (right during waxing, left during waning)
 *     2. The terminator — an ellipse whose x-radius is |cos(angle)| × R
 *        and whose sweep direction determines crescent vs. gibbous.
 *   Together the two arcs trace the illuminated face continuously from
 *   new moon (zero lit area) → full moon (complete circle) and back.
 */

const R = 10;      // moon radius in SVG units
const CX = 12;     // center x
const CY = 12;     // center y
const CYCLE_MS = 4000; // ms for one full new→full→new cycle

/** Compute the SVG `d` attribute for the lit portion at phase t ∈ [0, 1). */
function litPath(t: number): string {
  const angle = t * 2 * Math.PI;
  const cos   = Math.cos(angle);
  const rx    = (Math.abs(cos) * R).toFixed(3);
  const top   = `${CX},${CY - R}`;
  const bot   = `${CX},${CY + R}`;

  if (t <= 0.5) {
    // Waxing — lit on the right.
    // First arc:  sweep=1 (clockwise) → right semicircle going down.
    // Second arc: when cos≥0 (new→quarter) sweep=0 keeps the return path on
    //             the right side → thin crescent. When cos<0 (quarter→full)
    //             sweep=1 pulls the return to the left → gibbous/full.
    const a2 = cos < 0 ? 1 : 0;
    return `M${top} A${R},${R},0,0,1,${bot} A${rx},${R},0,0,${a2},${top}Z`;
  } else {
    // Waning — lit on the left.
    // First arc:  sweep=0 (counterclockwise) → left semicircle going down.
    // Second arc: cos<0 (full→quarter) sweep=0 → return via right → gibbous.
    //             cos≥0 (quarter→new) sweep=1 → return via left → crescent.
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
    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const sz = compact ? 18 : 22;

  return (
    <div className={`flex items-center gap-2.5 ${compact ? "px-3 py-2" : "px-4 py-3"}`}>
      {/* Breathing glow wrapper */}
      <motion.div
        className="shrink-0"
        animate={{
          filter: [
            "drop-shadow(0 0 2px oklch(0.55 0.25 290 / 0.35))",
            "drop-shadow(0 0 6px oklch(0.55 0.25 290 / 0.7))",
            "drop-shadow(0 0 2px oklch(0.55 0.25 290 / 0.35))",
          ],
        }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <svg width={sz} height={sz} viewBox="0 0 24 24" aria-hidden>
          {/* Dark side of the moon */}
          <circle
            cx={CX} cy={CY} r={R}
            style={{ fill: "oklch(0.16 0.025 280)" }}
          />
          {/* Lit portion — neon purple, updated every frame */}
          <path
            ref={pathRef}
            style={{ fill: "oklch(0.68 0.22 290)" }}
            d={litPath(0)}
          />
          {/* Subtle limb ring */}
          <circle
            cx={CX} cy={CY} r={R}
            fill="none"
            style={{ stroke: "oklch(0.55 0.25 290 / 0.25)", strokeWidth: 0.75 }}
          />
        </svg>
      </motion.div>

      <motion.span
        className={`text-muted-foreground ${compact ? "text-xs" : "text-sm"}`}
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      >
        Luna is thinking…
      </motion.span>
    </div>
  );
}
