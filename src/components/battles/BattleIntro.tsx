import { motion } from "framer-motion";
import { HelpCircle } from "lucide-react";
import { EASING } from "@/config/motion";
import { ARCHETYPES } from "./archetypes";
import type { ArchetypeId } from "./types";
import type { OpponentType } from "@/lib/matchmaking";
import "./BattleIntro.css";

/**
 * BattleIntro — "The Eclipse Alignment".
 *
 * The cinematic loading sequence shown while matchmaking resolves (the
 * `searching` phase). Replaces the old spinner-style loader. Brand language:
 * gold motes fall INWARD into a forming eclipse on midnight navy, your
 * archetype and a mystery opponent rise rim-lit from opposite sides — crossing
 * a threshold into the arena rather than waiting for a page to load.
 *
 * All motion is compositor-only (transform/opacity/filter) and collapses to a
 * still tableau under prefers-reduced-motion. See backup/RESTORE.md to revert.
 */

const EASE = EASING.soft;

// Deterministic mote field — golden-angle spread so it reads organic, not
// gridded. Each mote starts at an edge offset and falls inward to the core.
const PARTICLES = Array.from({ length: 22 }, (_, i) => {
  const angle = i * 137.5 * (Math.PI / 180);
  const dist = 150 + (i % 5) * 36;
  return {
    sx: Math.round(Math.cos(angle) * dist),
    sy: Math.round(Math.sin(angle) * dist),
    d: 2.4 + (i % 4) * 0.7,
    delay: (i % 7) * 0.34,
    size: 1.5 + (i % 3),
  };
});

const TIERS = ["live", "ghost", "bot"] as const;
const TIER_LABEL: Record<OpponentType, string> = { live: "Live", ghost: "Ghost", bot: "AI" };

export function BattleIntro({
  archetype,
  matchTier,
  matchStatus,
}: {
  archetype: ArchetypeId;
  matchTier: OpponentType;
  matchStatus: string;
}) {
  const arch = ARCHETYPES[archetype];
  const PlayerIcon = arch.icon;
  const tierIdx = TIERS.indexOf(matchTier);

  return (
    <div className="bi" role="status" aria-label="Entering the arena">
      <div className="bi-vignette" aria-hidden="true" />

      <div className="bi-stage">
        {/* inward-falling motes */}
        <div className="bi-particles" aria-hidden="true">
          {PARTICLES.map((p, i) => (
            <span
              key={i}
              className="bi-particle"
              style={
                {
                  "--sx": `${p.sx}px`,
                  "--sy": `${p.sy}px`,
                  "--d": `${p.d}s`,
                  "--delay": `${p.delay}s`,
                  width: p.size,
                  height: p.size,
                } as React.CSSProperties
              }
            />
          ))}
        </div>

        {/* the eclipse */}
        <div className="bi-eclipse" aria-hidden="true">
          <div className="bi-corona" />
          <div className="bi-ring" />
          <div className="bi-disc" />
        </div>

        {/* the duel — you vs a mystery opponent, rim-lit by the corona */}
        <motion.div
          className="bi-fighter bi-fighter--left"
          initial={{ opacity: 0, x: -36 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1, delay: 0.5, ease: EASE }}
        >
          <PlayerIcon className="bi-fighter-icon" />
          <span className="bi-fighter-tag">You · {arch.name.replace(/^The /, "")}</span>
        </motion.div>

        <motion.div
          className="bi-fighter bi-fighter--right"
          initial={{ opacity: 0, x: 36 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1, delay: 0.7, ease: EASE }}
        >
          <HelpCircle className="bi-fighter-icon bi-fighter-icon--mystery" />
          <span className="bi-fighter-tag">Opponent</span>
        </motion.div>
      </div>

      <motion.div
        className="bi-titles"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, delay: 1.0, ease: EASE }}
      >
        <p className="bi-kicker">The arena is opening</p>
        <h2 className="btt-shout bi-title">Entering Battle</h2>
        <div className="bi-tiers" aria-hidden="true">
          {TIERS.map((t, i) => (
            <span
              key={t}
              className={`bi-tier${matchTier === t ? " is-active" : ""}${tierIdx > i ? " is-passed" : ""}`}
            >
              {TIER_LABEL[t]}
            </span>
          ))}
        </div>
        <p className="bi-status">{matchStatus}</p>
      </motion.div>
    </div>
  );
}
