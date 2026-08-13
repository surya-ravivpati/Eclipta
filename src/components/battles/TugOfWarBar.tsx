import { motion } from "framer-motion";
import { tugPercent, type TugState } from "@/lib/battle-modes/tug-of-war";
import { progressLabel } from "@/lib/a11y";

/**
 * The shared bar. Replaces the two HP bars while Tug-of-War is active - this
 * mode's one resource in one place, not a third readout alongside two that
 * do not mean anything here.
 */
export function TugOfWarBar({
  state,
  playerName,
  opponentName,
}: {
  state: TugState;
  playerName: string;
  opponentName: string;
}) {
  const pct = tugPercent(state);
  return (
    <div className="w-full px-1">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-bold tracking-widest text-[color:var(--btt-you)] truncate max-w-[40%]">
          {playerName}
        </span>
        <span className="text-[9px] font-mono tracking-widest text-muted-foreground uppercase">
          Tug-of-War
        </span>
        <span className="text-[11px] font-bold tracking-widest text-[color:var(--btt-foe)] truncate max-w-[40%] text-right">
          {opponentName}
        </span>
      </div>
      <div
        className="h-4 rounded-full overflow-hidden border border-border bg-secondary/30 relative"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={progressLabel(`${playerName} vs ${opponentName}`, pct, 100)}
      >
        <motion.div
          className="absolute inset-y-0 left-0"
          style={{
            background:
              "linear-gradient(to right, var(--btt-you), color-mix(in oklch, var(--btt-you) 70%, transparent))",
          }}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />
        <motion.div
          className="absolute inset-y-0 right-0"
          style={{
            background:
              "linear-gradient(to left, var(--btt-foe), color-mix(in oklch, var(--btt-foe) 70%, transparent))",
          }}
          animate={{ width: `${100 - pct}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />
        {/* Center marker, so "how far from winning" reads at a glance. */}
        <div className="absolute inset-y-0 left-1/2 w-px bg-foreground/40" aria-hidden="true" />
      </div>
    </div>
  );
}
