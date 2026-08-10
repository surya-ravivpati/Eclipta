import { motion } from "framer-motion";
import { GAME_MODE_LIST, type GameModeId } from "@/lib/battle-modes/types";

/**
 * Mode picker — the first step of the pre-battle flow, sitting between
 * "Enter the Arena" and the archetype picker. Battle mode stays the default
 * the rest of the flow was built around, so it renders first.
 *
 * There is no opponent-type toggle here because the player never chooses one —
 * `findMatch` runs a fixed Live → Ghost → Bot cascade and the actual opponent
 * is only known once it resolves. Picking a mode that does not support a live
 * opponent (everything but Battle, for now) tells matchmaking to skip that
 * tier rather than disabling anything up front — see `startBattle`.
 */
export function GameModeSelectDialog({ onSelect }: { onSelect: (mode: GameModeId) => void }) {
  return (
    <motion.div
      className="glass-panel p-8"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <h3 className="text-xl font-bold font-display text-center mb-1">Choose Your Format</h3>
      <p className="text-xs text-muted-foreground text-center mb-6">
        Every archetype's stats, defense and ultimate still decide the fight — only what a correct
        answer earns you changes.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {GAME_MODE_LIST.map((mode) => {
          const Icon = mode.icon;
          return (
            <motion.button
              key={mode.id}
              type="button"
              onClick={() => onSelect(mode.id)}
              className="glass-panel p-5 text-left border border-border hover:border-primary/50 hover:bg-secondary/20 cursor-pointer transition-colors"
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="flex items-center gap-3 mb-2">
                <Icon className="w-7 h-7 text-primary shrink-0" aria-hidden="true" />
                <div>
                  <h4 className="font-bold font-display text-sm">{mode.name}</h4>
                  <p className="text-[10px] text-muted-foreground tracking-widest">
                    {mode.tagline}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-2">{mode.description}</p>
              <ul className="space-y-0.5">
                {mode.effects.map((e) => (
                  <li key={e} className="text-[10px] text-muted-foreground/80 flex gap-1.5">
                    <span aria-hidden="true">·</span>
                    {e}
                  </li>
                ))}
              </ul>
              {mode.id !== "battle" && (
                <p className="mt-2 text-[9px] tracking-widest uppercase text-muted-foreground/60">
                  Bot &amp; ghost opponents only, for now
                </p>
              )}
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}
