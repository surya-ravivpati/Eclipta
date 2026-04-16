import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import { ARCHETYPES } from "./archetypes";
import type { ArchetypeId } from "./types";
import { getUnlockedArchetypes, ROAD_NODES, PLAYER_XP } from "@/lib/trophy-road-data";
import { cn } from "@/lib/utils";

const STAT_LABELS = ["ATK", "DEF", "SPD", "CMB"] as const;

export function ClassSelectDialog({ onSelect }: { onSelect: (id: ArchetypeId) => void }) {
  const unlocked = getUnlockedArchetypes();
  const allArchetypes = Object.values(ARCHETYPES);

  return (
    <motion.div
      className="glass-panel p-8"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <h3 className="text-xl font-bold font-display text-center mb-1">Choose Your Archetype</h3>
      <p className="text-xs text-muted-foreground text-center mb-6">
        Unlock more archetypes by progressing on the Trophy Road.
        <span className="text-neon-purple font-bold ml-1">{unlocked.length}/{allArchetypes.length}</span> unlocked
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {allArchetypes.map((arch) => {
          const isUnlocked = unlocked.includes(arch.id);
          const monsterNode = ROAD_NODES.find(n => n.archetype === arch.id);
          const xpNeeded = monsterNode ? monsterNode.xp : 0;

          return (
            <motion.button
              key={arch.id}
              onClick={() => isUnlocked && onSelect(arch.id)}
              disabled={!isUnlocked}
              className={cn(
                "glass-panel p-5 text-left border transition-colors group relative overflow-hidden",
                isUnlocked
                  ? `${arch.borderColor} hover:bg-secondary/20 cursor-pointer`
                  : "border-border/30 opacity-50 cursor-not-allowed"
              )}
              whileHover={isUnlocked ? { scale: 1.02, y: -2 } : {}}
              whileTap={isUnlocked ? { scale: 0.98 } : {}}
            >
              {/* Locked overlay */}
              {!isUnlocked && (
                <div className="absolute inset-0 bg-background/40 backdrop-blur-[1px] z-10 flex flex-col items-center justify-center gap-1">
                  <Lock className="w-5 h-5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {xpNeeded.toLocaleString()} XP
                  </span>
                </div>
              )}

              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">{arch.emoji}</span>
                <div>
                  <h4 className={cn("font-bold font-display text-sm", isUnlocked ? arch.color : "text-muted-foreground")}>{arch.name}</h4>
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
                          className={cn(
                            "h-1.5 flex-1 transition-colors",
                            lvl <= arch.stats[stat]
                              ? isUnlocked ? "bg-neon-purple" : "bg-muted-foreground/30"
                              : "bg-secondary/30"
                          )}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}
