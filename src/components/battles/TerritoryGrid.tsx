import { motion } from "framer-motion";
import { Flag } from "lucide-react";
import { GRID_SIZE, CENTER_INDEX, type TerritoryGrid as Grid } from "@/lib/battle-modes/territory";
import { cn } from "@/lib/utils";

/**
 * The 5×5 board. `awaitingPlacement` gates whether empty tiles are clickable —
 * outside of the brief window after a correct answer, the grid is a read-only
 * scoreboard.
 */
export function TerritoryGridView({
  grid,
  awaitingPlacement,
  onPlace,
  lastFlipped,
  placementWeight = 0,
  score,
}: {
  grid: Grid;
  awaitingPlacement: boolean;
  onPlace: (index: number) => void;
  /** Cells that just flipped, for a one-beat highlight. */
  lastFlipped: number[];
  /** Weight of the flag awaiting placement — a harder hit plants a heavier one. */
  placementWeight?: number;
  /** Running weighted tile count, so the board reads as a scoreboard too. */
  score?: { player: number; opponent: number };
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      {awaitingPlacement && (
        <motion.p
          className="text-[11px] font-bold tracking-widest text-primary uppercase"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          role="status"
        >
          {placementWeight > 1
            ? `Correct! Place your flag — worth ${placementWeight}`
            : "Correct! Place your flag."}
        </motion.p>
      )}
      {score && (
        <div className="flex items-center gap-3 text-[10px] font-bold tracking-widest">
          <span className="text-neon-cyan">YOU {score.player}</span>
          <span className="text-muted-foreground/50">·</span>
          <span className="text-neon-pink">{score.opponent} OPP</span>
        </div>
      )}
      <div
        role="grid"
        aria-label="Territory board"
        className="grid grid-cols-5 gap-1 p-2 rounded-xl border border-border bg-secondary/10"
      >
        {grid.map((owner, i) => {
          const clickable = awaitingPlacement && owner === "empty";
          const flipped = lastFlipped.includes(i);
          return (
            <button
              key={i}
              type="button"
              role="gridcell"
              disabled={!clickable}
              onClick={() => clickable && onPlace(i)}
              aria-label={
                owner === "empty"
                  ? `Empty tile${i === CENTER_INDEX ? ", center, worth extra" : ""}`
                  : `${owner === "player" ? "Your" : "Opponent's"} tile${i === CENTER_INDEX ? ", center" : ""}`
              }
              className={cn(
                "w-9 h-9 sm:w-11 sm:h-11 rounded-md border flex items-center justify-center transition-colors relative",
                owner === "player" && "bg-neon-cyan/25 border-neon-cyan/60",
                owner === "opponent" && "bg-neon-pink/25 border-neon-pink/60",
                owner === "empty" && "border-border/50 bg-transparent",
                i === CENTER_INDEX && owner === "empty" && "border-primary/50",
                clickable && "cursor-pointer hover:bg-primary/20 hover:border-primary",
                !clickable && owner === "empty" && "cursor-default",
              )}
            >
              {owner !== "empty" && (
                <motion.div
                  initial={flipped ? { scale: 0, rotate: -90 } : { scale: 1 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 18 }}
                >
                  <Flag
                    className={cn(
                      "w-4 h-4 sm:w-5 sm:h-5",
                      owner === "player" ? "text-neon-cyan" : "text-neon-pink",
                    )}
                    aria-hidden="true"
                  />
                </motion.div>
              )}
              {i === CENTER_INDEX && owner === "empty" && (
                <span className="w-1.5 h-1.5 rounded-full bg-primary/60" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { GRID_SIZE };
