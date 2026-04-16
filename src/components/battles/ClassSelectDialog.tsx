import { motion } from "framer-motion";
import { Lock, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { ARCHETYPES } from "./archetypes";
import type { ArchetypeId } from "./types";
import { getUnlockedArchetypes, ROAD_NODES } from "@/lib/trophy-road-data";
import { cn } from "@/lib/utils";
import { useOwnedEcliptars, usePlayerXp } from "@/hooks/use-player-xp";
import { getEcliptarsByArchetype, type Ecliptar } from "@/lib/ecliptars";
import { Link } from "@tanstack/react-router";

const STAT_LABELS: { key: "health" | "time" | "damage" | "multiplier" | "difficulty"; label: string }[] = [
  { key: "health", label: "HP" },
  { key: "time", label: "TIME" },
  { key: "damage", label: "DMG" },
  { key: "multiplier", label: "MULT" },
  { key: "difficulty", label: "DIFF" },
];

export interface ClassSelection {
  archetype: ArchetypeId;
  ecliptar: Ecliptar;
}

export function ClassSelectDialog({ onSelect }: { onSelect: (sel: ClassSelection) => void }) {
  const { xp } = usePlayerXp();
  const { slugs: ownedSlugs } = useOwnedEcliptars();
  const unlocked = getUnlockedArchetypes(xp);
  const allArchetypes = Object.values(ARCHETYPES);
  const [pickedArch, setPickedArch] = useState<ArchetypeId | null>(null);

  // Step 2: Ecliptar select
  if (pickedArch) {
    const arch = ARCHETYPES[pickedArch];
    const ecliptars = getEcliptarsByArchetype(pickedArch);
    const ownedEcliptars = ecliptars.filter((e) => ownedSlugs.has(e.slug));

    return (
      <motion.div
        className="glass-panel p-8"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <button
          onClick={() => setPickedArch(null)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ArrowLeft className="w-3 h-3" /> Back to archetypes
        </button>

        <div className="flex items-center gap-3 mb-6">
          <span className="text-4xl">{arch.emoji}</span>
          <div>
            <h3 className="text-xl font-bold font-display">{arch.name}</h3>
            <p className={cn("text-xs font-bold tracking-widest", arch.color)}>CHOOSE YOUR ECLIPTAR</p>
          </div>
        </div>

        {ownedEcliptars.length === 0 ? (
          <div className="text-center py-10">
            <Lock className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-2">No Ecliptars unlocked for this archetype yet.</p>
            <p className="text-xs text-muted-foreground mb-4">
              Visit the Trophy Road and claim the {arch.name} reward to unlock its Ecliptars.
            </p>
            <Link
              to="/progress"
              className="inline-block px-4 py-2 bg-neon-purple text-primary-foreground text-xs font-bold tracking-widest hover:opacity-90 transition-opacity"
            >
              GO TO TROPHY ROAD
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {ecliptars.map((e) => {
              const isOwned = ownedSlugs.has(e.slug);
              return (
                <motion.button
                  key={e.slug}
                  disabled={!isOwned}
                  onClick={() => isOwned && onSelect({ archetype: pickedArch, ecliptar: e })}
                  className={cn(
                    "glass-panel p-5 text-left border transition-colors relative overflow-hidden",
                    isOwned
                      ? `${arch.borderColor} hover:bg-secondary/20 cursor-pointer`
                      : "border-border/30 opacity-50 cursor-not-allowed"
                  )}
                  whileHover={isOwned ? { scale: 1.03, y: -2 } : {}}
                  whileTap={isOwned ? { scale: 0.97 } : {}}
                >
                  {!isOwned && (
                    <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] z-10 flex items-center justify-center">
                      <Lock className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="text-4xl mb-2">{e.avatar}</div>
                  <h4 className={cn("font-bold font-display text-base", isOwned ? arch.color : "text-muted-foreground")}>
                    {e.name}
                  </h4>
                  <p className="text-[10px] text-muted-foreground tracking-widest mt-0.5">
                    {arch.name.toUpperCase()}
                  </p>
                </motion.button>
              );
            })}
          </div>
        )}
      </motion.div>
    );
  }

  // Step 1: Archetype select
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
          const ownedCount = getEcliptarsByArchetype(arch.id).filter(e => ownedSlugs.has(e.slug)).length;

          return (
            <motion.button
              key={arch.id}
              onClick={() => isUnlocked && setPickedArch(arch.id)}
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
              {!isUnlocked && (
                <div className="absolute inset-0 bg-background/40 backdrop-blur-[1px] z-10 flex flex-col items-center justify-center gap-1">
                  <Lock className="w-5 h-5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {xpNeeded.toLocaleString()} XP
                  </span>
                </div>
              )}

              {isUnlocked && (
                <div className="absolute top-2 right-2 z-10 px-1.5 py-0.5 text-[9px] font-bold tracking-widest rounded-full bg-secondary/60 text-foreground">
                  {ownedCount}/2 ECLIPTARS
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
                {STAT_LABELS.map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-[9px] font-bold tracking-widest text-muted-foreground w-8">{label}</span>
                    <div className="flex gap-0.5 flex-1">
                      {[1, 2, 3, 4].map(lvl => (
                        <div
                          key={lvl}
                          className={cn(
                            "h-1.5 flex-1 transition-colors",
                            lvl <= arch.stats[key]
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
