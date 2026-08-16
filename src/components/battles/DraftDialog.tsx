import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUp, ArrowDown, Swords } from "lucide-react";
import { useOwnedEcliptars } from "@/hooks/use-player-xp";
import { ARCHETYPES } from "./archetypes";
import { ecliptarSpriteUrl, type Ecliptar } from "@/lib/ecliptars";
import {
  draftRoundCandidates,
  draftComplete,
  DRAFT_ROUNDS,
  DRAFT_CHOICES_PER_ROUND,
} from "@/lib/battle-modes/draft";
import { cn } from "@/lib/utils";

/**
 * Draft Battle's pre-match step: pick one of three offered Ecliptars, up to
 * three times, then set the order they'll fight in.
 *
 * Candidates are drawn only from what the player owns, and a round offers
 * fewer than three when fewer than three remain undrafted - never a padded
 * fake choice. A player who owns nothing yet is told so plainly rather than
 * shown an empty grid.
 */
export function DraftDialog({ onComplete }: { onComplete: (team: Ecliptar[]) => void }) {
  const { slugs: ownedSlugs, loading } = useOwnedEcliptars();
  const [drafted, setDrafted] = useState<Ecliptar[]>([]);
  const [ordering, setOrdering] = useState(false);

  const candidates = useMemo(
    () =>
      draftRoundCandidates(
        ownedSlugs ?? new Set(),
        drafted.map((e) => e.slug),
      ),
    [ownedSlugs, drafted],
  );

  function pick(e: Ecliptar) {
    const next = [...drafted, e];
    setDrafted(next);
    if (
      draftComplete(
        next.map((x) => x.slug),
        ownedSlugs ?? new Set(),
      )
    )
      setOrdering(true);
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= drafted.length) return;
    const next = [...drafted];
    const a = next[index];
    const b = next[target];
    if (!a || !b) return;
    next[index] = b;
    next[target] = a;
    setDrafted(next);
  }

  if (loading) {
    return (
      <motion.div
        className="glass-panel p-8 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <p className="text-sm text-muted-foreground">Loading your collection...</p>
      </motion.div>
    );
  }

  if ((ownedSlugs?.size ?? 0) === 0) {
    return (
      <motion.div
        className="glass-panel p-8 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <h3 className="text-xl font-bold font-display mb-2">No Ecliptars yet</h3>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Draft Battle picks from creatures you own. Claim your first Ecliptar on the Trophy Road,
          then come back and draft a team.
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="glass-panel p-8"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <AnimatePresence mode="wait">
        {!ordering ? (
          <motion.div
            key="draft"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <h3 className="text-xl font-bold font-display text-center mb-1">
              Round {Math.min(drafted.length + 1, DRAFT_ROUNDS)} of {DRAFT_ROUNDS}
            </h3>
            <p className="text-xs text-muted-foreground text-center mb-6">
              Pick one Ecliptar to add to your team.
              {candidates.length < DRAFT_CHOICES_PER_ROUND &&
                ` Only ${candidates.length} of your owned Ecliptars are left to offer.`}
            </p>

            {drafted.length > 0 && (
              <div className="flex items-center justify-center gap-2 mb-6">
                {drafted.map((e) => (
                  <div
                    key={e.slug}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-full border border-border"
                  >
                    <e.icon className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold">{e.name}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {candidates.map((e) => {
                const arch = ARCHETYPES[e.archetype];
                return (
                  <motion.button
                    key={e.slug}
                    type="button"
                    onClick={() => pick(e)}
                    className={cn(
                      "glass-panel p-4 text-center border transition-colors cursor-pointer",
                      arch.borderColor,
                      "hover:bg-secondary/20",
                    )}
                    whileHover={{ scale: 1.03, y: -2 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <img
                      src={ecliptarSpriteUrl(e.slug)}
                      alt=""
                      aria-hidden="true"
                      className="h-16 w-auto mx-auto mb-2 object-contain"
                      onError={(ev) => {
                        ev.currentTarget.style.display = "none";
                      }}
                    />
                    <h4 className={cn("font-bold font-display text-sm", arch.color)}>{e.name}</h4>
                    <p className="text-[10px] text-muted-foreground tracking-widest">{arch.name}</p>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="order"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <h3 className="text-xl font-bold font-display text-center mb-1">Set Your Order</h3>
            <p className="text-xs text-muted-foreground text-center mb-6">
              Your team fights in this order - lose one, and the next steps in.
            </p>
            <ul className="space-y-2 max-w-sm mx-auto mb-6">
              {drafted.map((e, i) => {
                const arch = ARCHETYPES[e.archetype];
                return (
                  <li
                    key={e.slug}
                    className={cn(
                      "flex items-center gap-3 p-3 glass-panel border",
                      arch.borderColor,
                    )}
                  >
                    <span className="text-xs font-mono text-muted-foreground w-4">{i + 1}</span>
                    <e.icon className={cn("w-5 h-5", arch.color)} />
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm font-bold truncate", arch.color)}>{e.name}</p>
                      <p className="text-[10px] text-muted-foreground">{arch.name}</p>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                        aria-label={`Move ${e.name} earlier`}
                        className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 active:scale-[0.97]"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        disabled={i === drafted.length - 1}
                        onClick={() => move(i, 1)}
                        aria-label={`Move ${e.name} later`}
                        className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 active:scale-[0.97]"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="text-center">
              <motion.button
                type="button"
                onClick={() => onComplete(drafted)}
                className="inline-flex items-center gap-2 px-8 py-3 rounded-full font-bold text-sm bg-primary text-primary-foreground"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
              >
                <Swords className="w-4 h-4" aria-hidden="true" />
                Begin Draft Battle
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
