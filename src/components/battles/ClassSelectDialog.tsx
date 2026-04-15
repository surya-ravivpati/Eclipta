import { motion } from "framer-motion";
import { ARCHETYPES } from "./archetypes";
import type { ArchetypeId } from "./types";

const STAT_LABELS = ["ATK", "DEF", "SPD", "CMB"] as const;

export function ClassSelectDialog({ onSelect }: { onSelect: (id: ArchetypeId) => void }) {
  return (
    <motion.div
      className="glass-panel p-8"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <h3 className="text-xl font-bold font-display text-center mb-1">Choose Your Archetype</h3>
      <p className="text-xs text-muted-foreground text-center mb-6">Each class changes how you fight. Pick your strategy.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(Object.values(ARCHETYPES)).map((arch) => (
          <motion.button
            key={arch.id}
            onClick={() => onSelect(arch.id)}
            className={`glass-panel p-5 text-left border ${arch.borderColor} hover:bg-secondary/20 transition-colors group`}
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">{arch.emoji}</span>
              <div>
                <h4 className={`font-bold font-display text-sm ${arch.color}`}>{arch.name}</h4>
                <p className="text-[10px] text-muted-foreground tracking-widest font-bold">{arch.passive}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-3">{arch.description}</p>

            {/* Stat bars */}
            <div className="space-y-1.5">
              {(["attack", "defense", "speed", "combo"] as const).map((stat, i) => (
                <div key={stat} className="flex items-center gap-2">
                  <span className="text-[9px] font-bold tracking-widest text-muted-foreground w-7">{STAT_LABELS[i]}</span>
                  <div className="flex gap-0.5 flex-1">
                    {[1, 2, 3, 4].map(lvl => (
                      <div
                        key={lvl}
                        className={`h-1.5 flex-1 transition-colors ${
                          lvl <= arch.stats[stat] ? "bg-neon-purple" : "bg-secondary/30"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
